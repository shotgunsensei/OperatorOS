import { db } from "../db";
import { mailConnectors, connectorEvents, emailSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

function connectorWhere(id: string) {
  return sql`${mailConnectors.id} = ${id}`;
}
import { storage } from "../storage";
import { decryptSecret, encryptSecret } from "../auth/crypto";
import { getConnectorService } from "./connectors/registry";
import type { ConnectorCredentials, ConnectorProvider, OAuthAppCredentials } from "./connectors/types";
import { isOperatorOsFeatureEnabledForOrg } from "./operatorosEntitlements";

function extractGoogleAppCreds(settings: any): OAuthAppCredentials | null {
  if (!settings?.googleClientId || !settings?.googleClientSecretEncrypted) return null;
  try { return { clientId: settings.googleClientId, clientSecret: decryptSecret(settings.googleClientSecretEncrypted) }; } catch { return null; }
}

function extractMicrosoftAppCreds(settings: any): OAuthAppCredentials | null {
  if (!settings?.microsoftClientId || !settings?.microsoftClientSecretEncrypted) return null;
  try { return { clientId: settings.microsoftClientId, clientSecret: decryptSecret(settings.microsoftClientSecretEncrypted) }; } catch { return null; }
}
import { processInboundEmail } from "./emailProcessor";

const MAX_CONSECUTIVE_FAILURES = 5;
const BACKOFF_BASE_MS = 30_000;
const MIN_POLL_INTERVAL_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 120_000;

interface ConnectorPollerState {
  connectorId: string;
  orgId: string;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastPollAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  disabled: boolean;
  version: number;
}

const pollers = new Map<string, ConnectorPollerState>();
let initialized = false;

export function getConnectorPollerStatus(): Array<{
  connectorId: string;
  orgId: string;
  running: boolean;
  lastPollAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  disabled: boolean;
}> {
  return Array.from(pollers.values()).map(p => ({
    connectorId: p.connectorId,
    orgId: p.orgId,
    running: p.running,
    lastPollAt: p.lastPollAt,
    lastError: p.lastError,
    consecutiveFailures: p.consecutiveFailures,
    disabled: p.disabled,
  }));
}

export function getConnectorPollerStatusById(connectorId: string) {
  const p = pollers.get(connectorId);
  if (!p) return null;
  return {
    connectorId: p.connectorId,
    orgId: p.orgId,
    running: p.running,
    lastPollAt: p.lastPollAt,
    lastError: p.lastError,
    consecutiveFailures: p.consecutiveFailures,
    disabled: p.disabled,
  };
}

function decryptCredentials(encrypted: string): ConnectorCredentials {
  const json = decryptSecret(encrypted);
  return JSON.parse(json);
}

export async function startConnectorPolling() {
  if (initialized) return;
  initialized = true;
  console.log("[connector-poller] Initializing connector polling service...");

  try {
    const allConnectors = await db.select().from(mailConnectors);

    for (const connector of allConnectors) {
      if (!connector.enabled || connector.status === "disabled" || connector.status === "pending_auth") {
        continue;
      }

      if (connector.provider === "forwarding") continue;

      const org = await storage.getOrg(connector.orgId);
      if (!org) continue;

      const emailToTicketEnabled = await isOperatorOsFeatureEnabledForOrg(connector.orgId, "emailToTicket");
      if (!emailToTicketEnabled) continue;

      startPollerForConnector(connector);
    }

    console.log(`[connector-poller] Started ${pollers.size} connector pollers`);
  } catch (err: unknown) {
    console.error("[connector-poller] Failed to initialize:", err instanceof Error ? err.message : "Unknown error");
  }
}

export function startPollerForConnector(connector: { id: string; orgId: string; consecutiveFailures: number; lastPolledAt: Date | null; lastError: string | null; pollIntervalSeconds: number | null }) {
  stopPollerForConnector(connector.id);

  const state: ConnectorPollerState = {
    connectorId: connector.id,
    orgId: connector.orgId,
    timer: null,
    running: false,
    lastPollAt: connector.lastPolledAt || null,
    lastError: connector.lastError || null,
    consecutiveFailures: connector.consecutiveFailures || 0,
    disabled: false,
    version: Date.now(),
  };

  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    state.disabled = true;
    state.lastError = `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`;
    pollers.set(connector.id, state);
    console.log(`[connector-poller] Connector ${connector.id} auto-disabled due to ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
    db.update(mailConnectors).set({
      status: "error",
      enabled: false,
      lastError: state.lastError,
      updatedAt: new Date(),
    }).where(connectorWhere(connector.id))
      .catch(err => console.error(`[connector-poller] Failed to persist auto-disable:`, err.message));
    return;
  }

  pollers.set(connector.id, state);
  schedulePoll(connector.id, state.version, connector.pollIntervalSeconds);
  console.log(`[connector-poller] Started poller for connector ${connector.id}`);
}

export function stopPollerForConnector(connectorId: string) {
  const existing = pollers.get(connectorId);
  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    existing.version = -1;
    pollers.delete(connectorId);
  }
}

function schedulePoll(connectorId: string, expectedVersion: number, pollIntervalSeconds?: number | null) {
  const state = pollers.get(connectorId);
  if (!state || state.disabled || state.version !== expectedVersion) return;

  let intervalMs: number;
  if (state.consecutiveFailures > 0) {
    intervalMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, state.consecutiveFailures - 1),
      10 * 60 * 1000,
    );
  } else {
    intervalMs = (pollIntervalSeconds && pollIntervalSeconds >= 60)
      ? pollIntervalSeconds * 1000
      : DEFAULT_POLL_INTERVAL_MS;
  }
  intervalMs = Math.max(intervalMs, MIN_POLL_INTERVAL_MS);

  state.timer = setTimeout(() => executePoll(connectorId, expectedVersion), intervalMs);
}

async function executePoll(connectorId: string, expectedVersion: number) {
  const state = pollers.get(connectorId);
  if (!state || state.running || state.disabled || state.version !== expectedVersion) return;

  state.running = true;

  try {
    const [connector] = await db.select().from(mailConnectors).where(connectorWhere(connectorId));
    if (!connector || !connector.enabled || connector.status === "disabled" || connector.status === "pending_auth") {
      stopPollerForConnector(connectorId);
      return;
    }

    if (connector.provider === "forwarding") {
      stopPollerForConnector(connectorId);
      return;
    }

    const org = await storage.getOrg(connector.orgId);
    if (!org) { stopPollerForConnector(connectorId); return; }

    const emailToTicketEnabled = await isOperatorOsFeatureEnabledForOrg(connector.orgId, "emailToTicket");
    if (!emailToTicketEnabled) { stopPollerForConnector(connectorId); return; }

    if (!connector.credentialsEncrypted) {
      state.lastError = "No credentials configured";
      state.consecutiveFailures++;
      await updateConnectorState(connectorId, state);
      checkAutoDisable(connectorId, state);
      state.running = false;
      return;
    }

    let credentials: ConnectorCredentials;
    try {
      credentials = decryptCredentials(connector.credentialsEncrypted);
    } catch {
      state.lastError = "Failed to decrypt credentials";
      state.consecutiveFailures++;
      await updateConnectorState(connectorId, state);
      checkAutoDisable(connectorId, state);
      state.running = false;
      return;
    }

    const service = getConnectorService(connector.provider as ConnectorProvider);

    const [settings] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, connector.orgId));

    if (service.refreshCredentials) {
      let pollAppCreds: OAuthAppCredentials | null = null;
      if (connector.provider === "google") pollAppCreds = extractGoogleAppCreds(settings);
      else if (connector.provider === "microsoft") pollAppCreds = extractMicrosoftAppCreds(settings);

      try {
        const refreshed = await service.refreshCredentials(connector, credentials, pollAppCreds);
        if (refreshed && refreshed.accessToken !== credentials.accessToken) {
          credentials = refreshed;
          await db.update(mailConnectors).set({
            credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
            updatedAt: new Date(),
          }).where(connectorWhere(connectorId));
          logConnectorEvent(connectorId, connector.orgId, "auth_success", "Token refreshed successfully");
        }
      } catch (refreshErr: any) {
        logConnectorEvent(connectorId, connector.orgId, "auth_error", `Token refresh failed: ${refreshErr.message}`);
        throw refreshErr;
      }
    }
    const inboundAlias = settings?.inboundAlias || connector.orgId;

    const fetched = await service.fetchEmails(connector, credentials, inboundAlias);

    const successfulUids: (number | string)[] = [];
    let processed = 0;
    for (const { uid, email } of fetched) {
      try {
        await processInboundEmail(email, connectorId);
        successfulUids.push(uid);
        processed++;
      } catch (procErr: any) {
        console.error(`[connector-poller] Error processing email UID ${uid} for connector ${connectorId}:`, procErr.message);
      }
    }

    if (successfulUids.length > 0) {
      try {
        await service.markProcessed(connector, credentials, successfulUids);
      } catch (markErr: any) {
        console.error(`[connector-poller] Error marking processed for connector ${connectorId}:`, markErr.message);
      }
    }

    state.lastPollAt = new Date();
    state.lastError = null;
    state.consecutiveFailures = 0;
    await updateConnectorState(connectorId, state, processed);

    if (connector.status !== "active") {
      await db.update(mailConnectors).set({ status: "active", updatedAt: new Date() }).where(connectorWhere(connectorId));
    }

    if (processed > 0) {
      console.log(`[connector-poller] Connector ${connectorId}: processed ${processed}/${fetched.length} emails`);
    }
    logConnectorEvent(connectorId, state.orgId, "poll_success", `Polled successfully, ${processed} emails processed`, { fetched: fetched.length, processed });
  } catch (err: any) {
    console.error(`[connector-poller] Poll error for connector ${connectorId}:`, err.message);
    state.lastError = err.message || "Poll failed";
    state.consecutiveFailures++;
    await updateConnectorState(connectorId, state);
    logConnectorEvent(connectorId, state.orgId, "poll_error", err.message || "Poll failed", { consecutiveFailures: state.consecutiveFailures });
    checkAutoDisable(connectorId, state);
  } finally {
    state.running = false;
    const current = pollers.get(connectorId);
    if (current && current.version === expectedVersion && !current.disabled) {
      const [conn] = await db.select({ interval: mailConnectors.pollIntervalSeconds }).from(mailConnectors).where(connectorWhere(connectorId)).catch(() => [{ interval: null }]);
      schedulePoll(connectorId, expectedVersion, conn?.interval);
    }
  }
}

async function updateConnectorState(connectorId: string, state: ConnectorPollerState, processedCount?: number) {
  try {
    const updateData: any = {
      lastPolledAt: state.lastPollAt,
      lastError: state.lastError,
      consecutiveFailures: state.consecutiveFailures,
      updatedAt: new Date(),
    };

    if (processedCount && processedCount > 0) {
      updateData.emailsProcessed = sql`emails_processed + ${processedCount}`;
    }

    await db.update(mailConnectors).set(updateData).where(connectorWhere(connectorId));
  } catch (err: any) {
    console.error(`[connector-poller] Failed to update state for connector ${connectorId}:`, err.message);
  }
}

function checkAutoDisable(connectorId: string, state: ConnectorPollerState) {
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    state.disabled = true;
    state.lastError = `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Last error: ${state.lastError}`;
    console.warn(`[connector-poller] Auto-disabled connector ${connectorId} after ${MAX_CONSECUTIVE_FAILURES} failures`);

    db.update(mailConnectors)
      .set({
        status: "error",
        enabled: false,
        lastError: state.lastError,
        consecutiveFailures: state.consecutiveFailures,
        updatedAt: new Date(),
      })
      .where(connectorWhere(connectorId))
      .catch(err => console.error(`[connector-poller] Failed to auto-disable in DB:`, err.message));

    logConnectorEvent(connectorId, state.orgId, "disabled", state.lastError || "Auto-disabled");
  }
}

type ConnectorEventType = "poll_success" | "poll_error" | "auth_success" | "auth_error" | "disabled" | "enabled" | "config_changed";

async function logConnectorEvent(connectorId: string, orgId: string, eventType: ConnectorEventType, message: string, metadata?: Record<string, unknown> | null) {
  try {
    await db.insert(connectorEvents).values({
      connectorId,
      orgId,
      eventType,
      message,
      metadata: metadata || null,
    });
  } catch (err: unknown) {
    console.error(`[connector-poller] Failed to log event:`, err instanceof Error ? err.message : "Unknown error");
  }
}

export async function forcePollConnector(connectorId: string): Promise<{ success: boolean; error?: string; processed?: number }> {
  const [connector] = await db.select().from(mailConnectors).where(connectorWhere(connectorId));
  if (!connector) return { success: false, error: "Connector not found" };
  if (connector.status === "disabled") return { success: false, error: "Connector is disabled" };
  if (connector.status === "pending_auth") return { success: false, error: "Connector requires authentication" };
  if (!connector.enabled) return { success: false, error: "Connector is not enabled" };
  if (!connector.credentialsEncrypted) return { success: false, error: "No credentials configured" };
  if (connector.provider === "forwarding") return { success: false, error: "Forwarding connectors do not poll" };

  let credentials: ConnectorCredentials;
  try {
    credentials = decryptCredentials(connector.credentialsEncrypted);
  } catch {
    return { success: false, error: "Failed to decrypt credentials" };
  }

  const service = getConnectorService(connector.provider as ConnectorProvider);

  try {
    if (service.refreshCredentials) {
      const refreshed = await service.refreshCredentials(connector, credentials);
      if (refreshed) credentials = refreshed;
    }

    const [settings] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, connector.orgId));
    const inboundAlias = settings?.inboundAlias || connector.orgId;

    const fetched = await service.fetchEmails(connector, credentials, inboundAlias);

    const successfulUids: (number | string)[] = [];
    let processed = 0;
    for (const { uid, email } of fetched) {
      try {
        await processInboundEmail(email, connectorId);
        successfulUids.push(uid);
        processed++;
      } catch (procErr: any) {
        console.error(`[connector-poller] Force-poll error processing UID ${uid}:`, procErr.message);
      }
    }

    if (successfulUids.length > 0) {
      try { await service.markProcessed(connector, credentials, successfulUids); } catch {}
    }

    await db.update(mailConnectors).set({
      lastPolledAt: new Date(),
      lastError: null,
      consecutiveFailures: 0,
      emailsProcessed: sql`emails_processed + ${processed}`,
      updatedAt: new Date(),
    }).where(connectorWhere(connectorId));

    return { success: true, processed };
  } catch (err: any) {
    return { success: false, error: err.message || "Force poll failed" };
  }
}

export function stopAllConnectorPollers() {
  for (const [id] of pollers) {
    stopPollerForConnector(id);
  }
  initialized = false;
}
