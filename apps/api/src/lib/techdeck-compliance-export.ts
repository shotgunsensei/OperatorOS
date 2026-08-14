import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { registerSharedExporter, type SharedExportOutput } from './shared-schedules-exports.js';

export const TECHDECK_COMPLIANCE_EXPORT_TYPE = 'techdeck-compliance-packet-v1';

interface ZipEntry {
  name: string;
  content: Buffer;
}

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]));
  }
  return value;
}

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(stableValue(value), null, 2)}\n`, 'utf8');
}

/** Minimal deterministic ZIP writer using stored (uncompressed) entries. */
export function createDeterministicZip(input: readonly ZipEntry[]): Buffer {
  const entries = [...input].sort((left, right) => left.name.localeCompare(right.name));
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll('\\', '/'), 'utf8');
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12); // 1980-01-01 00:00:00
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, entry.content);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x0021, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(entry.content.length, 20);
    header.writeUInt32LE(entry.content.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);
    central.push(header);
    offset += local.length + entry.content.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

export async function buildTechDeckCompliancePacket(input: {
  tenantId: string;
  moduleId: string;
  filters: Record<string, unknown>;
}): Promise<SharedExportOutput> {
  const [tickets, assets, documents, evidence, status, licenses, activity] = await Promise.all([
    db.execute(sql`SELECT id, number, title, description, priority, status, response_deadline, resolution_deadline,
      responded_at, resolved_at, closed_at, directory_organization_id, directory_site_id, configuration_item_id,
      version, created_at, updated_at FROM techdeck_tickets WHERE tenant_id=${input.tenantId} AND deleted_at IS NULL ORDER BY number, id`),
    db.execute(sql`SELECT id, name, type, status, hostname, ip_address, vendor, product, model, serial_number,
      vlan_number, cidr, gateway, dns_servers, health, expiration_date, renewal_date, warranty_end_date,
      details, tags, version, created_at, updated_at FROM techdeck_assets WHERE tenant_id=${input.tenantId} AND deleted_at IS NULL ORDER BY id`),
    db.execute(sql`SELECT id, page_type, title, slug, summary, content, status, minimum_role, tags, version,
      reviewed_at, approved_at, published_at, created_at, updated_at FROM techdeck_documents
      WHERE tenant_id=${input.tenantId} AND archived_at IS NULL ORDER BY id`),
    db.execute(sql`SELECT e.id, e.title, e.evidence_type, e.summary, e.source_reference, e.observed_at, e.tags,
      e.version, e.created_at, COALESCE(jsonb_agg(jsonb_build_object('sha256', f.sha256, 'name', f.original_name,
      'attachmentId', f.shared_attachment_id)) FILTER (WHERE f.id IS NOT NULL), '[]'::jsonb) AS files
      FROM techdeck_evidence e LEFT JOIN techdeck_evidence_file_links f ON f.tenant_id=e.tenant_id AND f.evidence_id=e.id AND f.deleted_at IS NULL
      WHERE e.tenant_id=${input.tenantId} AND e.archived_at IS NULL GROUP BY e.id ORDER BY e.id`),
    db.execute(sql`SELECT p.id, p.title, p.public_slug, p.description, p.public, p.version,
      COALESCE((SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' ORDER BY c.display_order, c.id) FROM techdeck_status_components c
        WHERE c.tenant_id=p.tenant_id AND c.status_page_id=p.id AND c.archived_at IS NULL), '[]'::jsonb) AS components,
      COALESCE((SELECT jsonb_agg(to_jsonb(i) - 'tenant_id' ORDER BY i.started_at, i.id) FROM techdeck_status_incidents i
        WHERE i.tenant_id=p.tenant_id AND i.status_page_id=p.id AND i.archived_at IS NULL), '[]'::jsonb) AS incidents
      FROM techdeck_status_pages p WHERE p.tenant_id=${input.tenantId} AND p.archived_at IS NULL ORDER BY p.id`),
    db.execute(sql`SELECT p.id, p.name, p.slug, p.description, p.active, p.version,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label, 'prefix', k.key_prefix,
        'maxActivations', k.max_activations, 'expiresAt', k.expires_at, 'revokedAt', k.revoked_at) ORDER BY k.created_at, k.id)
        FROM techdeck_license_keys k WHERE k.tenant_id=p.tenant_id AND k.product_id=p.id), '[]'::jsonb) AS keys
      FROM techdeck_license_products p WHERE p.tenant_id=${input.tenantId} AND p.archived_at IS NULL ORDER BY p.id`),
    db.execute(sql`SELECT action, entity_type, entity_id, metadata, created_at FROM activity_feed
      WHERE tenant_id=${input.tenantId} AND (entity_type LIKE 'techdeck_%' OR action LIKE 'techdeck_%') ORDER BY created_at, id LIMIT 5000`),
  ]);
  const dataEntries: ZipEntry[] = [
    { name: 'records/activity.json', content: json(activity.rows) },
    { name: 'records/assets.json', content: json(assets.rows) },
    { name: 'records/documents.json', content: json(documents.rows) },
    { name: 'records/evidence.json', content: json(evidence.rows) },
    { name: 'records/licenses.json', content: json(licenses.rows) },
    { name: 'records/status.json', content: json(status.rows) },
    { name: 'records/tickets.json', content: json(tickets.rows) },
  ];
  const manifest = {
    schemaVersion: 1,
    exportType: TECHDECK_COMPLIANCE_EXPORT_TYPE,
    tenantId: input.tenantId,
    moduleId: input.moduleId,
    filters: stableValue(input.filters),
    entries: dataEntries.map(entry => ({
      path: entry.name,
      bytes: entry.content.length,
      sha256: createHash('sha256').update(entry.content).digest('hex'),
    })),
  };
  const manifestEntry = { name: 'manifest.json', content: json(manifest) };
  const zip = createDeterministicZip([...dataEntries, manifestEntry]);
  return {
    filename: `techdeck-compliance-${createHash('sha256').update(manifestEntry.content).digest('hex').slice(0, 16)}.zip`,
    mimeType: 'application/zip',
    content: zip,
  };
}

registerSharedExporter(TECHDECK_COMPLIANCE_EXPORT_TYPE, buildTechDeckCompliancePacket);
