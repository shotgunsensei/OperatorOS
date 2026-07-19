import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { writeAudit } from './audit.js';
import {
  createAttachment,
  getAttachmentContent,
  listAttachments,
  softDeleteAttachment,
} from './shared-attachments.js';
import { enqueueOutboxMessage } from './shared-notification-outbox.js';
import {
  COMMUNITY_TOPICS,
  MARKETPLACE_CATEGORIES,
  SOCIAL_RATE_LIMITS,
  TorqueShedSocialError,
} from './torqueshed-social-domain.js';

type Executor = Pick<typeof db, 'execute'>;

function first(result: { rows: unknown[] }): Record<string, any> | undefined {
  return result.rows[0] as Record<string, any> | undefined;
}

export function socialCamel(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(row).map(([name, value]) => [
      name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

let cachedModuleId: string | null = null;
export async function torqueShedSocialModuleId(): Promise<string> {
  if (cachedModuleId) return cachedModuleId;
  const row = first(
    await db.execute(
      sql`SELECT id FROM modules WHERE slug='torqueshed' AND archived_at IS NULL LIMIT 1`,
    ),
  );
  if (!row) {
    throw new TorqueShedSocialError(
      'TorqueShed module is unavailable',
      'TORQUESHED_MODULE_UNAVAILABLE',
      503,
    );
  }
  cachedModuleId = String(row.id);
  return cachedModuleId;
}

export async function ensureSocialTaxonomy(tenantId: string, executor: Executor = db) {
  for (let index = 0; index < MARKETPLACE_CATEGORIES.length; index += 1) {
    const [slug, name] = MARKETPLACE_CATEGORIES[index];
    await executor.execute(sql`
      INSERT INTO torqueshed_marketplace_categories (tenant_id,slug,name,display_order)
      VALUES (${tenantId},${slug},${name},${index})
      ON CONFLICT (tenant_id,slug) DO UPDATE SET name=EXCLUDED.name,active=TRUE,display_order=EXCLUDED.display_order
    `);
  }
  for (let index = 0; index < COMMUNITY_TOPICS.length; index += 1) {
    const [slug, name] = COMMUNITY_TOPICS[index];
    await executor.execute(sql`
      INSERT INTO torqueshed_community_topics (tenant_id,slug,name,display_order)
      VALUES (${tenantId},${slug},${name},${index})
      ON CONFLICT (tenant_id,slug) DO UPDATE SET name=EXCLUDED.name,active=TRUE,display_order=EXCLUDED.display_order
    `);
  }
}

export async function consumeSocialRate(input: {
  tenantId: string;
  userId: string;
  kind?: 'write' | 'message' | 'report';
}) {
  const kind = input.kind ?? 'write';
  const now = Date.now();
  const windowMs = kind === 'report' ? 60 * 60_000 : 60_000;
  const startedAt = new Date(Math.floor(now / windowMs) * windowMs);
  const checks =
    kind === 'write'
      ? [
          {
            scope: 'user_write',
            subject: input.userId,
            limit: SOCIAL_RATE_LIMITS.userWritesPerMinute,
          },
          {
            scope: 'tenant_write',
            subject: input.tenantId,
            limit: SOCIAL_RATE_LIMITS.tenantWritesPerMinute,
          },
        ]
      : [
          {
            scope: kind === 'message' ? 'user_message' : 'user_report',
            subject: input.userId,
            limit:
              kind === 'message'
                ? SOCIAL_RATE_LIMITS.messagesPerMinute
                : SOCIAL_RATE_LIMITS.reportsPerHour,
          },
          {
            scope: kind === 'message' ? 'tenant_message' : 'tenant_report',
            subject: input.tenantId,
            limit:
              kind === 'message'
                ? SOCIAL_RATE_LIMITS.tenantMessagesPerMinute
                : SOCIAL_RATE_LIMITS.tenantReportsPerHour,
          },
        ];
  for (const check of checks) {
    const accepted = first(
      await db.execute(sql`
        INSERT INTO torqueshed_social_rate_windows
          (tenant_id,scope,subject_id,window_started_at,request_count)
        VALUES (${input.tenantId},${check.scope},${check.subject},${startedAt},1)
        ON CONFLICT (tenant_id,scope,subject_id,window_started_at) DO UPDATE SET
          request_count=torqueshed_social_rate_windows.request_count+1,updated_at=NOW()
        WHERE torqueshed_social_rate_windows.request_count < ${check.limit}
        RETURNING request_count
      `),
    );
    if (!accepted) {
      throw new TorqueShedSocialError(
        'Too many marketplace/community requests; retry after the rate window',
        'TORQUESHED_SOCIAL_RATE_LIMITED',
        429,
      );
    }
  }
}

export async function requireTenantPeer(tenantId: string, userId: string) {
  const row = first(
    await db.execute(sql`
      SELECT user_id FROM tenant_users WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1
    `),
  );
  if (!row) {
    throw new TorqueShedSocialError('Member not found', 'SOCIAL_MEMBER_NOT_FOUND', 404);
  }
}

export async function usersBlocked(tenantId: string, firstUser: string, secondUser: string) {
  if (firstUser === secondUser) return false;
  const row = first(
    await db.execute(sql`
      SELECT id FROM torqueshed_social_blocks
      WHERE tenant_id=${tenantId} AND (
        (blocker_user_id=${firstUser} AND blocked_user_id=${secondUser}) OR
        (blocker_user_id=${secondUser} AND blocked_user_id=${firstUser})
      ) LIMIT 1
    `),
  );
  return Boolean(row);
}

export async function assertNotBlocked(tenantId: string, firstUser: string, secondUser: string) {
  if (await usersBlocked(tenantId, firstUser, secondUser)) {
    throw new TorqueShedSocialError(
      'This interaction is unavailable',
      'SOCIAL_INTERACTION_BLOCKED',
      403,
    );
  }
}

export async function validateSocialLink(input: {
  tenantId: string;
  ownerUserId: string;
  vehicleId?: string | null;
  buildId?: string | null;
  publishing?: boolean;
}) {
  let vehicle: Record<string, any> | null = null;
  let build: Record<string, any> | null = null;
  if (input.vehicleId) {
    vehicle =
      first(
        await db.execute(sql`
          SELECT id,owner_user_id,nickname,year,make,model,visibility FROM torqueshed_vehicles
          WHERE tenant_id=${input.tenantId} AND id=${input.vehicleId} AND archived_at IS NULL LIMIT 1
        `),
      ) ?? null;
    if (!vehicle || String(vehicle.owner_user_id) !== input.ownerUserId) {
      throw new TorqueShedSocialError('Linked vehicle not found', 'SOCIAL_VEHICLE_NOT_FOUND', 404);
    }
    if (input.publishing && vehicle.visibility === 'private') {
      throw new TorqueShedSocialError(
        'A private vehicle cannot be linked to published content',
        'SOCIAL_PRIVATE_VEHICLE_LINK',
        409,
      );
    }
  }
  if (input.buildId) {
    build =
      first(
        await db.execute(sql`
          SELECT id,owner_user_id,title,status,visibility,vehicle_id FROM torqueshed_builds
          WHERE tenant_id=${input.tenantId} AND id=${input.buildId} AND archived_at IS NULL LIMIT 1
        `),
      ) ?? null;
    if (!build || String(build.owner_user_id) !== input.ownerUserId) {
      throw new TorqueShedSocialError('Linked build not found', 'SOCIAL_BUILD_NOT_FOUND', 404);
    }
    if (input.publishing && build.visibility === 'private') {
      throw new TorqueShedSocialError(
        'A private build cannot be linked to published content',
        'SOCIAL_PRIVATE_BUILD_LINK',
        409,
      );
    }
  }
  return {
    vehicle: vehicle
      ? {
          id: String(vehicle.id),
          nickname: vehicle.nickname,
          year: Number(vehicle.year),
          make: String(vehicle.make),
          model: String(vehicle.model),
        }
      : null,
    build: build
      ? { id: String(build.id), title: String(build.title), status: String(build.status) }
      : null,
  };
}

export async function rejectRecentDuplicate(input: {
  tenantId: string;
  userId: string;
  table:
    | 'torqueshed_marketplace_listings'
    | 'torqueshed_community_posts'
    | 'torqueshed_community_comments'
    | 'torqueshed_marketplace_messages';
  contentHash: string;
}) {
  const result =
    input.table === 'torqueshed_marketplace_listings'
      ? await db.execute(sql`
          SELECT id FROM torqueshed_marketplace_listings
          WHERE tenant_id=${input.tenantId} AND seller_user_id=${input.userId}
            AND content_hash=${input.contentHash} AND created_at > NOW()-INTERVAL '5 minutes'
            AND archived_at IS NULL LIMIT 1
        `)
      : input.table === 'torqueshed_community_posts'
        ? await db.execute(sql`
            SELECT id FROM torqueshed_community_posts
            WHERE tenant_id=${input.tenantId} AND author_user_id=${input.userId}
              AND content_hash=${input.contentHash} AND created_at > NOW()-INTERVAL '5 minutes'
              AND archived_at IS NULL LIMIT 1
          `)
        : input.table === 'torqueshed_community_comments'
          ? await db.execute(sql`
              SELECT id FROM torqueshed_community_comments
              WHERE tenant_id=${input.tenantId} AND author_user_id=${input.userId}
                AND content_hash=${input.contentHash} AND created_at > NOW()-INTERVAL '5 minutes'
                AND archived_at IS NULL LIMIT 1
            `)
          : await db.execute(sql`
              SELECT id FROM torqueshed_marketplace_messages
              WHERE tenant_id=${input.tenantId} AND sender_user_id=${input.userId}
                AND content_hash=${input.contentHash} AND created_at > NOW()-INTERVAL '5 minutes'
                AND archived_at IS NULL LIMIT 1
            `);
  if (result.rows[0]) {
    throw new TorqueShedSocialError(
      'Duplicate content was recently submitted',
      'SOCIAL_DUPLICATE_CONTENT',
      409,
    );
  }
}

export async function expireDueListings() {
  const expired = await db.execute(sql`
    UPDATE torqueshed_marketplace_listings
    SET status='expired',updated_at=NOW(),version=version+1
    WHERE status='published' AND expires_at IS NOT NULL AND expires_at <= NOW()
    RETURNING id,tenant_id,seller_user_id
  `);
  for (const value of expired.rows) {
    const row = value as Record<string, any>;
    await writeAudit({
      actorUserId: String(row.seller_user_id),
      tenantId: String(row.tenant_id),
      targetType: 'torqueshed_marketplace_listing',
      targetId: String(row.id),
      action: 'listing_expired_automatically',
      after: { status: 'expired' },
    });
  }
  return expired.rows.length;
}

export async function sendSocialNotification(input: {
  tenantId: string;
  recipientUserId: string;
  actorUserId: string;
  event: 'messages' | 'comments' | 'reactions' | 'follows' | 'moderation';
  body: string;
  idempotencyKey: string;
  context?: Record<string, unknown>;
}) {
  if (input.recipientUserId === input.actorUserId) return;
  if (await usersBlocked(input.tenantId, input.recipientUserId, input.actorUserId)) return;
  const preference = first(
    await db.execute(sql`
      SELECT * FROM torqueshed_social_notification_preferences
      WHERE tenant_id=${input.tenantId} AND user_id=${input.recipientUserId} LIMIT 1
    `),
  );
  if (preference && preference[`${input.event}_enabled`] === false) return;
  await enqueueOutboxMessage({
    tenantId: input.tenantId,
    moduleId: await torqueShedSocialModuleId(),
    requestedByUserId: input.actorUserId,
    recipientUserId: input.recipientUserId,
    channel: 'in_app',
    body: input.body.slice(0, 500),
    context: input.context,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function createSocialAttachment(input: Parameters<typeof createAttachment>[0]) {
  return createAttachment(input);
}

export async function listSocialAttachments(input: Parameters<typeof listAttachments>[0]) {
  return listAttachments(input);
}

export async function getSocialAttachment(input: Parameters<typeof getAttachmentContent>[0]) {
  return getAttachmentContent(input);
}

export async function deleteSocialAttachment(input: Parameters<typeof softDeleteAttachment>[0]) {
  return softDeleteAttachment(input);
}
