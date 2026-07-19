import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { writeAudit } from '../lib/audit.js';
import { getMaxAttachmentBytes } from '../lib/shared-attachments.js';
import {
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  parseCommentInput,
  parseListQuery,
  parseListingInput,
  parseMessageInput,
  parsePostInput,
  parseProfileInput,
  parseReaction,
  parseReportInput,
  plainText,
  socialId,
  TorqueShedSocialError,
} from '../lib/torqueshed-social-domain.js';
import {
  assertNotBlocked,
  consumeSocialRate,
  createSocialAttachment,
  deleteSocialAttachment,
  ensureSocialTaxonomy,
  expireDueListings,
  getSocialAttachment,
  listSocialAttachments,
  rejectRecentDuplicate,
  requireTenantPeer,
  sendSocialNotification,
  socialCamel,
  torqueShedSocialModuleId,
  validateSocialLink,
} from '../lib/torqueshed-social-service.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('torqueshed')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const socialMediaBodyLimit = Math.ceil(getMaxAttachmentBytes() * 1.38) + 16_384;

type Context = { tenantId: string; role: 'owner' | 'admin' | 'member'; viaPlatformRole: boolean };

function tenant(request: FastifyRequest): string {
  return ((request as any).tenantContext as Context).tenantId;
}

function user(request: FastifyRequest): string {
  return String((request as any).user.id);
}

function canManage(request: FastifyRequest): boolean {
  const context = (request as any).tenantContext as Context;
  const access = (request as any).tenantModuleAccessLevel as string | undefined;
  return (
    context.viaPlatformRole ||
    context.role === 'owner' ||
    context.role === 'admin' ||
    access === 'manager'
  );
}

function body(request: FastifyRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new TorqueShedSocialError('A JSON object is required', 'SOCIAL_BODY_INVALID');
  }
  return request.body as Record<string, unknown>;
}

function id(request: FastifyRequest, name = 'id'): string {
  return socialId((request.params as Record<string, unknown>)[name], name, true)!;
}

function version(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new TorqueShedSocialError(
      'expectedVersion must be a positive integer',
      'SOCIAL_VERSION_REQUIRED',
      400,
      'expectedVersion',
    );
  }
  return Number(value);
}

function first(result: { rows: unknown[] }): Record<string, any> | null {
  return result.rows[0] ? socialCamel(result.rows[0] as Record<string, any>) : null;
}

function list(result: { rows: unknown[] }): Record<string, any>[] {
  return result.rows.map((row) => socialCamel(row as Record<string, any>));
}

function notFound(reply: FastifyReply, kind: string) {
  return reply.code(404).send({ error: `${kind} not found`, code: 'SOCIAL_NOT_FOUND' });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof TorqueShedSocialError) {
    return reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      ...(error.field ? { field: error.field } : {}),
    });
  }
  const pg = error as { code?: string; constraint?: string };
  if (pg?.code === '23505') {
    return reply.code(409).send({
      error: 'A matching marketplace/community record already exists',
      code: 'SOCIAL_DUPLICATE',
      constraint: pg.constraint,
    });
  }
  if (pg?.code === '23503') return notFound(reply, 'Related record');
  throw error;
}

async function audit(
  request: FastifyRequest,
  targetType: string,
  targetId: string,
  action: string,
  after?: Record<string, unknown>,
) {
  await writeAudit(
    {
      actorUserId: user(request),
      tenantId: tenant(request),
      targetType,
      targetId,
      action,
      after,
      extra: { moduleSlug: 'torqueshed' },
    },
    request,
  );
}

async function categoryId(tenantId: string, slug: string) {
  await ensureSocialTaxonomy(tenantId);
  const row = first(
    await db.execute(sql`
      SELECT id FROM torqueshed_marketplace_categories
      WHERE tenant_id=${tenantId} AND slug=${slug} AND active=TRUE LIMIT 1
    `),
  );
  if (!row)
    throw new TorqueShedSocialError('Category not found', 'MARKETPLACE_CATEGORY_NOT_FOUND', 404);
  return String(row.id);
}

async function topicId(tenantId: string, slug: string) {
  await ensureSocialTaxonomy(tenantId);
  const row = first(
    await db.execute(sql`
      SELECT id FROM torqueshed_community_topics
      WHERE tenant_id=${tenantId} AND slug=${slug} AND active=TRUE LIMIT 1
    `),
  );
  if (!row) throw new TorqueShedSocialError('Topic not found', 'COMMUNITY_TOPIC_NOT_FOUND', 404);
  return String(row.id);
}

async function listingRow(request: FastifyRequest, listingId: string, write = false) {
  const row = first(
    await db.execute(sql`
      SELECT l.*,c.slug AS category_slug,c.name AS category_name,
        p.display_name AS seller_display_name,p.locality AS seller_locality,p.region AS seller_region,
        (SELECT COUNT(*)::int FROM torqueshed_marketplace_favorites f
          WHERE f.tenant_id=l.tenant_id AND f.listing_id=l.id) AS favorite_count,
        EXISTS(SELECT 1 FROM torqueshed_marketplace_favorites f
          WHERE f.tenant_id=l.tenant_id AND f.listing_id=l.id AND f.user_id=${user(request)}) AS favorited
      FROM torqueshed_marketplace_listings l
      JOIN torqueshed_marketplace_categories c ON c.tenant_id=l.tenant_id AND c.id=l.category_id
      LEFT JOIN torqueshed_social_profiles p ON p.tenant_id=l.tenant_id AND p.user_id=l.seller_user_id AND p.archived_at IS NULL
      WHERE l.tenant_id=${tenant(request)} AND l.id=${listingId} AND l.archived_at IS NULL
        AND (${canManage(request)} OR l.seller_user_id=${user(request)} OR (NOT ${write} AND l.status='published'))
        AND NOT EXISTS (
          SELECT 1 FROM torqueshed_social_blocks b WHERE b.tenant_id=l.tenant_id AND
          ((b.blocker_user_id=${user(request)} AND b.blocked_user_id=l.seller_user_id) OR
           (b.blocker_user_id=l.seller_user_id AND b.blocked_user_id=${user(request)}))
        )
      LIMIT 1
    `),
  );
  return row;
}

async function postRow(request: FastifyRequest, postId: string, write = false) {
  return first(
    await db.execute(sql`
      SELECT p.*,t.slug AS topic_slug,t.name AS topic_name,sp.display_name AS author_display_name,
        (SELECT COUNT(*)::int FROM torqueshed_community_comments c
          WHERE c.tenant_id=p.tenant_id AND c.post_id=p.id AND c.status='published' AND c.archived_at IS NULL) AS comment_count,
        (SELECT COUNT(*)::int FROM torqueshed_community_post_reactions r
          WHERE r.tenant_id=p.tenant_id AND r.post_id=p.id) AS reaction_count,
        (SELECT r.reaction FROM torqueshed_community_post_reactions r
          WHERE r.tenant_id=p.tenant_id AND r.post_id=p.id AND r.user_id=${user(request)} LIMIT 1) AS viewer_reaction
      FROM torqueshed_community_posts p
      LEFT JOIN torqueshed_community_topics t ON t.tenant_id=p.tenant_id AND t.id=p.topic_id
      LEFT JOIN torqueshed_social_profiles sp ON sp.tenant_id=p.tenant_id AND sp.user_id=p.author_user_id AND sp.archived_at IS NULL
      WHERE p.tenant_id=${tenant(request)} AND p.id=${postId} AND p.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM torqueshed_social_blocks b WHERE b.tenant_id=p.tenant_id AND
          ((b.blocker_user_id=${user(request)} AND b.blocked_user_id=p.author_user_id) OR
           (b.blocker_user_id=p.author_user_id AND b.blocked_user_id=${user(request)}))
        )
        AND (
          ${canManage(request)} OR p.author_user_id=${user(request)} OR
          (NOT ${write} AND p.status='published' AND (
            p.visibility='public' OR (p.visibility='followers' AND EXISTS (
              SELECT 1 FROM torqueshed_community_follows f WHERE f.tenant_id=p.tenant_id
                AND f.follower_user_id=${user(request)} AND f.followed_user_id=p.author_user_id
            ))
          ))
        )
      LIMIT 1
    `),
  );
}

async function assertPublishableMedia(tenantId: string, objectType: string, objectId: string) {
  const moduleId = await torqueShedSocialModuleId();
  const blocked = first(
    await db.execute(sql`
      SELECT id FROM shared_attachments
      WHERE tenant_id=${tenantId} AND module_id=${moduleId}
        AND object_type=${objectType} AND object_id=${objectId} AND deleted_at IS NULL
        AND scan_status <> 'clean' LIMIT 1
    `),
  );
  if (blocked) {
    throw new TorqueShedSocialError(
      'Media must finish a clean security scan before publication',
      'SOCIAL_MEDIA_NOT_CLEAN',
      409,
    );
  }
}

