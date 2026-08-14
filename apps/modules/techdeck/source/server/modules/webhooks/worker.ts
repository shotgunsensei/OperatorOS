import crypto from "crypto";
import { eventBus } from "../../core/events/bus";
import type { VaultEvent } from "../../core/events/types";
import { storage } from "../../storage";
import { validateWebhookUrl, MAX_WEBHOOK_PAYLOAD_BYTES, WEBHOOK_TIMEOUT_MS, MAX_WEBHOOK_RETRIES } from "./urlValidation";

function signPayload(secret: string, timestamp: string, body: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

async function enqueueDeliveries(event: VaultEvent): Promise<void> {
  try {
    const endpoints = await storage.getEnabledWebhooksForEvent(event.tenantId, event.type);
    if (endpoints.length === 0) return;

    const payload = {
      event: event.type,
      tenantId: event.tenantId,
      actorUserId: event.actorUserId,
      entityType: event.entityType,
      entityId: event.entityId,
      details: event.details,
      timestamp: event.timestamp.toISOString(),
    };

    for (const ep of endpoints) {
      await storage.createWebhookDelivery({
        tenantId: event.tenantId,
        webhookEndpointId: ep.id,
        eventType: event.type,
        payload,
        status: "pending",
        attempts: 0,
        maxAttempts: MAX_WEBHOOK_RETRIES,
      });
    }
  } catch (err) {
    console.error(`[webhook-worker] Failed to enqueue deliveries for ${event.type}:`, err);
  }
}

async function processDelivery(delivery: any): Promise<void> {
  const endpoint = await storage.getWebhookEndpointById(delivery.tenantId, delivery.webhookEndpointId);
  if (!endpoint || !endpoint.enabled) {
    await storage.updateWebhookDelivery(delivery.id, {
      status: "cancelled",
      completedAt: new Date(),
    });
    return;
  }

  const monthKey = new Date().toISOString().slice(0, 7);
  await storage.incrementUsageCounter(delivery.tenantId, monthKey, "webhookDeliveries").catch(() => {});

  const urlCheck = await validateWebhookUrl(endpoint.url);
  if (!urlCheck.valid) {
    await storage.updateWebhookDelivery(delivery.id, {
      status: "failed",
      responseCode: 0,
      responseBody: `SSRF blocked: ${urlCheck.reason}`,
      durationMs: 0,
      attempts: delivery.attempts + 1,
      completedAt: new Date(),
    });
    return;
  }

  const body = JSON.stringify(delivery.payload);

  if (Buffer.byteLength(body, "utf-8") > MAX_WEBHOOK_PAYLOAD_BYTES) {
    await storage.updateWebhookDelivery(delivery.id, {
      status: "failed",
      responseCode: 0,
      responseBody: `Payload exceeds maximum size of ${MAX_WEBHOOK_PAYLOAD_BYTES} bytes`,
      durationMs: 0,
      attempts: delivery.attempts + 1,
      completedAt: new Date(),
    });
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signPayload(endpoint.secret, timestamp, body);

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SNV-Event": delivery.eventType,
        "X-SNV-Timestamp": timestamp,
        "X-SNV-Signature": signature,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - start;
    const responseBody = await res.text().catch(() => "");

    if (res.ok) {
      await storage.updateWebhookDelivery(delivery.id, {
        status: "delivered",
        responseCode: res.status,
        responseBody: responseBody.substring(0, 1000),
        durationMs,
        attempts: delivery.attempts + 1,
        completedAt: new Date(),
      });
    } else {
      await handleFailure(delivery, res.status, responseBody.substring(0, 1000), durationMs);
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    await handleFailure(delivery, 0, err.message?.substring(0, 1000) || "Connection failed", durationMs);
  }
}

async function handleFailure(delivery: any, responseCode: number, responseBody: string, durationMs: number): Promise<void> {
  const nextAttempt = delivery.attempts + 1;
  if (nextAttempt >= delivery.maxAttempts) {
    await storage.updateWebhookDelivery(delivery.id, {
      status: "failed",
      responseCode,
      responseBody,
      durationMs,
      attempts: nextAttempt,
      completedAt: new Date(),
    });
  } else {
    const backoffSeconds = Math.pow(2, nextAttempt) * 10;
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
    await storage.updateWebhookDelivery(delivery.id, {
      status: "pending",
      responseCode,
      responseBody,
      durationMs,
      attempts: nextAttempt,
      nextRetryAt,
    });
  }
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

async function pollDeliveries(): Promise<void> {
  try {
    const pending = await storage.getPendingWebhookDeliveries(10);
    for (const delivery of pending) {
      await processDelivery(delivery);
    }
  } catch (err) {
    console.error("[webhook-worker] Poll error:", err);
  }
}

export function startWebhookWorker(): void {
  eventBus.on("*", enqueueDeliveries);

  pollerInterval = setInterval(pollDeliveries, 5000);
  console.log("[webhook-worker] Started");
}

export function stopWebhookWorker(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
  eventBus.off("*", enqueueDeliveries);
}
