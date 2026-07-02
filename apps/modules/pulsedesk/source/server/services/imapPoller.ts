import { db } from "../db";
import { emailSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { storage } from "../storage";
import { decryptSecret } from "../auth/crypto";
import { fetchUnseenEmails, markMessagesSeen, type ImapConfig } from "./imapClient";
import { processInboundEmail } from "./emailProcessor";
import { isOperatorOsFeatureEnabledForOrg } from "./operatorosEntitlements";

const MAX_CONSECUTIVE_FAILURES = 5;
const BACKOFF_BASE_MS = 30_000;
const MIN_POLL_INTERVAL_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 120_000;

interface TenantPoller {
  orgId: string;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastPollAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  disabled: boolean;
  version: number;
}

const pollers = new Map<string, TenantPoller>();
let initialized = false;
let migratedOrgIds: Set<string> = new Set();

export function setMigratedOrgFilter(orgIds: Set<string>) {
  migratedOrgIds = orgIds;
}

export function getPollerStatus(): Array<{
  orgId: string;
  running: boolean;
  lastPollAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  disabled: boolean;
}> {
  return Array.from(pollers.values()).map(p => ({
    orgId: p.orgId,
    running: p.running,
    lastPollAt: p.lastPollAt,
    lastError: p.lastError,
    consecutiveFailures: p.consecutiveFailures,
    disabled: p.disabled,
  }));
}

export function getPollerStatusForOrg(orgId: string) {
  const p = pollers.get(orgId);
  if (!p) return null;
  return {
    orgId: p.orgId,
    running: p.running,
    lastPollAt: p.lastPollAt,
    lastError: p.lastError,
    consecutiveFailures: p.consecutiveFailures,
    disabled: p.disabled,
  };
}

export async function startImapPolling() {
  if (initialized) return;
  initialized = true;
  console.log("[imap-poller] Initializing IMAP polling service...");

  try {
    const allSettings = await db.select().from(emailSettings);

    for (const settings of allSettings) {
      if (!settings.imapEnabled || !settings.imapHost || !settings.imapUser || !settings.imapPasswordEncrypted) {
        continue;
      }

      if (migratedOrgIds.has(settings.orgId)) {
        console.log(`[imap-poller] Skipping org ${settings.orgId} (migrated to connector system)`);
        continue;
      }

      const org = await storage.getOrg(settings.orgId);
      if (!org) continue;

      const emailToTicketEnabled = await isOperatorOsFeatureEnabledForOrg(settings.orgId, "emailToTicket");
      if (!emailToTicketEnabled) continue;

      startPollerForOrg(settings.orgId, settings);
    }

    console.log(`[imap-poller] Started ${pollers.size} tenant pollers`);
  } catch (err: any) {
    console.error("[imap-poller] Failed to initialize:", err.message);
  }
}

export function startPollerForOrg(orgId: string, settings: any) {
  stopPollerForOrg(orgId);

  const poller: TenantPoller = {
    orgId,
    timer: null,
    running: false,
    lastPollAt: settings.imapLastPolledAt || null,
    lastError: settings.imapLastError || null,
    consecutiveFailures: settings.imapConsecutiveFailures || 0,
    disabled: false,
    version: Date.now(),
  };

  if (poller.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    poller.disabled = true;
    poller.lastError = `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`;
    pollers.set(orgId, poller);
    console.log(`[imap-poller] Org ${orgId} auto-disabled due to ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
    return;
  }

  pollers.set(orgId, poller);
  schedulePoll(orgId, poller.version, settings.imapPollIntervalSeconds);
  console.log(`[imap-poller] Started poller for org ${orgId}`);
}

export function stopPollerForOrg(orgId: string) {
  const existing = pollers.get(orgId);
  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    existing.version = -1;
    pollers.delete(orgId);
    console.log(`[imap-poller] Stopped poller for org ${orgId}`);
  }
}

export async function resetPollerForOrg(orgId: string) {
  const [settings] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, orgId));
  if (!settings) return;

  await db.update(emailSettings).set({
    imapConsecutiveFailures: 0,
    imapLastError: null,
    updatedAt: new Date(),
  }).where(eq(emailSettings.orgId, orgId));

  if (settings.imapEnabled && settings.imapHost && settings.imapUser && settings.imapPasswordEncrypted) {
    settings.imapConsecutiveFailures = 0;
    settings.imapLastError = null;
    startPollerForOrg(orgId, settings);
  }
}

function schedulePoll(orgId: string, expectedVersion: number, pollIntervalSeconds?: number | null) {
  const poller = pollers.get(orgId);
  if (!poller || poller.disabled || poller.version !== expectedVersion) return;

  let intervalMs: number;

  if (poller.consecutiveFailures > 0) {
    intervalMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, poller.consecutiveFailures - 1),
      10 * 60 * 1000
    );
  } else {
    intervalMs = (pollIntervalSeconds && pollIntervalSeconds >= 60)
      ? pollIntervalSeconds * 1000
      : DEFAULT_POLL_INTERVAL_MS;
  }

  intervalMs = Math.max(intervalMs, MIN_POLL_INTERVAL_MS);

  poller.timer = setTimeout(() => executePoll(orgId, expectedVersion), intervalMs);
}

async function executePoll(orgId: string, expectedVersion: number) {
  const poller = pollers.get(orgId);
  if (!poller || poller.running || poller.disabled || poller.version !== expectedVersion) return;

  poller.running = true;

  try {
    const [settings] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, orgId));

    if (!settings || !settings.imapEnabled || !settings.imapHost || !settings.imapUser || !settings.imapPasswordEncrypted) {
      stopPollerForOrg(orgId);
      return;
    }

    if (!settings.enabled) {
      stopPollerForOrg(orgId);
      return;
    }

    const org = await storage.getOrg(orgId);
    if (!org) {
      stopPollerForOrg(orgId);
      return;
    }

    const emailToTicketEnabled = await isOperatorOsFeatureEnabledForOrg(orgId, "emailToTicket");
    if (!emailToTicketEnabled) {
      stopPollerForOrg(orgId);
      return;
    }

    let password: string;
    try {
      password = decryptSecret(settings.imapPasswordEncrypted);
    } catch (decryptErr: any) {
      poller.lastError = "Failed to decrypt IMAP password";
      poller.consecutiveFailures++;
      await updatePollerState(orgId, poller);
      poller.running = false;
      checkAutoDisable(orgId, poller);
      return;
    }

    const config: ImapConfig = {
      host: settings.imapHost,
      port: settings.imapPort || 993,
      user: settings.imapUser,
      password,
      tls: settings.imapTls,
      folder: settings.imapFolder || "INBOX",
    };

    const fetched = await fetchUnseenEmails(config, settings.inboundAlias);

    const successfulUids: number[] = [];
    let processed = 0;
    for (const { uid, email } of fetched) {
      try {
        await processInboundEmail(email);
        successfulUids.push(uid);
        processed++;
      } catch (procErr: any) {
        console.error(`[imap-poller] Error processing email UID ${uid} for org ${orgId}:`, procErr.message);
      }
    }

    if (successfulUids.length > 0) {
      try {
        await markMessagesSeen(config, successfulUids);
      } catch (markErr: any) {
        console.error(`[imap-poller] Error marking messages seen for org ${orgId}:`, markErr.message);
      }
    }

    poller.lastPollAt = new Date();
    poller.lastError = null;
    poller.consecutiveFailures = 0;
    await updatePollerState(orgId, poller, processed);

    if (processed > 0) {
      console.log(`[imap-poller] Org ${orgId}: processed ${processed}/${fetched.length} emails`);
    }
  } catch (err: any) {
    console.error(`[imap-poller] Poll error for org ${orgId}:`, err.message);
    poller.lastError = err.message || "Poll failed";
    poller.consecutiveFailures++;
    await updatePollerState(orgId, poller);
    checkAutoDisable(orgId, poller);
  } finally {
    poller.running = false;
    const current = pollers.get(orgId);
    if (current && current.version === expectedVersion && !current.disabled) {
      const [settings] = await db.select({ interval: emailSettings.imapPollIntervalSeconds }).from(emailSettings).where(eq(emailSettings.orgId, orgId)).catch(() => [{ interval: null }]);
      schedulePoll(orgId, expectedVersion, settings?.interval);
    }
  }
}

async function updatePollerState(orgId: string, poller: TenantPoller, processedCount?: number) {
  try {
    const updateData: any = {
      imapLastPolledAt: poller.lastPollAt,
      imapLastError: poller.lastError,
      imapConsecutiveFailures: poller.consecutiveFailures,
      updatedAt: new Date(),
    };

    if (processedCount && processedCount > 0) {
      updateData.imapEmailsProcessed = sql`imap_emails_processed + ${processedCount}`;
    }

    await db.update(emailSettings)
      .set(updateData)
      .where(eq(emailSettings.orgId, orgId));
  } catch (err: any) {
    console.error(`[imap-poller] Failed to update state for org ${orgId}:`, err.message);
  }
}

function checkAutoDisable(orgId: string, poller: TenantPoller) {
  if (poller.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    poller.disabled = true;
    poller.lastError = `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Last error: ${poller.lastError}`;
    console.warn(`[imap-poller] Auto-disabled poller for org ${orgId} after ${MAX_CONSECUTIVE_FAILURES} failures`);

    db.update(emailSettings)
      .set({
        imapEnabled: false,
        imapLastError: poller.lastError,
        imapConsecutiveFailures: poller.consecutiveFailures,
        updatedAt: new Date(),
      })
      .where(eq(emailSettings.orgId, orgId))
      .catch(err => console.error(`[imap-poller] Failed to auto-disable in DB:`, err.message));
  }
}

export async function forcePollForOrg(orgId: string): Promise<{ success: boolean; error?: string }> {
  const [settings] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, orgId));
  if (!settings || !settings.imapHost || !settings.imapUser || !settings.imapPasswordEncrypted) {
    return { success: false, error: "IMAP not configured for this organization" };
  }

  let password: string;
  try {
    password = decryptSecret(settings.imapPasswordEncrypted);
  } catch {
    return { success: false, error: "Failed to decrypt IMAP password" };
  }

  const config: ImapConfig = {
    host: settings.imapHost,
    port: settings.imapPort || 993,
    user: settings.imapUser,
    password,
    tls: settings.imapTls,
    folder: settings.imapFolder || "INBOX",
  };

  try {
    const { fetchUnseenEmails: fetchFn, markMessagesSeen: markFn } = await import("./imapClient");
    const fetched = await fetchFn(config, settings.inboundAlias);

    const successfulUids: number[] = [];
    let processed = 0;
    const errors: string[] = [];
    for (const { uid, email } of fetched) {
      try {
        await processInboundEmail(email);
        successfulUids.push(uid);
        processed++;
      } catch (procErr: any) {
        errors.push(`UID ${uid}: ${procErr.message || "unknown error"}`);
        console.error(`[imap-poller] Force-poll error processing UID ${uid} for org ${orgId}:`, procErr.message);
      }
    }

    if (successfulUids.length > 0) {
      try { await markFn(config, successfulUids); } catch (markErr: any) {
        console.error(`[imap-poller] Force-poll error marking seen for org ${orgId}:`, markErr.message);
      }
    }

    if (processed > 0) {
      await db.update(emailSettings).set({
        imapLastPolledAt: new Date(),
        imapLastError: null,
        imapEmailsProcessed: sql`imap_emails_processed + ${processed}`,
        updatedAt: new Date(),
      }).where(eq(emailSettings.orgId, orgId));
    } else {
      await db.update(emailSettings).set({
        imapLastPolledAt: new Date(),
        imapLastError: null,
        updatedAt: new Date(),
      }).where(eq(emailSettings.orgId, orgId));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Force poll failed" };
  }
}

export async function disablePollerForOrg(orgId: string): Promise<void> {
  stopPollerForOrg(orgId);
  await db.update(emailSettings).set({
    imapEnabled: false,
    imapLastError: "Disabled by super admin",
    updatedAt: new Date(),
  }).where(eq(emailSettings.orgId, orgId));
}

export function stopAllPollers() {
  for (const [orgId] of pollers) {
    stopPollerForOrg(orgId);
  }
  initialized = false;
}