async function visibleSocialObject(
  request: FastifyRequest,
  objectType: 'marketplace_listing' | 'community_post' | 'community_comment',
  objectId: string,
  write = false,
) {
  if (objectType === 'marketplace_listing') {
    const row = await listingRow(request, objectId, write);
    return row ? { ...row, ownerUserId: String(row.sellerUserId) } : null;
  }
  if (objectType === 'community_post') {
    const row = await postRow(request, objectId, write);
    return row ? { ...row, ownerUserId: String(row.authorUserId) } : null;
  }
  const comment = first(
    await db.execute(sql`
      SELECT id,post_id,author_user_id,status FROM torqueshed_community_comments
      WHERE tenant_id=${tenant(request)} AND id=${objectId} AND archived_at IS NULL LIMIT 1
    `),
  );
  if (!comment) return null;
  const post = await postRow(request, String(comment.postId), write);
  if (!post) return null;
  const owner = String(comment.authorUserId) === user(request);
  if (write && !owner && !canManage(request)) return null;
  if (!write && comment.status !== 'published' && !owner && !canManage(request)) return null;
  return { ...comment, ownerUserId: String(comment.authorUserId) };
}

async function createReport(
  request: FastifyRequest,
  targetType: string,
  targetId: string,
  ownerUserId: string,
) {
  await consumeSocialRate({ tenantId: tenant(request), userId: user(request), kind: 'report' });
  if (ownerUserId === user(request)) {
    throw new TorqueShedSocialError(
      'You cannot report your own content',
      'SOCIAL_SELF_REPORT',
      409,
    );
  }
  const input = parseReportInput(body(request));
  const row = first(
    await db.execute(sql`
      INSERT INTO torqueshed_social_reports
        (tenant_id,reporter_user_id,target_type,target_id,reason_code,details)
      VALUES (${tenant(request)},${user(request)},${targetType},${targetId},${input.reasonCode},${input.details})
      RETURNING *
    `),
  )!;
  await audit(request, 'torqueshed_social_report', String(row.id), 'social_content_reported', {
    targetType,
    targetId,
    reasonCode: input.reasonCode,
  });
  return row;
}

async function moderationTargetOwner(tenantId: string, targetType: string, targetId: string) {
  const result =
    targetType === 'listing'
      ? await db.execute(
          sql`SELECT seller_user_id AS owner_user_id FROM torqueshed_marketplace_listings WHERE tenant_id=${tenantId} AND id=${targetId} LIMIT 1`,
        )
      : targetType === 'message'
        ? await db.execute(
            sql`SELECT sender_user_id AS owner_user_id FROM torqueshed_marketplace_messages WHERE tenant_id=${tenantId} AND id=${targetId} LIMIT 1`,
          )
        : targetType === 'post'
          ? await db.execute(
              sql`SELECT author_user_id AS owner_user_id FROM torqueshed_community_posts WHERE tenant_id=${tenantId} AND id=${targetId} LIMIT 1`,
            )
          : targetType === 'comment'
            ? await db.execute(
                sql`SELECT author_user_id AS owner_user_id FROM torqueshed_community_comments WHERE tenant_id=${tenantId} AND id=${targetId} LIMIT 1`,
              )
            : await db.execute(
                sql`SELECT user_id AS owner_user_id FROM torqueshed_social_profiles WHERE tenant_id=${tenantId} AND user_id=${targetId} LIMIT 1`,
              );
  return result.rows[0] ? String(result.rows[0].owner_user_id) : null;
}

