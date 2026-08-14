import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { createAttachment } from './shared-attachments.js';
import { enqueueSharedJob, registerSharedJobHandler, type SharedJobContext } from './shared-background-jobs.js';
import { sanitizeSharedMetadata } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;
export const SHARED_EXPORT_JOB = 'shared.export.generate.v1';

export interface SharedExportOutput {
  filename: string;
  mimeType: 'application/json' | 'text/csv' | 'application/zip';
  content: Buffer;
}

export type SharedExporter = (input: {
  tenantId: string;
  moduleId: string;
  requestedByUserId: string;
  exportId: string;
  format: 'json' | 'csv' | 'zip';
  filters: Record<string, unknown>;
}) => Promise<SharedExportOutput>;

const exporters = new Map<string, SharedExporter>();

export function registerSharedExporter(exportType: string, exporter: SharedExporter): void {
  if (exporters.has(exportType) && exporters.get(exportType) !== exporter) {
    throw new Error(`Shared exporter already registered: ${exportType}`);
  }
  exporters.set(exportType, exporter);
}

async function controlPlaneHistoryExporter(input: Parameters<SharedExporter>[0]): Promise<SharedExportOutput> {
  const [activity, usage, jobs] = await Promise.all([
    db.execute(sql`SELECT module_id, object_type, object_id, event_type, summary, metadata_json, created_at FROM shared_activity_events WHERE tenant_id = ${input.tenantId} ORDER BY created_at DESC LIMIT 1000`),
    db.execute(sql`SELECT module_id, operation, units, unit_kind, metadata_json, occurred_at FROM shared_usage_events WHERE tenant_id = ${input.tenantId} ORDER BY occurred_at DESC LIMIT 1000`),
    db.execute(sql`SELECT module_id, handler_key, status, attempt_count, max_attempts, last_error_code, created_at, completed_at FROM shared_jobs WHERE tenant_id = ${input.tenantId} ORDER BY created_at DESC LIMIT 1000`),
  ]);
  const generatedAt = new Date().toISOString();
  if (input.format === 'csv') {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = ['record_type,module_id,action_or_operation,status_or_units,timestamp'];
    for (const row of activity.rows) lines.push(['activity', row.module_id, row.event_type, '', row.created_at].map(escape).join(','));
    for (const row of usage.rows) lines.push(['usage', row.module_id, row.operation, `${row.units} ${row.unit_kind}`, row.occurred_at].map(escape).join(','));
    for (const row of jobs.rows) lines.push(['job', row.module_id, row.handler_key, row.status, row.created_at].map(escape).join(','));
    return { filename: `operatoros-control-plane-${generatedAt.slice(0, 10)}.csv`, mimeType: 'text/csv', content: Buffer.from(lines.join('\n')) };
  }
  return {
    filename: `operatoros-control-plane-${generatedAt.slice(0, 10)}.json`,
    mimeType: 'application/json',
    content: Buffer.from(JSON.stringify({ generatedAt, filters: input.filters, activity: activity.rows, usage: usage.rows, jobs: jobs.rows }, null, 2)),
  };
}

registerSharedExporter('control-plane-history', controlPlaneHistoryExporter);

export async function requestSharedExport(input: {
  tenantId: string;
  moduleId: string;
  requestedByUserId: string;
  exportType: string;
  format: 'json' | 'csv' | 'zip';
  filters?: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string | null;
}) {
  if (!exporters.has(input.exportType)) throw Object.assign(new Error('Export type is not registered'), { code: 'EXPORT_TYPE_NOT_REGISTERED' });
  const filters = sanitizeSharedMetadata(input.filters);
  return db.transaction(async tx => {
    const inserted = await tx.execute(sql`
      INSERT INTO shared_exports (
        tenant_id, module_id, requested_by_user_id, export_type, format,
        filters_json, idempotency_key, expires_at
      ) VALUES (
        ${input.tenantId}, ${input.moduleId}, ${input.requestedByUserId}, ${input.exportType},
        ${input.format}, ${filters}, ${input.idempotencyKey}, ${new Date(Date.now() + 24 * 60 * 60 * 1000)}
      ) ON CONFLICT (tenant_id, module_id, export_type, idempotency_key) DO NOTHING
      RETURNING *
    `);
    let exportRow = inserted.rows[0] as Record<string, unknown> | undefined;
    if (!exportRow) {
      const existing = await tx.execute(sql`
        SELECT * FROM shared_exports WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
          AND export_type = ${input.exportType} AND idempotency_key = ${input.idempotencyKey} LIMIT 1
      `);
      return { export: existing.rows[0], duplicate: true };
    }
    const job = await enqueueSharedJob({
      tenantId: input.tenantId,
      moduleId: input.moduleId,
      requestedByUserId: input.requestedByUserId,
      handlerKey: SHARED_EXPORT_JOB,
      payload: { exportId: exportRow.id },
      idempotencyKey: `export:${exportRow.id}`,
      correlationId: input.correlationId,
    }, tx);
    const updated = await tx.execute(sql`
      UPDATE shared_exports SET job_id = ${String((job.job as any).id)}
      WHERE tenant_id = ${input.tenantId} AND id = ${String(exportRow.id)} RETURNING *
    `);
    exportRow = updated.rows[0] as Record<string, unknown>;
    return { export: exportRow, duplicate: false };
  });
}

