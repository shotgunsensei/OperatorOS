import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

test('Marketplace and Community persistence is tenant-scoped, constrained, indexed, and append-only where required', () => {
  const ddl = read('apps/api/src/lib/torqueshed-db-init.ts');
  for (const table of [
    'torqueshed_social_profiles',
    'torqueshed_social_blocks',
    'torqueshed_marketplace_categories',
    'torqueshed_marketplace_listings',
    'torqueshed_marketplace_favorites',
    'torqueshed_marketplace_conversations',
    'torqueshed_marketplace_messages',
    'torqueshed_community_topics',
    'torqueshed_community_tags',
    'torqueshed_community_posts',
    'torqueshed_community_comments',
    'torqueshed_community_follows',
    'torqueshed_social_reports',
    'torqueshed_social_moderation_actions',
    'torqueshed_social_rate_windows',
  ])
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  assert.match(ddl, /price_minor INTEGER/);
  assert.doesNotMatch(ddl, /price DECIMAL|price NUMERIC/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id, listing_id, seller_user_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id, post_id, parent_id\)/);
  assert.match(ddl, /torqueshed_social_moderation_append_only/);
  assert.match(ddl, /BEFORE UPDATE OR DELETE ON torqueshed_social_moderation_actions/);
  assert.match(ddl, /idx_torqueshed_marketplace_listing_search/);
  assert.match(ddl, /idx_torqueshed_community_post_feed/);
  assert.match(ddl, /'tenant_message','user_report','tenant_report'/);
});

test('social routes use trusted OperatorOS authority, real persistence, scanning, privacy filters, and abuse controls', () => {
  const routes = read('apps/api/src/routes/torqueshed-social-routes.ts');
  const service = read('apps/api/src/lib/torqueshed-social-service.ts');
  const registration = read('apps/api/src/routes/module-shell-routes.ts');
  assert.match(routes, /requireTenantModuleAccess\('torqueshed'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.doesNotMatch(routes, /body\.tenantId|input\.tenantId|body\.userId|input\.userId/);
  assert.match(routes, /visibleSocialObject/);
  assert.match(routes, /SOCIAL_MEDIA_NOT_CLEAN/);
  assert.match(routes, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(routes, /transactionMode: 'off_platform_after_in_app_contact'/);
  assert.match(routes, /price_minor/);
  assert.match(routes, /marketplace\/messages\/:id\/report/);
  assert.match(routes, /community\/profiles\/:userId\/report/);
  assert.match(service, /tenant_message/);
  assert.match(service, /tenant_report/);
  assert.match(service, /enqueueOutboxMessage/);
  assert.match(registration, /registerTorqueShedSocialRoutes/);
});

test('native TorqueShed surfaces expose real Marketplace and Community actions without protection claims', () => {
  const panel = read('apps/web/src/components/module-shells/TorqueShedSocialPanels.tsx');
  const workspace = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  const map = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  assert.match(workspace, /data-testid="torqueshed-marketplace"|TorqueShedMarketplacePanel/);
  assert.match(workspace, /TorqueShedCommunityPanel/);
  assert.match(panel, /data-testid="torqueshed-marketplace"/);
  assert.match(panel, /data-testid="torqueshed-community"/);
  assert.match(panel, /payment and\s+fulfillment happen off-platform/);
  assert.match(panel, /Create a draft listing/);
  assert.match(panel, /Create a draft post/);
  assert.match(panel, /Notification preferences/);
  assert.match(client, /createMarketplaceListing/);
  assert.match(client, /contactMarketplaceSeller/);
  assert.match(client, /createCommunityPost/);
  assert.match(client, /addCommunityComment/);
  assert.match(map, /'\/marketplace': \{ sectionId: 'torqueshed-marketplace'/);
  assert.match(map, /'\/community': \{ sectionId: 'torqueshed-community'/);
  assert.doesNotMatch(
    panel,
    /protected checkout|shipping tracking|dispute window|seller rating|3% fee/i,
  );
});

test('release verification includes all Phase 9 durable boundaries', () => {
  const release = read('apps/api/src/lib/database-release.ts');
  for (const table of [
    'torqueshed_marketplace_listings',
    'torqueshed_marketplace_messages',
    'torqueshed_community_posts',
    'torqueshed_community_comments',
    'torqueshed_social_reports',
    'torqueshed_social_moderation_actions',
  ])
    assert.match(release, new RegExp(`to_regclass\\('public\\.${table}'\\)`));
});