export async function registerTorqueShedSocialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/torqueshed/social/policy', { preHandler: readGuards }, async () => ({
    visibility: 'Authenticated same-tenant members only; no anonymous publication.',
    transactionMode: 'off_platform_after_in_app_contact',
    protectionClaims: false,
    exactLocationAllowed: false,
    cleanMediaRequired: true,
    prohibitedClaims: [
      'escrow',
      'shipping protection',
      'tax handling',
      'payment protection',
      'inspection',
      'title verification',
      'guarantees',
    ],
  }));

  app.get(
    '/v1/modules/torqueshed/marketplace/categories',
    { preHandler: readGuards },
    async (request) => {
      await ensureSocialTaxonomy(tenant(request));
      return {
        categories: list(
          await db.execute(sql`
          SELECT id,slug,name,display_order FROM torqueshed_marketplace_categories
          WHERE tenant_id=${tenant(request)} AND active=TRUE ORDER BY display_order,slug
        `),
        ),
      };
    },
  );

  app.get(
    '/v1/modules/torqueshed/community/topics',
    { preHandler: readGuards },
    async (request) => {
      await ensureSocialTaxonomy(tenant(request));
      return {
        topics: list(
          await db.execute(sql`
          SELECT id,slug,name,display_order FROM torqueshed_community_topics
          WHERE tenant_id=${tenant(request)} AND active=TRUE ORDER BY display_order,slug
        `),
        ),
      };
    },
  );

  app.get(
    '/v1/modules/torqueshed/community/profile/me',
    { preHandler: readGuards },
    async (request) => ({
      viewerUserId: user(request),
      profile: first(
        await db.execute(sql`
        SELECT * FROM torqueshed_social_profiles WHERE tenant_id=${tenant(request)}
          AND user_id=${user(request)} AND archived_at IS NULL LIMIT 1
      `),
      ),
      preferences: first(
        await db.execute(sql`
        SELECT * FROM torqueshed_social_notification_preferences
        WHERE tenant_id=${tenant(request)} AND user_id=${user(request)} LIMIT 1
      `),
      ) ?? {
        messagesEnabled: true,
        commentsEnabled: true,
        reactionsEnabled: false,
        followsEnabled: true,
        moderationEnabled: true,
        version: 0,
      },
    }),
  );

  app.put(
    '/v1/modules/torqueshed/community/profile/me',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const input = parseProfileInput(body(request));
        const row = first(
          await db.execute(sql`
          INSERT INTO torqueshed_social_profiles
            (tenant_id,user_id,display_name,bio,specialties,locality,region,country_code,visibility,created_by_user_id,updated_by_user_id)
          VALUES (${tenant(request)},${user(request)},${input.displayName},${input.bio},${input.specialties},
            ${input.locality},${input.region},${input.countryCode},${input.visibility},${user(request)},${user(request)})
          ON CONFLICT (tenant_id,user_id) DO UPDATE SET
            display_name=EXCLUDED.display_name,bio=EXCLUDED.bio,specialties=EXCLUDED.specialties,
            locality=EXCLUDED.locality,region=EXCLUDED.region,country_code=EXCLUDED.country_code,
            visibility=EXCLUDED.visibility,updated_by_user_id=EXCLUDED.updated_by_user_id,
            version=torqueshed_social_profiles.version+1,updated_at=NOW(),archived_at=NULL
          RETURNING *
        `),
        )!;
        await audit(request, 'torqueshed_social_profile', String(row.id), 'social_profile_saved', {
          visibility: input.visibility,
          locality: input.locality,
          region: input.region,
          countryCode: input.countryCode,
        });
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/community/profiles/:userId',
    { preHandler: readGuards },
    async (request, reply) => {
      const peerId = id(request, 'userId');
      const row = first(
        await db.execute(sql`
        SELECT user_id,display_name,bio,specialties,locality,region,country_code,visibility,created_at,updated_at
        FROM torqueshed_social_profiles WHERE tenant_id=${tenant(request)} AND user_id=${peerId}
          AND archived_at IS NULL AND (visibility='tenant' OR user_id=${user(request)})
          AND NOT EXISTS (SELECT 1 FROM torqueshed_social_blocks b WHERE b.tenant_id=${tenant(request)} AND
            ((b.blocker_user_id=${user(request)} AND b.blocked_user_id=${peerId}) OR
             (b.blocker_user_id=${peerId} AND b.blocked_user_id=${user(request)})))
        LIMIT 1
      `),
      );
      return row ?? notFound(reply, 'Profile');
    },
  );

  app.post(
    '/v1/modules/torqueshed/community/profiles/:userId/report',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const profileUserId = id(request, 'userId');
        const profile = first(
          await db.execute(sql`
          SELECT user_id FROM torqueshed_social_profiles
          WHERE tenant_id=${tenant(request)} AND user_id=${profileUserId} AND archived_at IS NULL
          LIMIT 1
        `),
        );
        if (!profile) return notFound(reply, 'Profile');
        return reply
          .code(201)
          .send(await createReport(request, 'profile', profileUserId, profileUserId));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/preferences',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const boolean = (name: string, fallback: boolean) =>
          input[name] === undefined ? fallback : input[name] === true;
        const row = first(
          await db.execute(sql`
          INSERT INTO torqueshed_social_notification_preferences
            (tenant_id,user_id,messages_enabled,comments_enabled,reactions_enabled,follows_enabled,moderation_enabled)
          VALUES (${tenant(request)},${user(request)},${boolean('messagesEnabled', true)},${boolean('commentsEnabled', true)},
            ${boolean('reactionsEnabled', false)},${boolean('followsEnabled', true)},${boolean('moderationEnabled', true)})
          ON CONFLICT (tenant_id,user_id) DO UPDATE SET
            messages_enabled=EXCLUDED.messages_enabled,comments_enabled=EXCLUDED.comments_enabled,
            reactions_enabled=EXCLUDED.reactions_enabled,follows_enabled=EXCLUDED.follows_enabled,
            moderation_enabled=EXCLUDED.moderation_enabled,version=torqueshed_social_notification_preferences.version+1,
            updated_at=NOW()
          RETURNING *
        `),
        )!;
        await audit(
          request,
          'torqueshed_social_preferences',
          String(row.id),
          'social_preferences_saved',
        );
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/blocks/:userId',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const blockedId = id(request, 'userId');
        if (blockedId === user(request)) {
          throw new TorqueShedSocialError(
            'You cannot block yourself',
            'SOCIAL_SELF_INTERACTION',
            409,
          );
        }
        await requireTenantPeer(tenant(request), blockedId);
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        await db.transaction(async (tx) => {
          await tx.execute(sql`
          INSERT INTO torqueshed_social_blocks (tenant_id,blocker_user_id,blocked_user_id)
          VALUES (${tenant(request)},${user(request)},${blockedId}) ON CONFLICT DO NOTHING
        `);
          await tx.execute(sql`
          DELETE FROM torqueshed_community_follows WHERE tenant_id=${tenant(request)} AND
            ((follower_user_id=${user(request)} AND followed_user_id=${blockedId}) OR
             (follower_user_id=${blockedId} AND followed_user_id=${user(request)}))
        `);
        });
        await audit(request, 'torqueshed_social_profile', blockedId, 'social_user_blocked');
        return { blocked: true, userId: blockedId };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/community/blocks/:userId',
    { preHandler: writeGuards },
    async (request) => {
      const blockedId = id(request, 'userId');
      await db.execute(sql`
      DELETE FROM torqueshed_social_blocks WHERE tenant_id=${tenant(request)}
        AND blocker_user_id=${user(request)} AND blocked_user_id=${blockedId}
    `);
      await audit(request, 'torqueshed_social_profile', blockedId, 'social_user_unblocked');
      return { blocked: false, userId: blockedId };
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/follows/:userId',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const followedId = id(request, 'userId');
        if (followedId === user(request)) {
          throw new TorqueShedSocialError(
            'You cannot follow yourself',
            'SOCIAL_SELF_INTERACTION',
            409,
          );
        }
        await requireTenantPeer(tenant(request), followedId);
        await assertNotBlocked(tenant(request), user(request), followedId);
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        await db.execute(sql`
        INSERT INTO torqueshed_community_follows (tenant_id,follower_user_id,followed_user_id)
        VALUES (${tenant(request)},${user(request)},${followedId}) ON CONFLICT DO NOTHING
      `);
        await sendSocialNotification({
          tenantId: tenant(request),
          recipientUserId: followedId,
          actorUserId: user(request),
          event: 'follows',
          body: 'A TorqueShed member followed your community profile.',
          idempotencyKey: `social:follow:${user(request)}:${followedId}`,
        });
        await audit(request, 'torqueshed_social_profile', followedId, 'social_user_followed');
        return { following: true, userId: followedId };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/community/follows/:userId',
    { preHandler: writeGuards },
    async (request) => {
      const followedId = id(request, 'userId');
      await db.execute(sql`
      DELETE FROM torqueshed_community_follows WHERE tenant_id=${tenant(request)}
        AND follower_user_id=${user(request)} AND followed_user_id=${followedId}
    `);
      await audit(request, 'torqueshed_social_profile', followedId, 'social_user_unfollowed');
      return { following: false, userId: followedId };
    },
  );

  app.get(
    '/v1/modules/torqueshed/marketplace/listings',
    { preHandler: readGuards },
    async (request) => {
      await expireDueListings();
      await ensureSocialTaxonomy(tenant(request));
      const query = request.query as Record<string, unknown>;
      const paging = parseListQuery(query);
      const mine = query.scope === 'mine';
      const favorites = query.scope === 'favorites';
      const category = typeof query.category === 'string' ? query.category : null;
      const listingType = typeof query.type === 'string' ? query.type : null;
      const condition = typeof query.condition === 'string' ? query.condition : null;
      const search = paging.search ? `%${paging.search.toLowerCase()}%` : null;
      const rows = await db.execute(sql`
      SELECT l.*,c.slug AS category_slug,c.name AS category_name,p.display_name AS seller_display_name,
        (SELECT COUNT(*)::int FROM torqueshed_marketplace_favorites f
          WHERE f.tenant_id=l.tenant_id AND f.listing_id=l.id) AS favorite_count,
        EXISTS(SELECT 1 FROM torqueshed_marketplace_favorites f
          WHERE f.tenant_id=l.tenant_id AND f.listing_id=l.id AND f.user_id=${user(request)}) AS favorited,
        v.nickname AS vehicle_nickname,v.year AS vehicle_year,v.make AS vehicle_make,v.model AS vehicle_model,
        b.title AS build_title
      FROM torqueshed_marketplace_listings l
      JOIN torqueshed_marketplace_categories c ON c.tenant_id=l.tenant_id AND c.id=l.category_id
      LEFT JOIN torqueshed_social_profiles p ON p.tenant_id=l.tenant_id AND p.user_id=l.seller_user_id AND p.archived_at IS NULL
      LEFT JOIN torqueshed_vehicles v ON v.tenant_id=l.tenant_id AND v.id=l.vehicle_id AND v.visibility<>'private' AND v.archived_at IS NULL
      LEFT JOIN torqueshed_builds b ON b.tenant_id=l.tenant_id AND b.id=l.build_id AND b.visibility<>'private' AND b.archived_at IS NULL
      WHERE l.tenant_id=${tenant(request)} AND l.archived_at IS NULL
        AND (${mine} AND l.seller_user_id=${user(request)} OR NOT ${mine} AND l.status='published')
        AND (NOT ${favorites} OR EXISTS (SELECT 1 FROM torqueshed_marketplace_favorites ff
          WHERE ff.tenant_id=l.tenant_id AND ff.listing_id=l.id AND ff.user_id=${user(request)}))
        AND (${category}::text IS NULL OR c.slug=${category})
        AND (${listingType}::text IS NULL OR l.listing_type=${listingType})
        AND (${condition}::text IS NULL OR l.condition=${condition})
        AND (${search}::text IS NULL OR lower(l.title) LIKE ${search} OR lower(l.description) LIKE ${search})
        AND NOT EXISTS (SELECT 1 FROM torqueshed_social_blocks x WHERE x.tenant_id=l.tenant_id AND
          ((x.blocker_user_id=${user(request)} AND x.blocked_user_id=l.seller_user_id) OR
           (x.blocker_user_id=l.seller_user_id AND x.blocked_user_id=${user(request)})))
      ORDER BY
        CASE WHEN ${paging.sort}='price_asc' THEN l.price_minor END ASC NULLS LAST,
        CASE WHEN ${paging.sort}='price_desc' THEN l.price_minor END DESC NULLS LAST,
        l.created_at DESC,l.id DESC
      LIMIT ${paging.limit} OFFSET ${paging.offset}
    `);
      return { listings: list(rows), pagination: { limit: paging.limit, offset: paging.offset } };
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/listings',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const input = parseListingInput(body(request));
        await rejectRecentDuplicate({
          tenantId: tenant(request),
          userId: user(request),
          table: 'torqueshed_marketplace_listings',
          contentHash: input.contentHash,
        });
        await validateSocialLink({
          tenantId: tenant(request),
          ownerUserId: user(request),
          vehicleId: input.vehicleId,
          buildId: input.buildId,
        });
        const category = await categoryId(tenant(request), input.categorySlug);
        const row = first(
          await db.execute(sql`
          INSERT INTO torqueshed_marketplace_listings
            (tenant_id,seller_user_id,category_id,vehicle_id,build_id,listing_type,status,condition,title,description,
             price_minor,currency,negotiable,locality,region,country_code,content_hash,created_by_user_id,updated_by_user_id)
          VALUES (${tenant(request)},${user(request)},${category},${input.vehicleId},${input.buildId},${input.type},'draft',
            ${input.condition},${input.title},${input.description},${input.priceMinor},${input.currency},${input.negotiable},
            ${input.locality},${input.region},${input.countryCode},${input.contentHash},${user(request)},${user(request)})
          RETURNING *
        `),
        )!;
        await audit(
          request,
          'torqueshed_marketplace_listing',
          String(row.id),
          'marketplace_listing_created',
          { status: 'draft' },
        );
        return reply.code(201).send(row);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/marketplace/listings/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      await expireDueListings();
      const row = await listingRow(request, id(request));
      if (!row) return notFound(reply, 'Listing');
      const attachments = await listSocialAttachments({
        tenantId: tenant(request),
        moduleId: await torqueShedSocialModuleId(),
        objectType: 'marketplace_listing',
        objectId: String(row.id),
        limit: 20,
      });
      return {
        listing: row,
        media: (attachments as any[]).filter((item) =>
          row.sellerUserId === user(request) || canManage(request)
            ? true
            : item.scan_status === 'clean',
        ),
        transactionPolicy:
          'Contact only; payment and fulfillment are off-platform with no TorqueShed protection.',
      };
    },
  );

  app.put(
    '/v1/modules/torqueshed/marketplace/listings/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const listingId = id(request);
        const current = await listingRow(request, listingId, true);
        if (!current) return notFound(reply, 'Listing');
        if (!canManage(request) && current.sellerUserId !== user(request))
          return notFound(reply, 'Listing');
        if (!['draft', 'expired'].includes(String(current.status))) {
          throw new TorqueShedSocialError(
            'Only draft or expired listings may be edited',
            'MARKETPLACE_EDIT_STATE_CONFLICT',
            409,
          );
        }
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const raw = body(request);
        const expectedVersion = version(raw.expectedVersion);
        const input = parseListingInput(raw);
        await validateSocialLink({
          tenantId: tenant(request),
          ownerUserId: String(current.sellerUserId),
          vehicleId: input.vehicleId,
          buildId: input.buildId,
        });
        const category = await categoryId(tenant(request), input.categorySlug);
        const row = first(
          await db.execute(sql`
          UPDATE torqueshed_marketplace_listings SET category_id=${category},vehicle_id=${input.vehicleId},build_id=${input.buildId},
            listing_type=${input.type},condition=${input.condition},title=${input.title},description=${input.description},
            price_minor=${input.priceMinor},currency=${input.currency},negotiable=${input.negotiable},locality=${input.locality},
            region=${input.region},country_code=${input.countryCode},content_hash=${input.contentHash},
            updated_by_user_id=${user(request)},updated_at=NOW(),version=version+1
          WHERE tenant_id=${tenant(request)} AND id=${listingId} AND version=${expectedVersion}
            AND status IN ('draft','expired') AND archived_at IS NULL
          RETURNING *
        `),
        );
        if (!row)
          throw new TorqueShedSocialError(
            'Listing changed; reload and retry',
            'SOCIAL_VERSION_CONFLICT',
            409,
          );
        await audit(
          request,
          'torqueshed_marketplace_listing',
          listingId,
          'marketplace_listing_updated',
        );
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/listings/:id/publish',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const listingId = id(request);
        const current = await listingRow(request, listingId, true);
        if (!current || (!canManage(request) && current.sellerUserId !== user(request)))
          return notFound(reply, 'Listing');
        const expectedVersion = version(body(request).expectedVersion);
        await validateSocialLink({
          tenantId: tenant(request),
          ownerUserId: String(current.sellerUserId),
          vehicleId: current.vehicleId,
          buildId: current.buildId,
          publishing: true,
        });
        await assertPublishableMedia(tenant(request), 'marketplace_listing', listingId);
        const row = first(
          await db.execute(sql`
          UPDATE torqueshed_marketplace_listings SET status='published',published_at=COALESCE(published_at,NOW()),
            expires_at=NOW()+INTERVAL '30 days',updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
          WHERE tenant_id=${tenant(request)} AND id=${listingId} AND version=${expectedVersion}
            AND status IN ('draft','expired') AND archived_at IS NULL RETURNING *
        `),
        );
        if (!row)
          throw new TorqueShedSocialError(
            'Listing changed or cannot be published',
            'MARKETPLACE_PUBLISH_CONFLICT',
            409,
          );
        await audit(
          request,
          'torqueshed_marketplace_listing',
          listingId,
          'marketplace_listing_published',
          { expiresAt: row.expiresAt },
        );
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/listings/:id/renew',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const listingId = id(request);
        const expectedVersion = version(body(request).expectedVersion);
        const row = first(
          await db.execute(sql`
          UPDATE torqueshed_marketplace_listings SET status='published',renewed_at=NOW(),
            expires_at=NOW()+INTERVAL '30 days',updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
          WHERE tenant_id=${tenant(request)} AND id=${listingId} AND seller_user_id=${user(request)}
            AND version=${expectedVersion} AND status='expired' AND archived_at IS NULL RETURNING *
        `),
        );
        if (!row)
          throw new TorqueShedSocialError(
            'Expired listing not found or changed',
            'MARKETPLACE_RENEW_CONFLICT',
            409,
          );
        await audit(
          request,
          'torqueshed_marketplace_listing',
          listingId,
          'marketplace_listing_renewed',
          { expiresAt: row.expiresAt },
        );
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/listings/:id/status',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const listingId = id(request);
        const raw = body(request);
        const next = raw.status;
        if (!['sold', 'archived'].includes(String(next))) {
          throw new TorqueShedSocialError(
            'status must be sold or archived',
            'MARKETPLACE_STATUS_INVALID',
          );
        }
        const row = first(
          await db.execute(sql`
          UPDATE torqueshed_marketplace_listings SET status=${String(next)},
            sold_at=CASE WHEN ${String(next)}='sold' THEN NOW() ELSE sold_at END,
            archived_at=CASE WHEN ${String(next)}='archived' THEN NOW() ELSE archived_at END,
            updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
          WHERE tenant_id=${tenant(request)} AND id=${listingId} AND seller_user_id=${user(request)}
            AND version=${version(raw.expectedVersion)} AND status IN ('draft','published','expired') RETURNING *
        `),
        );
        if (!row)
          throw new TorqueShedSocialError(
            'Listing not found or changed',
            'MARKETPLACE_STATUS_CONFLICT',
            409,
          );
        await audit(
          request,
          'torqueshed_marketplace_listing',
          listingId,
          `marketplace_listing_${next}`,
        );
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/v1/modules/torqueshed/marketplace/listings/:id/favorite',
    { preHandler: writeGuards },
    async (request, reply) => {
      await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
      const listingId = id(request);
      if (!(await listingRow(request, listingId))) return notFound(reply, 'Listing');
      await db.execute(sql`
      INSERT INTO torqueshed_marketplace_favorites (tenant_id,user_id,listing_id)
      VALUES (${tenant(request)},${user(request)},${listingId}) ON CONFLICT DO NOTHING
    `);
      return { favorited: true };
    },
  );

  app.delete(
    '/v1/modules/torqueshed/marketplace/listings/:id/favorite',
    { preHandler: writeGuards },
    async (request) => {
      await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
      await db.execute(sql`
      DELETE FROM torqueshed_marketplace_favorites WHERE tenant_id=${tenant(request)}
        AND user_id=${user(request)} AND listing_id=${id(request)}
    `);
      return { favorited: false };
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/listings/:id/contact',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const listingId = id(request);
        const listing = await listingRow(request, listingId);
        if (!listing || listing.status !== 'published') return notFound(reply, 'Listing');
        if (String(listing.sellerUserId) === user(request)) {
          throw new TorqueShedSocialError(
            'You cannot contact yourself about your own listing',
            'SOCIAL_SELF_INTERACTION',
            409,
          );
        }
        await assertNotBlocked(tenant(request), user(request), String(listing.sellerUserId));
        await consumeSocialRate({
          tenantId: tenant(request),
          userId: user(request),
          kind: 'message',
        });
        const message = parseMessageInput(body(request));
        await rejectRecentDuplicate({
          tenantId: tenant(request),
          userId: user(request),
          table: 'torqueshed_marketplace_messages',
          contentHash: message.contentHash,
        });
        const result = await db.transaction(async (tx) => {
          let conversation = first(
            await tx.execute(sql`
            INSERT INTO torqueshed_marketplace_conversations
              (tenant_id,listing_id,buyer_user_id,seller_user_id)
            VALUES (${tenant(request)},${listingId},${user(request)},${String(listing.sellerUserId)})
            ON CONFLICT (tenant_id,listing_id,buyer_user_id) DO NOTHING RETURNING *
          `),
          );
          if (!conversation) {
            conversation = first(
              await tx.execute(sql`
              SELECT * FROM torqueshed_marketplace_conversations WHERE tenant_id=${tenant(request)}
                AND listing_id=${listingId} AND buyer_user_id=${user(request)} LIMIT 1
            `),
            );
          }
          const created = first(
            await tx.execute(sql`
            INSERT INTO torqueshed_marketplace_messages
              (tenant_id,conversation_id,sender_user_id,body,content_hash)
            VALUES (${tenant(request)},${String(conversation!.id)},${user(request)},${message.body},${message.contentHash})
            RETURNING *
          `),
          )!;
          await tx.execute(sql`
          UPDATE torqueshed_marketplace_conversations SET updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${String(conversation!.id)}
        `);
          return { conversation, message: created };
        });
        await sendSocialNotification({
          tenantId: tenant(request),
          recipientUserId: String(listing.sellerUserId),
          actorUserId: user(request),
          event: 'messages',
          body: `A member contacted you about "${String(listing.title).slice(0, 100)}".`,
          idempotencyKey: `social:message:${String(result.message.id)}`,
          context: { listingId, conversationId: result.conversation!.id },
        });
        await audit(
          request,
          'torqueshed_marketplace_conversation',
          String(result.conversation!.id),
          'marketplace_seller_contacted',
          { listingId },
        );
        return reply.code(201).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/marketplace/conversations',
    { preHandler: readGuards },
    async (request) => ({
      conversations: list(
        await db.execute(sql`
        SELECT c.*,l.title AS listing_title,l.status AS listing_status,
          CASE WHEN c.buyer_user_id=${user(request)} THEN c.seller_user_id ELSE c.buyer_user_id END AS other_user_id,
          (SELECT body FROM torqueshed_marketplace_messages m WHERE m.tenant_id=c.tenant_id
            AND m.conversation_id=c.id AND m.archived_at IS NULL ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS last_message
        FROM torqueshed_marketplace_conversations c
        JOIN torqueshed_marketplace_listings l ON l.tenant_id=c.tenant_id AND l.id=c.listing_id
        WHERE c.tenant_id=${tenant(request)} AND c.archived_at IS NULL
          AND (c.buyer_user_id=${user(request)} OR c.seller_user_id=${user(request)})
          AND NOT EXISTS (SELECT 1 FROM torqueshed_social_blocks b WHERE b.tenant_id=c.tenant_id AND
            ((b.blocker_user_id=${user(request)} AND b.blocked_user_id=CASE WHEN c.buyer_user_id=${user(request)} THEN c.seller_user_id ELSE c.buyer_user_id END) OR
             (b.blocked_user_id=${user(request)} AND b.blocker_user_id=CASE WHEN c.buyer_user_id=${user(request)} THEN c.seller_user_id ELSE c.buyer_user_id END)))
        ORDER BY c.updated_at DESC LIMIT 100
      `),
      ),
    }),
  );

  app.get(
    '/v1/modules/torqueshed/marketplace/conversations/:id/messages',
    { preHandler: readGuards },
    async (request, reply) => {
      const conversationId = id(request);
      const conversation = first(
        await db.execute(sql`
        SELECT * FROM torqueshed_marketplace_conversations WHERE tenant_id=${tenant(request)} AND id=${conversationId}
          AND archived_at IS NULL AND (buyer_user_id=${user(request)} OR seller_user_id=${user(request)}) LIMIT 1
      `),
      );
      if (!conversation) return notFound(reply, 'Conversation');
      await assertNotBlocked(
        tenant(request),
        String(conversation.buyerUserId),
        String(conversation.sellerUserId),
      );
      return {
        conversation,
        messages: list(
          await db.execute(sql`
          SELECT * FROM torqueshed_marketplace_messages WHERE tenant_id=${tenant(request)}
            AND conversation_id=${conversationId} AND archived_at IS NULL ORDER BY created_at,id LIMIT 250
        `),
        ),
      };
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/conversations/:id/messages',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const conversationId = id(request);
        const conversation = first(
          await db.execute(sql`
          SELECT * FROM torqueshed_marketplace_conversations WHERE tenant_id=${tenant(request)} AND id=${conversationId}
            AND archived_at IS NULL AND (buyer_user_id=${user(request)} OR seller_user_id=${user(request)}) LIMIT 1
        `),
        );
        if (!conversation) return notFound(reply, 'Conversation');
        const recipient =
          conversation.buyerUserId === user(request)
            ? String(conversation.sellerUserId)
            : String(conversation.buyerUserId);
        await assertNotBlocked(tenant(request), user(request), recipient);
        await consumeSocialRate({
          tenantId: tenant(request),
          userId: user(request),
          kind: 'message',
        });
        const input = parseMessageInput(body(request));
        await rejectRecentDuplicate({
          tenantId: tenant(request),
          userId: user(request),
          table: 'torqueshed_marketplace_messages',
          contentHash: input.contentHash,
        });
        const row = first(
          await db.execute(sql`
          INSERT INTO torqueshed_marketplace_messages (tenant_id,conversation_id,sender_user_id,body,content_hash)
          VALUES (${tenant(request)},${conversationId},${user(request)},${input.body},${input.contentHash}) RETURNING *
        `),
        )!;
        await db.execute(sql`
        UPDATE torqueshed_marketplace_conversations SET updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${conversationId}
      `);
        await sendSocialNotification({
          tenantId: tenant(request),
          recipientUserId: recipient,
          actorUserId: user(request),
          event: 'messages',
          body: 'You received a TorqueShed marketplace message.',
          idempotencyKey: `social:message:${String(row.id)}`,
          context: { conversationId },
        });
        return reply.code(201).send(row);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/messages/:id/report',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const messageId = id(request);
        const message = first(
          await db.execute(sql`
          SELECT m.* FROM torqueshed_marketplace_messages m
          JOIN torqueshed_marketplace_conversations c
            ON c.tenant_id=m.tenant_id AND c.id=m.conversation_id
          WHERE m.tenant_id=${tenant(request)} AND m.id=${messageId} AND m.archived_at IS NULL
            AND (c.buyer_user_id=${user(request)} OR c.seller_user_id=${user(request)})
          LIMIT 1
        `),
        );
        if (!message) return notFound(reply, 'Message');
        return reply
          .code(201)
          .send(await createReport(request, 'message', messageId, String(message.senderUserId)));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/marketplace/listings/:id/report',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const listing = await listingRow(request, id(request));
        if (!listing) return notFound(reply, 'Listing');
        return reply
          .code(201)
          .send(
            await createReport(
              request,
              'listing',
              String(listing.id),
              String(listing.sellerUserId),
            ),
          );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/v1/modules/torqueshed/community/posts', { preHandler: readGuards }, async (request) => {
    const query = request.query as Record<string, unknown>;
    const paging = parseListQuery(query);
    const mine = query.scope === 'mine';
    const following = query.scope === 'following';
    const topic = typeof query.topic === 'string' ? query.topic : null;
    const search = paging.search ? `%${paging.search.toLowerCase()}%` : null;
    const result = await db.execute(sql`
      SELECT p.*,t.slug AS topic_slug,t.name AS topic_name,sp.display_name AS author_display_name,
        (SELECT COUNT(*)::int FROM torqueshed_community_comments c WHERE c.tenant_id=p.tenant_id
          AND c.post_id=p.id AND c.status='published' AND c.archived_at IS NULL) AS comment_count,
        (SELECT COUNT(*)::int FROM torqueshed_community_post_reactions r WHERE r.tenant_id=p.tenant_id AND r.post_id=p.id) AS reaction_count,
        (SELECT r.reaction FROM torqueshed_community_post_reactions r WHERE r.tenant_id=p.tenant_id
          AND r.post_id=p.id AND r.user_id=${user(request)} LIMIT 1) AS viewer_reaction
      FROM torqueshed_community_posts p
      LEFT JOIN torqueshed_community_topics t ON t.tenant_id=p.tenant_id AND t.id=p.topic_id
      LEFT JOIN torqueshed_social_profiles sp ON sp.tenant_id=p.tenant_id AND sp.user_id=p.author_user_id AND sp.archived_at IS NULL
      WHERE p.tenant_id=${tenant(request)} AND p.archived_at IS NULL
        AND (${mine} AND p.author_user_id=${user(request)} OR NOT ${mine} AND p.status='published')
        AND (${topic}::text IS NULL OR t.slug=${topic})
        AND (${search}::text IS NULL OR lower(p.title) LIKE ${search} OR lower(p.body) LIKE ${search})
        AND (NOT ${following} OR EXISTS (SELECT 1 FROM torqueshed_community_follows f
          WHERE f.tenant_id=p.tenant_id AND f.follower_user_id=${user(request)} AND f.followed_user_id=p.author_user_id))
        AND (${mine} OR p.visibility='public' OR p.author_user_id=${user(request)} OR
          (p.visibility='followers' AND EXISTS (SELECT 1 FROM torqueshed_community_follows f
            WHERE f.tenant_id=p.tenant_id AND f.follower_user_id=${user(request)} AND f.followed_user_id=p.author_user_id)))
        AND NOT EXISTS (SELECT 1 FROM torqueshed_social_blocks b WHERE b.tenant_id=p.tenant_id AND
          ((b.blocker_user_id=${user(request)} AND b.blocked_user_id=p.author_user_id) OR
           (b.blocker_user_id=p.author_user_id AND b.blocked_user_id=${user(request)})))
      ORDER BY p.created_at DESC,p.id DESC LIMIT ${paging.limit} OFFSET ${paging.offset}
    `);
    return { posts: list(result), pagination: { limit: paging.limit, offset: paging.offset } };
  });

  app.post(
    '/v1/modules/torqueshed/community/posts',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const input = parsePostInput(body(request));
        await rejectRecentDuplicate({
          tenantId: tenant(request),
          userId: user(request),
          table: 'torqueshed_community_posts',
          contentHash: input.contentHash,
        });
        await validateSocialLink({
          tenantId: tenant(request),
          ownerUserId: user(request),
          vehicleId: input.vehicleId,
          buildId: input.buildId,
        });
        const topic = await topicId(tenant(request), input.topicSlug);
        const row = await db.transaction(async (tx) => {
          const created = first(
            await tx.execute(sql`
            INSERT INTO torqueshed_community_posts
              (tenant_id,author_user_id,topic_id,vehicle_id,build_id,title,body,status,visibility,content_hash,created_by_user_id,updated_by_user_id)
            VALUES (${tenant(request)},${user(request)},${topic},${input.vehicleId},${input.buildId},${input.title},${input.body},
              'draft',${input.visibility},${input.contentHash},${user(request)},${user(request)}) RETURNING *
          `),
          )!;
          for (const tagName of input.tags) {
            const tag = first(
              await tx.execute(sql`
              INSERT INTO torqueshed_community_tags (tenant_id,slug,name,created_by_user_id)
              VALUES (${tenant(request)},${tagName.replace(/\s+/g, '-')},${tagName},${user(request)})
              ON CONFLICT (tenant_id,slug) DO UPDATE SET archived_at=NULL RETURNING id
            `),
            )!;
            await tx.execute(sql`
            INSERT INTO torqueshed_community_post_tags (tenant_id,post_id,tag_id)
            VALUES (${tenant(request)},${String(created.id)},${String(tag.id)}) ON CONFLICT DO NOTHING
          `);
          }
          return created;
        });
        await audit(
          request,
          'torqueshed_community_post',
          String(row.id),
          'community_post_created',
          { status: 'draft', visibility: input.visibility },
        );
        return reply.code(201).send(row);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/community/posts/:id',
    { preHandler: readGuards },
    async (request, reply) => {
      const row = await postRow(request, id(request));
      if (!row) return notFound(reply, 'Post');
      const comments = list(
        await db.execute(sql`
        SELECT c.*,p.display_name AS author_display_name,
          (SELECT COUNT(*)::int FROM torqueshed_community_comment_reactions r WHERE r.tenant_id=c.tenant_id AND r.comment_id=c.id) AS reaction_count,
          (SELECT r.reaction FROM torqueshed_community_comment_reactions r WHERE r.tenant_id=c.tenant_id AND r.comment_id=c.id
            AND r.user_id=${user(request)} LIMIT 1) AS viewer_reaction
        FROM torqueshed_community_comments c
        LEFT JOIN torqueshed_social_profiles p ON p.tenant_id=c.tenant_id AND p.user_id=c.author_user_id AND p.archived_at IS NULL
        WHERE c.tenant_id=${tenant(request)} AND c.post_id=${String(row.id)} AND c.status='published' AND c.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM torqueshed_social_blocks b WHERE b.tenant_id=c.tenant_id AND
            ((b.blocker_user_id=${user(request)} AND b.blocked_user_id=c.author_user_id) OR
             (b.blocker_user_id=c.author_user_id AND b.blocked_user_id=${user(request)})))
        ORDER BY c.created_at,c.id LIMIT 250
      `),
      );
      const tags = list(
        await db.execute(sql`
        SELECT t.id,t.slug,t.name FROM torqueshed_community_tags t
        JOIN torqueshed_community_post_tags pt ON pt.tenant_id=t.tenant_id AND pt.tag_id=t.id
        WHERE pt.tenant_id=${tenant(request)} AND pt.post_id=${String(row.id)} AND t.archived_at IS NULL ORDER BY t.name
      `),
      );
      const media = await listSocialAttachments({
        tenantId: tenant(request),
        moduleId: await torqueShedSocialModuleId(),
        objectType: 'community_post',
        objectId: String(row.id),
        limit: 20,
      });
      return {
        post: row,
        comments,
        tags,
        media: (media as any[]).filter((item) =>
          row.authorUserId === user(request) || canManage(request)
            ? true
            : item.scan_status === 'clean',
        ),
      };
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/posts/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const postId = id(request);
        const current = await postRow(request, postId, true);
        if (!current || (!canManage(request) && current.authorUserId !== user(request)))
          return notFound(reply, 'Post');
        if (!['draft', 'published'].includes(String(current.status)))
          throw new TorqueShedSocialError(
            'Post cannot be edited in its current state',
            'COMMUNITY_EDIT_STATE_CONFLICT',
            409,
          );
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const raw = body(request);
        const input = parsePostInput(raw);
        const topic = await topicId(tenant(request), input.topicSlug);
        await validateSocialLink({
          tenantId: tenant(request),
          ownerUserId: String(current.authorUserId),
          vehicleId: input.vehicleId,
          buildId: input.buildId,
          publishing: current.status === 'published',
        });
        const expectedVersion = version(raw.expectedVersion);
        const row = await db.transaction(async (tx) => {
          const updated = first(
            await tx.execute(sql`
            UPDATE torqueshed_community_posts SET topic_id=${topic},vehicle_id=${input.vehicleId},build_id=${input.buildId},
              title=${input.title},body=${input.body},visibility=${input.visibility},content_hash=${input.contentHash},
              updated_by_user_id=${user(request)},updated_at=NOW(),edited_at=NOW(),version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${postId} AND version=${expectedVersion}
              AND status IN ('draft','published') AND archived_at IS NULL RETURNING *
          `),
          );
          if (!updated) return null;
          await tx.execute(sql`
          DELETE FROM torqueshed_community_post_tags
          WHERE tenant_id=${tenant(request)} AND post_id=${postId}
        `);
          for (const tagName of input.tags) {
            const tag = first(
              await tx.execute(sql`
              INSERT INTO torqueshed_community_tags (tenant_id,slug,name,created_by_user_id)
              VALUES (${tenant(request)},${tagName.replace(/\s+/g, '-')},${tagName},${user(request)})
              ON CONFLICT (tenant_id,slug) DO UPDATE SET archived_at=NULL RETURNING id
            `),
            )!;
            await tx.execute(sql`
            INSERT INTO torqueshed_community_post_tags (tenant_id,post_id,tag_id)
            VALUES (${tenant(request)},${postId},${String(tag.id)}) ON CONFLICT DO NOTHING
          `);
          }
          return updated;
        });
        if (!row)
          throw new TorqueShedSocialError(
            'Post changed; reload and retry',
            'SOCIAL_VERSION_CONFLICT',
            409,
          );
        await audit(request, 'torqueshed_community_post', postId, 'community_post_updated');
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/community/posts/:id/publish',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const postId = id(request);
        const current = await postRow(request, postId, true);
        if (!current || (!canManage(request) && current.authorUserId !== user(request)))
          return notFound(reply, 'Post');
        await validateSocialLink({
          tenantId: tenant(request),
          ownerUserId: String(current.authorUserId),
          vehicleId: current.vehicleId,
          buildId: current.buildId,
          publishing: true,
        });
        await assertPublishableMedia(tenant(request), 'community_post', postId);
        const row = first(
          await db.execute(sql`
          UPDATE torqueshed_community_posts SET status='published',published_at=COALESCE(published_at,NOW()),
            updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
          WHERE tenant_id=${tenant(request)} AND id=${postId} AND version=${version(body(request).expectedVersion)}
            AND status='draft' AND archived_at IS NULL RETURNING *
        `),
        );
        if (!row)
          throw new TorqueShedSocialError(
            'Post changed or cannot be published',
            'COMMUNITY_PUBLISH_CONFLICT',
            409,
          );
        await audit(request, 'torqueshed_community_post', postId, 'community_post_published', {
          visibility: row.visibility,
        });
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/community/posts/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      const postId = id(request);
      const raw = body(request);
      const row = first(
        await db.execute(sql`
        UPDATE torqueshed_community_posts SET status='archived',archived_at=NOW(),updated_at=NOW(),version=version+1
        WHERE tenant_id=${tenant(request)} AND id=${postId} AND author_user_id=${user(request)}
          AND version=${version(raw.expectedVersion)} AND archived_at IS NULL RETURNING id
      `),
      );
      if (!row) return notFound(reply, 'Post');
      await audit(request, 'torqueshed_community_post', postId, 'community_post_archived');
      return { archived: true, id: postId };
    },
  );

  app.post(
    '/v1/modules/torqueshed/community/posts/:id/comments',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const postId = id(request);
        const post = await postRow(request, postId);
        if (!post || post.status !== 'published') return notFound(reply, 'Post');
        await assertNotBlocked(tenant(request), user(request), String(post.authorUserId));
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const input = parseCommentInput(body(request));
        await rejectRecentDuplicate({
          tenantId: tenant(request),
          userId: user(request),
          table: 'torqueshed_community_comments',
          contentHash: input.contentHash,
        });
        if (input.parentId) {
          const parent = first(
            await db.execute(sql`
          SELECT id FROM torqueshed_community_comments WHERE tenant_id=${tenant(request)} AND id=${input.parentId}
            AND post_id=${postId} AND status='published' AND archived_at IS NULL LIMIT 1
        `),
          );
          if (!parent) return notFound(reply, 'Parent comment');
        }
        const row = first(
          await db.execute(sql`
          INSERT INTO torqueshed_community_comments
            (tenant_id,post_id,parent_id,author_user_id,body,content_hash)
          VALUES (${tenant(request)},${postId},${input.parentId},${user(request)},${input.body},${input.contentHash}) RETURNING *
        `),
        )!;
        await sendSocialNotification({
          tenantId: tenant(request),
          recipientUserId: String(post.authorUserId),
          actorUserId: user(request),
          event: 'comments',
          body: `A member commented on "${String(post.title).slice(0, 100)}".`,
          idempotencyKey: `social:comment:${String(row.id)}`,
          context: { postId, commentId: row.id },
        });
        await audit(
          request,
          'torqueshed_community_comment',
          String(row.id),
          'community_comment_created',
          { postId },
        );
        return reply.code(201).send(row);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/comments/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const commentId = id(request);
        const raw = body(request);
        const input = parseCommentInput(raw);
        const row = first(
          await db.execute(sql`
          UPDATE torqueshed_community_comments SET body=${input.body},content_hash=${input.contentHash},
            updated_at=NOW(),edited_at=NOW(),version=version+1
          WHERE tenant_id=${tenant(request)} AND id=${commentId} AND author_user_id=${user(request)}
            AND version=${version(raw.expectedVersion)} AND status='published' AND archived_at IS NULL RETURNING *
        `),
        );
        if (!row)
          throw new TorqueShedSocialError(
            'Comment changed or was not found',
            'SOCIAL_VERSION_CONFLICT',
            409,
          );
        await audit(
          request,
          'torqueshed_community_comment',
          commentId,
          'community_comment_updated',
        );
        return row;
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/community/comments/:id',
    { preHandler: writeGuards },
    async (request, reply) => {
      await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
      const commentId = id(request);
      const row = first(
        await db.execute(sql`
        UPDATE torqueshed_community_comments SET status='archived',archived_at=NOW(),updated_at=NOW(),version=version+1
        WHERE tenant_id=${tenant(request)} AND id=${commentId} AND author_user_id=${user(request)}
          AND version=${version(body(request).expectedVersion)} AND archived_at IS NULL RETURNING id
      `),
      );
      if (!row) return notFound(reply, 'Comment');
      await audit(request, 'torqueshed_community_comment', commentId, 'community_comment_archived');
      return { archived: true, id: commentId };
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/posts/:id/reaction',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const postId = id(request);
        const post = await postRow(request, postId);
        if (!post || post.status !== 'published') return notFound(reply, 'Post');
        await assertNotBlocked(tenant(request), user(request), String(post.authorUserId));
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const reaction = parseReaction(body(request).reaction);
        await db.execute(sql`
        INSERT INTO torqueshed_community_post_reactions (tenant_id,user_id,post_id,reaction)
        VALUES (${tenant(request)},${user(request)},${postId},${reaction})
        ON CONFLICT (tenant_id,user_id,post_id) DO UPDATE SET reaction=EXCLUDED.reaction,created_at=NOW()
      `);
        await sendSocialNotification({
          tenantId: tenant(request),
          recipientUserId: String(post.authorUserId),
          actorUserId: user(request),
          event: 'reactions',
          body: `A member reacted to "${String(post.title).slice(0, 100)}".`,
          idempotencyKey: `social:post-reaction:${postId}:${user(request)}:${reaction}`,
        });
        return { reaction };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/community/posts/:id/reaction',
    { preHandler: writeGuards },
    async (request) => {
      await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
      await db.execute(
        sql`DELETE FROM torqueshed_community_post_reactions WHERE tenant_id=${tenant(request)} AND post_id=${id(request)} AND user_id=${user(request)}`,
      );
      return { reaction: null };
    },
  );

  app.put(
    '/v1/modules/torqueshed/community/comments/:id/reaction',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const commentId = id(request);
        const comment = first(
          await db.execute(sql`
        SELECT * FROM torqueshed_community_comments WHERE tenant_id=${tenant(request)} AND id=${commentId}
          AND status='published' AND archived_at IS NULL LIMIT 1
      `),
        );
        if (!comment) return notFound(reply, 'Comment');
        await assertNotBlocked(tenant(request), user(request), String(comment.authorUserId));
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const reaction = parseReaction(body(request).reaction);
        await db.execute(sql`
        INSERT INTO torqueshed_community_comment_reactions (tenant_id,user_id,comment_id,reaction)
        VALUES (${tenant(request)},${user(request)},${commentId},${reaction})
        ON CONFLICT (tenant_id,user_id,comment_id) DO UPDATE SET reaction=EXCLUDED.reaction,created_at=NOW()
      `);
        await sendSocialNotification({
          tenantId: tenant(request),
          recipientUserId: String(comment.authorUserId),
          actorUserId: user(request),
          event: 'reactions',
          body: 'A member reacted to your TorqueShed comment.',
          idempotencyKey: `social:comment-reaction:${commentId}:${user(request)}:${reaction}`,
        });
        return { reaction };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/v1/modules/torqueshed/community/comments/:id/reaction',
    { preHandler: writeGuards },
    async (request) => {
      await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
      await db.execute(
        sql`DELETE FROM torqueshed_community_comment_reactions WHERE tenant_id=${tenant(request)} AND comment_id=${id(request)} AND user_id=${user(request)}`,
      );
      return { reaction: null };
    },
  );

  app.post(
    '/v1/modules/torqueshed/community/posts/:id/report',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const post = await postRow(request, id(request));
        if (!post) return notFound(reply, 'Post');
        return reply
          .code(201)
          .send(await createReport(request, 'post', String(post.id), String(post.authorUserId)));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/community/comments/:id/report',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const commentId = id(request);
        const comment = first(
          await db.execute(sql`
        SELECT * FROM torqueshed_community_comments WHERE tenant_id=${tenant(request)} AND id=${commentId}
          AND status='published' AND archived_at IS NULL LIMIT 1
      `),
        );
        if (!comment) return notFound(reply, 'Comment');
        return reply
          .code(201)
          .send(await createReport(request, 'comment', commentId, String(comment.authorUserId)));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/moderation/reports',
    { preHandler: readGuards },
    async (request, reply) => {
      try {
        if (!canManage(request))
          return reply
            .code(403)
            .send({ error: 'Manager access required', code: 'SOCIAL_MANAGER_REQUIRED' });
        const status = (request.query as { status?: string }).status ?? 'open';
        if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status))
          throw new TorqueShedSocialError(
            'Report status is invalid',
            'SOCIAL_REPORT_STATUS_INVALID',
          );
        return {
          reports: list(
            await db.execute(sql`
          SELECT * FROM torqueshed_social_reports WHERE tenant_id=${tenant(request)} AND status=${status}
          ORDER BY created_at,id LIMIT 200
        `),
          ),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/v1/modules/torqueshed/moderation/reports/:id/action',
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        if (!canManage(request))
          return reply
            .code(403)
            .send({ error: 'Manager access required', code: 'SOCIAL_MANAGER_REQUIRED' });
        const reportId = id(request);
        const raw = body(request);
        const action = String(raw.action ?? '');
        if (!['hide', 'remove', 'restore', 'resolve', 'dismiss', 'warn'].includes(action)) {
          throw new TorqueShedSocialError(
            'Moderation action is invalid',
            'SOCIAL_MODERATION_ACTION_INVALID',
          );
        }
        const reason = plainText(raw.reason, 'reason', 4, 2_000);
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const report = first(
          await db.execute(sql`
        SELECT * FROM torqueshed_social_reports WHERE tenant_id=${tenant(request)} AND id=${reportId} LIMIT 1
      `),
        );
        if (!report) return notFound(reply, 'Report');
        await db.transaction(async (tx) => {
          if (report.targetType === 'listing' && ['hide', 'remove', 'restore'].includes(action)) {
            await tx.execute(sql`
            UPDATE torqueshed_marketplace_listings SET status=${action === 'restore' ? 'published' : 'removed'},
              expires_at=CASE WHEN ${action}='restore' THEN NOW()+INTERVAL '30 days' ELSE expires_at END,
              updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${String(report.targetId)} AND archived_at IS NULL
          `);
          } else if (
            report.targetType === 'post' &&
            ['hide', 'remove', 'restore'].includes(action)
          ) {
            await tx.execute(sql`
            UPDATE torqueshed_community_posts SET status=${action === 'restore' ? 'published' : action === 'hide' ? 'hidden' : 'removed'},
              updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${String(report.targetId)} AND archived_at IS NULL
          `);
          } else if (
            report.targetType === 'comment' &&
            ['hide', 'remove', 'restore'].includes(action)
          ) {
            await tx.execute(sql`
            UPDATE torqueshed_community_comments SET status=${action === 'restore' ? 'published' : action === 'hide' ? 'hidden' : 'removed'},
              updated_at=NOW(),version=version+1
            WHERE tenant_id=${tenant(request)} AND id=${String(report.targetId)} AND archived_at IS NULL
          `);
          } else if (
            report.targetType === 'message' &&
            ['hide', 'remove', 'restore'].includes(action)
          ) {
            await tx.execute(sql`
            UPDATE torqueshed_marketplace_messages
            SET archived_at=CASE WHEN ${action}='restore' THEN NULL ELSE NOW() END
            WHERE tenant_id=${tenant(request)} AND id=${String(report.targetId)}
          `);
          } else if (
            report.targetType === 'profile' &&
            ['hide', 'remove', 'restore'].includes(action)
          ) {
            await tx.execute(sql`
            UPDATE torqueshed_social_profiles
            SET archived_at=CASE WHEN ${action}='restore' THEN NULL ELSE NOW() END,
              updated_at=NOW(),updated_by_user_id=${user(request)},version=version+1
            WHERE tenant_id=${tenant(request)} AND user_id=${String(report.targetId)}
          `);
          }
          await tx.execute(sql`
          INSERT INTO torqueshed_social_moderation_actions
            (tenant_id,report_id,target_type,target_id,action,reason,moderator_user_id,metadata_json)
          VALUES (${tenant(request)},${reportId},${String(report.targetType)},${String(report.targetId)},${action},${reason},${user(request)},${{ priorReportStatus: report.status }})
        `);
          await tx.execute(sql`
          UPDATE torqueshed_social_reports SET status=${action === 'dismiss' ? 'dismissed' : 'resolved'},
            assigned_user_id=${user(request)},updated_at=NOW(),resolved_at=NOW()
          WHERE tenant_id=${tenant(request)} AND id=${reportId}
        `);
        });
        await audit(request, 'torqueshed_social_report', reportId, 'social_moderation_action', {
          action,
          targetType: report.targetType,
          targetId: report.targetId,
        });
        const recipientUserId = await moderationTargetOwner(
          tenant(request),
          String(report.targetType),
          String(report.targetId),
        );
        if (recipientUserId) {
          await sendSocialNotification({
            tenantId: tenant(request),
            recipientUserId,
            actorUserId: user(request),
            event: 'moderation',
            body: `A tenant moderator recorded a ${action} action on your TorqueShed content.`,
            idempotencyKey: `social:moderation:${reportId}:${action}`,
            context: { reportId, targetType: report.targetType, targetId: report.targetId },
          });
        }
        return { moderated: true, action, reportId };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  const socialObjectTypes = new Set(['marketplace_listing', 'community_post', 'community_comment']);

  app.get(
    '/v1/modules/torqueshed/social/media/:objectType/:objectId',
    { preHandler: readGuards },
    async (request, reply) => {
      const { objectType, objectId } = request.params as { objectType: string; objectId: string };
      if (!socialObjectTypes.has(objectType)) return notFound(reply, 'Media object');
      const object = await visibleSocialObject(
        request,
        objectType as any,
        socialId(objectId, 'objectId', true)!,
      );
      if (!object) return notFound(reply, 'Media object');
      const media = await listSocialAttachments({
        tenantId: tenant(request),
        moduleId: await torqueShedSocialModuleId(),
        objectType,
        objectId,
        limit: 20,
      });
      return {
        media: (media as any[]).filter((item) =>
          object.ownerUserId === user(request) || canManage(request)
            ? true
            : item.scan_status === 'clean',
        ),
      };
    },
  );

  app.post(
    '/v1/modules/torqueshed/social/media/:objectType/:objectId',
    { bodyLimit: socialMediaBodyLimit, preHandler: writeGuards },
    async (request, reply) => {
      try {
        const { objectType, objectId } = request.params as { objectType: string; objectId: string };
        if (!socialObjectTypes.has(objectType)) return notFound(reply, 'Media object');
        const targetId = socialId(objectId, 'objectId', true)!;
        const object = await visibleSocialObject(request, objectType as any, targetId, true);
        if (!object || (!canManage(request) && object.ownerUserId !== user(request)))
          return notFound(reply, 'Media object');
        await consumeSocialRate({ tenantId: tenant(request), userId: user(request) });
        const raw = body(request);
        const originalName = plainText(raw.originalName, 'originalName', 1, 180);
        const declaredMimeType =
          typeof raw.declaredMimeType === 'string' ? raw.declaredMimeType.toLowerCase() : '';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(declaredMimeType)) {
          throw new TorqueShedSocialError(
            'Marketplace/community media must be a JPEG, PNG, or WebP image',
            'SOCIAL_MEDIA_TYPE_INVALID',
            415,
            'declaredMimeType',
          );
        }
        if (typeof raw.contentBase64 !== 'string' || !raw.contentBase64)
          throw new TorqueShedSocialError(
            'contentBase64 is required',
            'SOCIAL_MEDIA_CONTENT_REQUIRED',
          );
        if (
          !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.contentBase64) ||
          raw.contentBase64.length % 4 !== 0
        ) {
          throw new TorqueShedSocialError(
            'contentBase64 is malformed',
            'SOCIAL_MEDIA_CONTENT_INVALID',
          );
        }
        const content = Buffer.from(raw.contentBase64, 'base64');
        const moduleId = await torqueShedSocialModuleId();
        const mediaCount = first(
          await db.execute(sql`
            SELECT COUNT(*)::int AS count FROM shared_attachments
            WHERE tenant_id=${tenant(request)} AND module_id=${moduleId}
              AND object_type=${objectType} AND object_id=${targetId} AND deleted_at IS NULL
          `),
        );
        if (Number(mediaCount?.count ?? 0) >= 20) {
          throw new TorqueShedSocialError(
            'Marketplace/community content is limited to 20 images',
            'SOCIAL_MEDIA_LIMIT_REACHED',
            409,
          );
        }
        const attachment = await createSocialAttachment({
          tenantId: tenant(request),
          moduleId,
          objectType,
          objectId: targetId,
          originalName,
          declaredMimeType,
          content,
          createdByUserId: user(request),
          correlationId: request.id,
        });
        await audit(request, 'shared_attachment', String(attachment.id), 'social_media_uploaded', {
          objectType,
          objectId: targetId,
          scanStatus: attachment.scan_status,
          sizeBytes: content.length,
        });
        return reply.code(201).send(socialCamel(attachment));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get(
    '/v1/modules/torqueshed/social/media/:objectType/:objectId/:attachmentId/content',
    { preHandler: readGuards },
    async (request, reply) => {
      const { objectType, objectId, attachmentId } = request.params as Record<string, string>;
      if (!socialObjectTypes.has(objectType)) return notFound(reply, 'Media object');
      const object = await visibleSocialObject(
        request,
        objectType as any,
        socialId(objectId, 'objectId', true)!,
      );
      if (!object) return notFound(reply, 'Media object');
      const result = await getSocialAttachment({
        tenantId: tenant(request),
        moduleId: await torqueShedSocialModuleId(),
        attachmentId: socialId(attachmentId, 'attachmentId', true)!,
        objectType,
        objectId,
      });
      if (!result) return notFound(reply, 'Attachment');
      if (
        result.metadata.scan_status !== 'clean' &&
        object.ownerUserId !== user(request) &&
        !canManage(request)
      )
        return notFound(reply, 'Attachment');
      return reply
        .header('content-type', String(result.metadata.detected_mime_type))
        .header(
          'content-disposition',
          `inline; filename="${String(result.metadata.original_name).replace(/["\r\n]/g, '')}"`,
        )
        .send(result.content);
    },
  );

  app.delete(
    '/v1/modules/torqueshed/social/media/:objectType/:objectId/:attachmentId',
    { preHandler: writeGuards },
    async (request, reply) => {
      const { objectType, objectId, attachmentId } = request.params as Record<string, string>;
      if (!socialObjectTypes.has(objectType)) return notFound(reply, 'Media object');
      const object = await visibleSocialObject(
        request,
        objectType as any,
        socialId(objectId, 'objectId', true)!,
        true,
      );
      if (!object || (!canManage(request) && object.ownerUserId !== user(request)))
        return notFound(reply, 'Media object');
      const deleted = await deleteSocialAttachment({
        tenantId: tenant(request),
        moduleId: await torqueShedSocialModuleId(),
        attachmentId: socialId(attachmentId, 'attachmentId', true)!,
        deletedByUserId: user(request),
        version: version(body(request).expectedVersion),
        objectType,
        objectId,
      });
      if (!deleted)
        throw new TorqueShedSocialError(
          'Attachment changed or was not found',
          'SOCIAL_MEDIA_VERSION_CONFLICT',
          409,
        );
      await audit(request, 'shared_attachment', attachmentId, 'social_media_deleted', {
        objectType,
        objectId,
      });
      return socialCamel(deleted);
    },
  );
}
