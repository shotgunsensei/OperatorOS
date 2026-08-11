import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { registerSharedExporter, type SharedExportOutput } from './shared-schedules-exports.js';

export const TORQUESHED_PRODUCT_EXPORT_TYPE = 'torqueshed-product-history';

function csv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function buildTorqueShedExport(input: {
  tenantId: string; moduleId: string; requestedByUserId: string; exportId: string;
  format: 'json' | 'csv' | 'zip'; filters: Record<string, unknown>;
}): Promise<SharedExportOutput> {
  const [vehicles, service, builds, journal, parts, diagnostics, codes, entries] = await Promise.all([
    db.execute(sql`SELECT id,nickname,year,make,model,trim,engine,transmission,drivetrain,current_mileage,ownership_status,visibility,vin_last6,created_at,updated_at FROM torqueshed_vehicles WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY created_at,id`),
    db.execute(sql`SELECT id,vehicle_id,kind,title,description,mileage,occurred_at,labor_minutes,labor_cost_minor,parts_cost_minor,other_cost_minor,currency,status FROM torqueshed_service_records WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY occurred_at,id`),
    db.execute(sql`SELECT id,vehicle_id,title,description,status,visibility,budget_minor,currency,started_at,target_at,completed_at FROM torqueshed_builds WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY created_at,id`),
    db.execute(sql`SELECT id,build_id,entry_type,title,body,mileage,cost_minor,labor_minutes,visibility,occurred_at FROM torqueshed_build_journal_entries WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY occurred_at,id`),
    db.execute(sql`SELECT id,build_id,name,manufacturer,part_number,category,status,quantity,unit_cost_minor,currency,installed_at,notes FROM torqueshed_build_parts WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY created_at,id`),
    db.execute(sql`SELECT id,vehicle_id,title,customer_concern,symptoms,conditions,confirmed_cause,repair_performed,verification,resolution,status,visibility,opened_at,resolved_at FROM torqueshed_diagnostic_sessions WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY opened_at,id`),
    db.execute(sql`SELECT id,diagnostic_session_id,code,description,code_status,freeze_frame,observed_at FROM torqueshed_diagnostic_trouble_codes WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY observed_at,id`),
    db.execute(sql`SELECT id,diagnostic_session_id,kind,title,value_text,value_numeric,unit,reference_min,reference_max,outcome,metadata,observed_at FROM torqueshed_diagnostic_entries WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY observed_at,id`),
  ]);
  const generatedAt = new Date().toISOString();
  const sections = { vehicles: vehicles.rows, serviceRecords: service.rows, builds: builds.rows, journal: journal.rows, parts: parts.rows, diagnostics: diagnostics.rows, troubleCodes: codes.rows, diagnosticEntries: entries.rows };
  if (input.format === 'csv') {
    const lines = ['record_type,id,parent_id,title_or_name,status,occurred_at'];
    for (const row of vehicles.rows) lines.push(['vehicle',row.id,'',`${row.year} ${row.make} ${row.model}`,row.ownership_status,row.created_at].map(csv).join(','));
    for (const row of service.rows) lines.push(['service',row.id,row.vehicle_id,row.title,row.status,row.occurred_at].map(csv).join(','));
    for (const row of builds.rows) lines.push(['build',row.id,row.vehicle_id,row.title,row.status,row.started_at].map(csv).join(','));
    for (const row of journal.rows) lines.push(['journal',row.id,row.build_id,row.title,row.entry_type,row.occurred_at].map(csv).join(','));
    for (const row of parts.rows) lines.push(['part',row.id,row.build_id,row.name,row.status,row.installed_at].map(csv).join(','));
    for (const row of diagnostics.rows) lines.push(['diagnostic',row.id,row.vehicle_id,row.title,row.status,row.opened_at].map(csv).join(','));
    return { filename: `torqueshed-history-${generatedAt.slice(0,10)}.csv`, mimeType: 'text/csv', content: Buffer.from(lines.join('\n')) };
  }
  return { filename: `torqueshed-history-${generatedAt.slice(0,10)}.json`, mimeType: 'application/json', content: Buffer.from(JSON.stringify({ generatedAt, filters: input.filters, ...sections }, null, 2)) };
}

registerSharedExporter(TORQUESHED_PRODUCT_EXPORT_TYPE, buildTorqueShedExport);