async function generateExportJob(context: SharedJobContext): Promise<void> {
  const exportId = String(context.payload.exportId || '');
  const claimed = await db.execute(sql`
    UPDATE shared_exports SET status = 'processing', last_error_code = NULL
    WHERE tenant_id = ${context.tenantId} AND module_id = ${context.moduleId} AND id = ${exportId}
      AND status IN ('pending','retry','processing')
    RETURNING *
  `);
  const row = claimed.rows[0] as any;
  if (!row) return;
  const exporter = exporters.get(String(row.export_type));
  if (!exporter) throw Object.assign(new Error('Export type is not registered'), { code: 'EXPORT_TYPE_NOT_REGISTERED' });
  try {
    const output = await exporter({
      tenantId: context.tenantId,
      moduleId: context.moduleId,
      requestedByUserId: String(row.requested_by_user_id),
      exportId,
      format: String(row.format) as 'json' | 'csv' | 'zip',
      filters: (row.filters_json ?? {}) as Record<string, unknown>,
    });
    const attachment = await createAttachment({
      tenantId: context.tenantId,
      moduleId: context.moduleId,
      objectType: 'shared_export',
      objectId: exportId,
      originalName: output.filename,
      declaredMimeType: output.mimeType,
      content: output.content,
      createdByUserId: String(row.requested_by_user_id),
      retentionUntil: row.expires_at ? new Date(row.expires_at) : null,
      correlationId: context.correlationId,
    });
    await db.execute(sql`
      UPDATE shared_exports SET status = 'completed', result_attachment_id = ${String(attachment.id)},
        completed_at = NOW(), last_error_code = NULL
      WHERE tenant_id = ${context.tenantId} AND id = ${exportId}
    `);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as any).code) : 'EXPORT_GENERATION_FAILED';
    await db.execute(sql`
      UPDATE shared_exports SET status = 'retry', last_error_code = ${code}
      WHERE tenant_id = ${context.tenantId} AND id = ${exportId}
    `);
    throw error;
  }
}

registerSharedJobHandler(SHARED_EXPORT_JOB, generateExportJob);

export async function createSharedSchedule(input: {
  tenantId: string;
  moduleId: string;
  actorUserId: string;
  name: string;
  handlerKey: string;
  payload?: Record<string, unknown>;
  intervalSeconds: number;
  nextRunAt?: Date;
}, executor: Executor = db) {
  const interval = Math.max(60, Math.min(2_592_000, Math.trunc(input.intervalSeconds)));
  const payload = sanitizeSharedMetadata(input.payload);
  const result = await executor.execute(sql`
    INSERT INTO shared_schedules (
      tenant_id, module_id, name, handler_key, payload_json, interval_seconds,
      next_run_at, created_by_user_id
    ) VALUES (${input.tenantId}, ${input.moduleId}, ${input.name.trim().slice(0, 120)},
      ${input.handlerKey.slice(0, 160)}, ${payload}, ${interval}, ${input.nextRunAt ?? new Date()}, ${input.actorUserId})
    ON CONFLICT (tenant_id, module_id, name) DO UPDATE SET
      handler_key = EXCLUDED.handler_key, payload_json = EXCLUDED.payload_json,
      interval_seconds = EXCLUDED.interval_seconds, next_run_at = EXCLUDED.next_run_at,
      enabled = TRUE, version = shared_schedules.version + 1, updated_at = NOW()
    RETURNING *
  `);
  return result.rows[0];
}

export async function enqueueDueSchedules(input: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  return db.transaction(async tx => {
    const due = await tx.execute(sql`
      WITH candidates AS (
        SELECT id, next_run_at AS scheduled_for FROM shared_schedules
        WHERE enabled = TRUE AND next_run_at <= NOW()
        ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE shared_schedules schedule
      SET last_enqueued_at = NOW(),
        next_run_at = schedule.next_run_at + make_interval(secs => schedule.interval_seconds),
        last_error_code = NULL, updated_at = NOW()
      FROM candidates
      WHERE schedule.id = candidates.id
      RETURNING schedule.*, candidates.scheduled_for
    `);
    for (const row of due.rows as any[]) {
      const scheduledFor = new Date(row.scheduled_for);
      await enqueueSharedJob({
        tenantId: String(row.tenant_id), moduleId: String(row.module_id),
        requestedByUserId: String(row.created_by_user_id), handlerKey: String(row.handler_key),
        payload: {
          ...((row.payload_json ?? {}) as Record<string, unknown>),
          sharedScheduleId: String(row.id),
          scheduledFor: scheduledFor.toISOString(),
        },
        idempotencyKey: `schedule:${row.id}:${scheduledFor.toISOString()}`,
      }, tx);
    }
    return due.rows.length;
  });
}
