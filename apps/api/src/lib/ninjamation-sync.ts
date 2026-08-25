import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { appendActivityEvent } from './shared-usage-activity.js';
import {
  NINJAMATION_REPOSITORY,
  normalizeCatalogSnapshot,
  type CatalogSnapshot,
} from './ninjamation-phase36.js';

type Row = Record<string, any>;

function riskFor(analysis: { criticalCount: number; warningCount: number }) {
  return analysis.criticalCount > 0 ? 'high' : analysis.warningCount > 0 ? 'medium' : 'low';
}

export async function runNinjamationCatalogSync(input: {
  tenantId: string;
  userId: string;
  moduleId: string;
  runId: string;
  snapshot: CatalogSnapshot;
}) {
  const normalized = normalizeCatalogSnapshot(input.snapshot);
  try {
    const result = await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE ninjamation_sync_runs SET status='running',started_at=COALESCE(started_at,NOW()),
          resolved_commit=${input.snapshot.commit},snapshot_sha256=${normalized.snapshotSha256},
          error_code=NULL,error_summary=NULL,updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${input.runId}
          AND status IN ('queued','failed')
        RETURNING *
      `);
      if (!claimed.rows[0]) {
        const existing = await tx.execute(sql`
          SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${input.tenantId} AND id=${input.runId} LIMIT 1
        `);
        if (existing.rows[0]?.status === 'completed') return existing.rows[0] as Row;
        throw Object.assign(new Error('Script Ops sync run is unavailable or already processing'), { code: 'NINJAMATION_SYNC_NOT_CLAIMABLE' });
      }

      const existingResult = await tx.execute(sql`
        SELECT * FROM ninjamation_scripts
        WHERE tenant_id=${input.tenantId} AND source='catalog_import'
          AND source_repository=${NINJAMATION_REPOSITORY} AND deleted_at IS NULL
        FOR UPDATE
      `);
      const existingByPath = new Map(
        (existingResult.rows as Row[])
          .filter((row) => row.source_path)
          .map((row) => [String(row.source_path), row]),
      );
      const seen = new Set<string>();
      const counts = { created: 0, updated: 0, unchanged: 0, restored: 0, deprecated: 0, rejected: 0 };

      for (const source of normalized.scripts) {
        seen.add(source.sourcePath);
        const existing = existingByPath.get(source.sourcePath);
        const safetyStatus = source.staticAnalysis.criticalCount > 0 ? 'critical_findings' : 'review_required';
        if (!existing) {
          const inserted = await tx.execute(sql`
            INSERT INTO ninjamation_scripts (
              tenant_id,created_by_user_id,owner_user_id,name,source_display_name,description,
              language,category,source,risk_tier,status,file_name,tags,source_repository,
              source_branch,source_path,source_commit,source_blob_sha,source_content_sha256,
              source_license,sync_state,last_synced_at
            ) VALUES (
              ${input.tenantId},${input.userId},${input.userId},${source.persistedName},${source.sourceDisplayName},${source.description},
              ${source.language},${source.category},'catalog_import',${riskFor(source.staticAnalysis)},'draft',${source.fileName},${JSON.stringify(source.tags)}::jsonb,
              ${source.sourceRepository},${source.sourceBranch},${source.sourcePath},${source.sourceCommit},${source.sourceBlobSha},
              ${source.contentSha256},'review-required','active',NOW()
            ) RETURNING *
          `);
          const script = inserted.rows[0] as Row;
          await tx.execute(sql`
            INSERT INTO ninjamation_script_versions (
              tenant_id,script_id,version_number,content,content_sha256,static_analysis,
              created_by_user_id,provenance_json,source_commit,source_blob_sha,safety_status
            ) VALUES (
              ${input.tenantId},${script.id},1,${source.content},${source.contentSha256},${source.staticAnalysis},
              ${input.userId},${{ repository: source.sourceRepository, branch: source.sourceBranch, path: source.sourcePath, commit: source.sourceCommit, blobSha: source.sourceBlobSha }},
              ${source.sourceCommit},${source.sourceBlobSha},${safetyStatus}
            )
          `);
          await tx.execute(sql`
            INSERT INTO ninjamation_sync_items (
              tenant_id,sync_run_id,script_id,source_path,action,source_blob_sha,content_sha256,safe_metadata
            ) VALUES (
              ${input.tenantId},${input.runId},${script.id},${source.sourcePath},'created',${source.sourceBlobSha},${source.contentSha256},
              ${{ language: source.language, category: source.category, findingCount: source.staticAnalysis.findingCount }}
            )
          `);
          counts.created += 1;
          continue;
        }

        const changed = String(existing.source_content_sha256 ?? '') !== source.contentSha256;
        const wasDeprecated = existing.sync_state === 'deprecated' || existing.status === 'retired';
        if (changed) {
          const versionNumber = Number(existing.current_version_number) + 1;
          await tx.execute(sql`
            INSERT INTO ninjamation_script_versions (
              tenant_id,script_id,version_number,content,content_sha256,static_analysis,
              created_by_user_id,provenance_json,source_commit,source_blob_sha,safety_status
            ) VALUES (
              ${input.tenantId},${existing.id},${versionNumber},${source.content},${source.contentSha256},${source.staticAnalysis},
              ${input.userId},${{ repository: source.sourceRepository, branch: source.sourceBranch, path: source.sourcePath, commit: source.sourceCommit, blobSha: source.sourceBlobSha }},
              ${source.sourceCommit},${source.sourceBlobSha},${safetyStatus}
            )
          `);
          await tx.execute(sql`
            UPDATE ninjamation_scripts SET
              source_display_name=${source.sourceDisplayName},description=${source.description},language=${source.language},
              category=${source.category},risk_tier=${riskFor(source.staticAnalysis)},file_name=${source.fileName},tags=${JSON.stringify(source.tags)}::jsonb,
              source_branch=${source.sourceBranch},source_commit=${source.sourceCommit},source_blob_sha=${source.sourceBlobSha},
              source_content_sha256=${source.contentSha256},sync_state='active',last_synced_at=NOW(),deprecated_at=NULL,
              deprecation_reason=NULL,status='draft',approved_by_user_id=NULL,approved_at=NULL,retired_at=NULL,
              current_version_number=${versionNumber},version=version+1,updated_at=NOW()
            WHERE tenant_id=${input.tenantId} AND id=${existing.id}
          `);
          const action = wasDeprecated ? 'restored' : 'updated';
          await tx.execute(sql`
            INSERT INTO ninjamation_sync_items (
              tenant_id,sync_run_id,script_id,source_path,action,source_blob_sha,content_sha256,safe_metadata
            ) VALUES (
              ${input.tenantId},${input.runId},${existing.id},${source.sourcePath},${action},${source.sourceBlobSha},${source.contentSha256},
              ${{ versionNumber, approvalReset: true, findingCount: source.staticAnalysis.findingCount }}
            )
          `);
          counts[action] += 1;
        } else {
          const action = wasDeprecated ? 'restored' : 'unchanged';
          await tx.execute(sql`
            UPDATE ninjamation_scripts SET
              source_display_name=${source.sourceDisplayName},description=${source.description},language=${source.language},
              category=${source.category},file_name=${source.fileName},tags=${JSON.stringify(source.tags)}::jsonb,source_branch=${source.sourceBranch},
              source_commit=${source.sourceCommit},source_blob_sha=${source.sourceBlobSha},sync_state='active',last_synced_at=NOW(),
              deprecated_at=NULL,deprecation_reason=NULL,
              status=CASE WHEN ${wasDeprecated} THEN 'draft' ELSE status END,
              retired_at=CASE WHEN ${wasDeprecated} THEN NULL ELSE retired_at END,
              version=CASE WHEN ${wasDeprecated} THEN version+1 ELSE version END,updated_at=NOW()
            WHERE tenant_id=${input.tenantId} AND id=${existing.id}
          `);
          await tx.execute(sql`
            INSERT INTO ninjamation_sync_items (
              tenant_id,sync_run_id,script_id,source_path,action,source_blob_sha,content_sha256,safe_metadata
            ) VALUES (
              ${input.tenantId},${input.runId},${existing.id},${source.sourcePath},${action},${source.sourceBlobSha},${source.contentSha256},
              ${{ approvalReset: wasDeprecated }}
            )
          `);
          counts[action] += 1;
        }
      }

      for (const [path, existing] of existingByPath) {
        if (seen.has(path) || existing.sync_state === 'deprecated') continue;
        await tx.execute(sql`
          UPDATE ninjamation_scripts SET sync_state='deprecated',deprecated_at=NOW(),
            deprecation_reason='Missing from the complete allowlisted repository snapshot',status='retired',
            retired_at=COALESCE(retired_at,NOW()),approved_by_user_id=NULL,approved_at=NULL,
            version=version+1,updated_at=NOW()
          WHERE tenant_id=${input.tenantId} AND id=${existing.id}
        `);
        await tx.execute(sql`
          INSERT INTO ninjamation_sync_items (
            tenant_id,sync_run_id,script_id,source_path,action,source_blob_sha,content_sha256,safe_metadata
          ) VALUES (
            ${input.tenantId},${input.runId},${existing.id},${path},'deprecated',${existing.source_blob_sha},${existing.source_content_sha256},
            ${{ deletionPolicy: 'deprecate', destructiveDelete: false }}
          )
        `);
        counts.deprecated += 1;
      }

      const completed = await tx.execute(sql`
        UPDATE ninjamation_sync_runs SET status='completed',resolved_commit=${input.snapshot.commit},
          snapshot_sha256=${normalized.snapshotSha256},discovered_count=${normalized.scripts.length},
          created_count=${counts.created},updated_count=${counts.updated},unchanged_count=${counts.unchanged},
          restored_count=${counts.restored},deprecated_count=${counts.deprecated},rejected_count=${counts.rejected},
          completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${input.runId}
        RETURNING *
      `);
      return completed.rows[0] as Row;
    });

    await appendActivityEvent({
      tenantId: input.tenantId,
      moduleId: input.moduleId,
      actorUserId: input.userId,
      objectType: 'ninjamation_sync_run',
      objectId: input.runId,
      eventType: 'catalog_sync_completed',
      summary: 'AutomationPacks catalog synchronization completed',
      metadata: {
        commit: input.snapshot.commit,
        snapshotSha256: normalized.snapshotSha256,
        discovered: Number(result.discovered_count ?? normalized.scripts.length),
        created: Number(result.created_count ?? 0),
        updated: Number(result.updated_count ?? 0),
        deprecated: Number(result.deprecated_count ?? 0),
      },
    });
    return result;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as any).code) : 'NINJAMATION_SYNC_FAILED';
    const summary = error instanceof Error ? error.message.slice(0, 500) : 'Catalog synchronization failed';
    await db.execute(sql`
      UPDATE ninjamation_sync_runs SET status='failed',error_code=${code},error_summary=${summary},
        completed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND id=${input.runId} AND status<>'completed'
    `).catch(() => undefined);
    throw error;
  }
}
