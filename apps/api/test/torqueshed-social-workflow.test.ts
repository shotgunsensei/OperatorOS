process.env.SESSION_SECRET ||= 'operatoros-torqueshed-social-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let viewer: any;
let moduleRow: any;
let moduleCreated = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function tenantFor(actor: any) {
  return actor === ownerB ? ownerB.currentTenantId : ownerA.currentTenantId;
}

async function inject(method: string, url: string, actor: any, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`,
      'x-tenant-id': tenantFor(actor),
    },
    ...(payload === undefined ? {} : { payload }),
  });
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  member = await createTestUser();
  viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'torqueshed')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('torqueshed');
    moduleCreated = true;
  }
  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' },
  ]);
  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
    {
      tenantId: ownerB.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerTorqueShedSocialRoutes } =
    await import('../src/routes/torqueshed-social-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerTorqueShedSocialRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const actor of [ownerA, ownerB]) {
    if (!actor) continue;
    const tenantId = String(actor.currentTenantId).replaceAll("'", "''");
    for (const table of [
      'torqueshed_social_moderation_actions',
      'torqueshed_social_reports',
      'torqueshed_community_comment_reactions',
      'torqueshed_community_post_reactions',
      'torqueshed_community_comments',
      'torqueshed_community_post_tags',
      'torqueshed_community_tags',
      'torqueshed_community_posts',
      'torqueshed_community_follows',
      'torqueshed_marketplace_messages',
      'torqueshed_marketplace_conversations',
      'torqueshed_marketplace_favorites',
      'torqueshed_marketplace_listings',
      'torqueshed_marketplace_categories',
      'torqueshed_community_topics',
      'torqueshed_social_blocks',
      'torqueshed_social_notification_preferences',
      'torqueshed_social_profiles',
      'torqueshed_social_rate_windows',
      'shared_attachment_blobs',
      'shared_jobs',
      'shared_attachments',
      'shared_outbox_messages',
      'activity_feed',
    ]) {
      try {
        await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId}'`));
      } catch {}
    }
  }
  if (moduleRow && ownerA && ownerB) {
    const tenantIds = [ownerA.currentTenantId, ownerB.currentTenantId];
    await db
      .delete(tenantUserModuleAccess)
      .where(
        and(
          eq(tenantUserModuleAccess.moduleId, moduleRow.id),
          inArray(tenantUserModuleAccess.tenantId, tenantIds),
        ),
      );
    await db
      .delete(tenantModules)
      .where(
        and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, tenantIds)),
      );
  }
  for (const actor of [viewer, member, ownerA, ownerB]) if (actor) await cleanupUser(actor.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('Marketplace and Community persist authorized workflows with isolation, reports, moderation, and blocking', async () => {
  const profileResponse = await inject(
    'PUT',
    '/v1/modules/torqueshed/community/profile/me',
    member,
    {
      displayName: 'Test Builder',
      bio: 'Diagnostics and fabrication.',
      specialties: 'Electrical diagnosis',
      locality: 'Raleigh',
      region: 'NC',
      countryCode: 'US',
      visibility: 'tenant',
    },
  );
  assert.equal(profileResponse.statusCode, 200, profileResponse.body);

  const viewerWrite = await inject('POST', '/v1/modules/torqueshed/marketplace/listings', viewer, {
    title: 'Viewer listing attempt',
    description: 'This write must be rejected by server authorization.',
    categorySlug: 'tools',
    type: 'sell',
    condition: 'working',
    priceMinor: 1000,
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);

  const listingResponse = await inject(
    'POST',
    '/v1/modules/torqueshed/marketplace/listings',
    member,
    {
      title: 'Tenant-scoped scan tool',
      description: 'Working automotive scan tool with its diagnostic cable.',
      categorySlug: 'tools',
      type: 'sell',
      condition: 'working',
      priceMinor: 12_500,
      locality: 'Raleigh',
      region: 'NC',
      countryCode: 'US',
      negotiable: true,
    },
  );
  assert.equal(listingResponse.statusCode, 201, listingResponse.body);
  const listing = listingResponse.json();
  assert.equal(listing.status, 'draft');
  const publishListing = await inject(
    'POST',
    `/v1/modules/torqueshed/marketplace/listings/${listing.id}/publish`,
    member,
    { expectedVersion: listing.version },
  );
  assert.equal(publishListing.statusCode, 200, publishListing.body);
  const publishedListing = publishListing.json();
  assert.equal(publishedListing.status, 'published');
  assert.ok(publishedListing.expiresAt);

  const crossTenant = await inject(
    'GET',
    `/v1/modules/torqueshed/marketplace/listings/${listing.id}`,
    ownerB,
  );
  assert.equal(crossTenant.statusCode, 404, crossTenant.body);
  const favorite = await inject(
    'PUT',
    `/v1/modules/torqueshed/marketplace/listings/${listing.id}/favorite`,
    ownerA,
  );
  assert.equal(favorite.statusCode, 200, favorite.body);
  const saved = await inject(
    'GET',
    '/v1/modules/torqueshed/marketplace/listings?scope=favorites',
    ownerA,
  );
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().listings[0]?.id, listing.id);
  const contact = await inject(
    'POST',
    `/v1/modules/torqueshed/marketplace/listings/${listing.id}/contact`,
    ownerA,
    { body: 'Is this compatible with OBD-II vehicles?' },
  );
  assert.equal(contact.statusCode, 201, contact.body);
  const conversationId = contact.json().conversation.id;
  const reply = await inject(
    'POST',
    `/v1/modules/torqueshed/marketplace/conversations/${conversationId}/messages`,
    member,
    { body: 'Yes, it supports the standard connector.' },
  );
  assert.equal(reply.statusCode, 201, reply.body);
  const messageReport = await inject(
    'POST',
    `/v1/modules/torqueshed/marketplace/messages/${reply.json().id}/report`,
    ownerA,
    { reasonCode: 'other', details: 'Moderation workflow test.' },
  );
  assert.equal(messageReport.statusCode, 201, messageReport.body);
  const listingReport = await inject(
    'POST',
    `/v1/modules/torqueshed/marketplace/listings/${listing.id}/report`,
    ownerA,
    { reasonCode: 'other', details: 'Review listing wording.' },
  );
  assert.equal(listingReport.statusCode, 201, listingReport.body);

  const postResponse = await inject('POST', '/v1/modules/torqueshed/community/posts', member, {
    title: 'Diagnosing an intermittent misfire',
    body: 'Observed a repeatable warm-engine symptom and verified ignition output before replacing parts.',
    topicSlug: 'diagnostics',
    visibility: 'public',
    tags: ['diagnostics', 'test first'],
  });
  assert.equal(postResponse.statusCode, 201, postResponse.body);
  const post = postResponse.json();
  const publishPost = await inject(
    'POST',
    `/v1/modules/torqueshed/community/posts/${post.id}/publish`,
    member,
    { expectedVersion: post.version },
  );
  assert.equal(publishPost.statusCode, 200, publishPost.body);
  const comment = await inject(
    'POST',
    `/v1/modules/torqueshed/community/posts/${post.id}/comments`,
    ownerA,
    { body: 'What changed when the engine reached operating temperature?' },
  );
  assert.equal(comment.statusCode, 201, comment.body);
  const reaction = await inject(
    'PUT',
    `/v1/modules/torqueshed/community/posts/${post.id}/reaction`,
    ownerA,
    { reaction: 'helpful' },
  );
  assert.equal(reaction.statusCode, 200, reaction.body);
  const postReport = await inject(
    'POST',
    `/v1/modules/torqueshed/community/posts/${post.id}/report`,
    ownerA,
    { reasonCode: 'other', details: 'Moderation state transition test.' },
  );
  assert.equal(postReport.statusCode, 201, postReport.body);
  const moderate = await inject(
    'POST',
    `/v1/modules/torqueshed/moderation/reports/${postReport.json().id}/action`,
    ownerA,
    { action: 'hide', reason: 'Hide while tenant review is completed.' },
  );
  assert.equal(moderate.statusCode, 200, moderate.body);
  const hidden = await inject('GET', `/v1/modules/torqueshed/community/posts/${post.id}`, ownerA);
  assert.equal(hidden.statusCode, 200, hidden.body);
  assert.equal(hidden.json().post.status, 'hidden');

  const block = await inject('PUT', `/v1/modules/torqueshed/community/blocks/${ownerA.id}`, member);
  assert.equal(block.statusCode, 200, block.body);
  const blockedListing = await inject(
    'GET',
    `/v1/modules/torqueshed/marketplace/listings/${listing.id}`,
    ownerA,
  );
  assert.equal(blockedListing.statusCode, 404, blockedListing.body);

  const moderationRows = await db.execute(sql`
    SELECT action FROM torqueshed_social_moderation_actions
    WHERE tenant_id=${ownerA.currentTenantId} AND report_id=${postReport.json().id}
  `);
  assert.deepEqual(
    moderationRows.rows.map((row: any) => row.action),
    ['hide'],
  );
});
