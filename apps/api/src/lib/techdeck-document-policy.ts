import { sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '../db.js';
import { techdeckDocumentRevisions, techdeckDocuments } from '../schema.js';

export type DocumentAuthority = { tenantId: string; actorUserId: string; role: string };
export const documentRoles = (role: string) => role === 'owner' ? ['member', 'admin', 'owner'] : role === 'admin' ? ['member', 'admin'] : ['member'];

/** Additional gate for evidence-derived documents, including generic document APIs.
 * All linked sources must remain readable. Ordinary unlinked documents retain
 * their existing policy. A portal assignment never grants internal evidence. */
export function resolutionDocumentReadable(context: DocumentAuthority, documentId: SQLWrapper | string) {
  const roles = sql.join(documentRoles(context.role).map(role => sql`${role}`), sql`,`);
  return sql`NOT EXISTS (
    SELECT 1 FROM techdeck_resolution_document_links source_link
    LEFT JOIN techdeck_resolution_incidents source_incident ON source_incident.tenant_id=source_link.tenant_id AND source_incident.id=source_link.incident_id
    WHERE source_link.tenant_id=${context.tenantId} AND source_link.document_id=${documentId}
    AND (source_incident.id IS NULL OR source_incident.archived_at IS NOT NULL OR source_incident.active_revision IS NULL
      OR source_incident.minimum_role NOT IN (${roles})
      OR EXISTS (SELECT 1 FROM techdeck_portal_assignments portal WHERE portal.tenant_id=${context.tenantId} AND portal.user_id=${context.actorUserId} AND portal.revoked_at IS NULL)))`;
}

export function resolutionDocumentCurrent(tenantId: string, documentId: SQLWrapper | string) {
  return sql`NOT EXISTS (SELECT 1 FROM techdeck_resolution_document_links source_link
    JOIN techdeck_resolution_incidents source_incident ON source_incident.tenant_id=source_link.tenant_id AND source_incident.id=source_link.incident_id
    WHERE source_link.tenant_id=${tenantId} AND source_link.document_id=${documentId}
      AND (source_incident.archived_at IS NOT NULL OR source_incident.active_revision IS DISTINCT FROM source_link.revision))`;
}

export function resolutionDocumentAudience(tenantId: string, documentId: SQLWrapper | string, role: string) {
  return sql`NOT EXISTS (SELECT 1 FROM techdeck_resolution_document_links source_link
    JOIN techdeck_resolution_incidents source_incident ON source_incident.tenant_id=source_link.tenant_id AND source_incident.id=source_link.incident_id
    WHERE source_link.tenant_id=${tenantId} AND source_link.document_id=${documentId}
    AND source_incident.minimum_role NOT IN (${sql.join(documentRoles(role).map(value => sql`${value}`), sql`,`)}) )`;
}

/** Version snapshots are shared by manual and evidence-derived document writes. */
export async function insertTechDeckDocumentRevision(executor: Pick<typeof db, 'insert'>, document: typeof techdeckDocuments.$inferSelect, actorId: string, changeNote: string | null) {
  await executor.insert(techdeckDocumentRevisions).values({
    tenantId: document.tenantId, documentId: document.id, version: document.version,
    title: document.title, summary: document.summary, content: document.content,
    status: document.status, minimumRole: document.minimumRole, tags: document.tags,
    changeNote, createdByUserId: actorId,
  });
}
