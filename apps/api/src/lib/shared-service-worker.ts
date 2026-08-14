import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { processSharedJobBatch } from './shared-background-jobs.js';
import { processOutboxBatch } from './shared-notification-outbox.js';
import { processWebhookBatch } from './shared-webhooks.js';
import { purgeExpiredAttachmentBlobs } from './shared-attachments.js';
import { processOutboundWebhookBatch } from './shared-outbound-webhooks.js';
import { enqueueDueSchedules } from './shared-schedules-exports.js';

const workerId = `operatoros-${process.pid}-${randomUUID().slice(0, 8)}`;
let interval: ReturnType<typeof setInterval> | null = null;
let running = false;
let stopping = false;
let lastStartedAt: Date | null = null;
let lastCompletedAt: Date | null = null;
let lastErrorCode: string | null = null;

export function getSharedServiceWorkerStatus() {
  return {
    enabled: process.env.SHARED_SERVICE_WORKER_DISABLED !== '1',
    started: interval !== null,
    running,
    stopping,
    workerId,
    lastStartedAt,
    lastCompletedAt,
    lastErrorCode,
  };
}

export async function getSharedServiceQueueHealth() {
  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM shared_outbox_messages WHERE status = 'dead_letter') AS outbox_dead_letter,
      (SELECT COUNT(*)::int FROM shared_jobs WHERE status = 'dead_letter') AS jobs_dead_letter,
      (SELECT COUNT(*)::int FROM shared_webhook_receipts WHERE status = 'dead_letter') AS webhooks_dead_letter,
      (SELECT COUNT(*)::int FROM shared_webhook_deliveries WHERE status = 'dead_letter') AS outbound_webhooks_dead_letter,
      (SELECT COUNT(*)::int FROM shared_outbox_messages WHERE status IN ('pending','retry','processing')) AS outbox_open,
      (SELECT COUNT(*)::int FROM shared_jobs WHERE status IN ('pending','retry','processing')) AS jobs_open,
      (SELECT COUNT(*)::int FROM shared_webhook_receipts WHERE status IN ('pending','retry','processing')) AS webhooks_open
      ,(SELECT COUNT(*)::int FROM shared_webhook_deliveries WHERE status IN ('pending','retry','processing')) AS outbound_webhooks_open
  `);
  return result.rows[0] ?? {};
}

export async function runSharedServiceCycle(): Promise<{
  outbox: number;
  jobs: number;
  webhooks: number;
  outboundWebhooks: number;
  schedules: number;
  purgedAttachments: number;
}> {
  if (running || stopping) return { outbox: 0, jobs: 0, webhooks: 0, outboundWebhooks: 0, schedules: 0, purgedAttachments: 0 };
  running = true;
  lastStartedAt = new Date();
  try {
    const [outbox, jobs, webhooks, outboundWebhooks, schedules, purgedAttachments] = await Promise.all([
      processOutboxBatch({ workerId: `${workerId}:outbox`, limit: 20 }),
      processSharedJobBatch({ workerId: `${workerId}:jobs`, limit: 20 }),
      processWebhookBatch({ workerId: `${workerId}:webhooks`, limit: 20 }),
      processOutboundWebhookBatch({ workerId: `${workerId}:outbound-webhooks`, limit: 20 }),
      enqueueDueSchedules({ limit: 20 }),
      purgeExpiredAttachmentBlobs(20),
    ]);
    lastCompletedAt = new Date();
    lastErrorCode = null;
    return { outbox, jobs, webhooks, outboundWebhooks, schedules, purgedAttachments };
  } catch {
    lastCompletedAt = new Date();
    lastErrorCode = 'SHARED_SERVICE_CYCLE_FAILED';
    return { outbox: 0, jobs: 0, webhooks: 0, outboundWebhooks: 0, schedules: 0, purgedAttachments: 0 };
  } finally {
    running = false;
  }
}

export function startSharedServiceWorker(): void {
  if (interval || process.env.SHARED_SERVICE_WORKER_DISABLED === '1') return;
  stopping = false;
  const configuredMs = Number(process.env.SHARED_SERVICE_WORKER_INTERVAL_MS || 2_000);
  const everyMs = Number.isFinite(configuredMs)
    ? Math.max(500, Math.min(60_000, configuredMs))
    : 2_000;
  void runSharedServiceCycle();
  interval = setInterval(() => { void runSharedServiceCycle(); }, everyMs);
  interval.unref?.();
}

export async function stopSharedServiceWorker(): Promise<void> {
  stopping = true;
  if (interval) clearInterval(interval);
  interval = null;
  const deadline = Date.now() + 10_000;
  while (running && Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, 25));
  }
  stopping = false;
}
