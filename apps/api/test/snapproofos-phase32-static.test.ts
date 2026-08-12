import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 32 is pinned to all sixteen source domains and retains additive release v41 before later cumulative releases', () => {
  const source = JSON.parse(read('apps/modules/snapproofos/source/SOURCE_SNAPSHOT.json'));
  assert.equal(source.sourceCommit, '26bded38c13b5b6361d407462c68052b0c30613d');
  const contract = read('apps/api/src/lib/database-release-contract.ts');
  assert.match(contract, /releaseVersion:\s*42/);
  assert.match(contract, /snapproofos_complete_product_tables/);
  assert.ok(contract.indexOf('snapproofos_complete_product_tables') < contract.indexOf('studyforge_complete_product_tables'));
  const ddl = read('apps/api/src/lib/snapproofos-phase32-db-init.ts');
  for (const table of [
    'snapproof_customers',
    'snapproof_templates',
    'snapproof_branding',
    'snapproof_parts',
    'snapproof_labor',
    'snapproof_share_links',
    'snapproof_public_rate_limits',
  ])
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for (const domain of [
    'users',
    'organizations',
    'customers',
    'jobs',
    'findings',
    'notes',
    'parts',
    'labor',
    'files',
    'templates',
    'reports',
    'exports',
    'share_links',
    'team_members',
    'branding',
    'activity',
  ])
    assert.match(
      read('apps/modules/snapproofos/source/lib/db/src/schema/index.ts') +
        read('apps/api/src/routes/snapproofos-phase32-routes.ts'),
      new RegExp(domain.replace('_', '[_A-Za-z]*'), 'i'),
    );
  assert.doesNotMatch(ddl, /DROP\s+TABLE|TRUNCATE/iu);
});

test('Phase 32 exposes persisted field workflows, private storage, validated exports, and hashed public shares', () => {
  const routes = read('apps/api/src/routes/snapproofos-phase32-routes.ts');
  const exports = read('apps/api/src/lib/snapproofos-exports.ts');
  const media = read('apps/api/src/lib/snapproofos-media.ts');
  for (const path of [
    '/customers',
    '/jobs',
    '/jobs/:id/findings',
    '/findings/:id',
    '/jobs/:id/notes',
    '/notes/:id/audio',
    '/jobs/:id/parts',
    '/jobs/:id/labor',
    '/jobs/:id/files',
    '/files/:id',
    '/templates',
    '/branding',
    '/branding/logo',
    '/reports/generate',
    '/reports/:id/exports',
    '/reports/:id/share-links',
    '/share-links/:id',
    '/v1/public/snapproofos/reports/:token',
  ])
    assert.match(routes, new RegExp(path.replaceAll('/', '\\/').replace(':', '\\:')));
  assert.match(routes, /createAttachment/);
  assert.match(routes, /softDeleteAttachment/);
  assert.match(routes, /token_hash/);
  assert.match(routes, /createHash\('sha256'\)\.update\(raw\)/);
  assert.match(routes, /expires_at>NOW\(\)/);
  assert.match(routes, /revoked_at IS NULL/);
  assert.match(routes, /consumePublicRateLimit/);
  assert.match(routes, /SNAPPROOF_REPORT_IMMUTABLE/);
  assert.match(exports, /%PDF-1\.4/);
  assert.match(exports, /word\/document\.xml/);
  assert.match(exports, /validateSnapProofArtifact/);
  assert.match(media, /APP1 EXIF/);
});

test('Phase 32 web surface is mobile capture, reconnect, branded report, and source-deep-link ready', () => {
  const shell = read('apps/web/src/components/module-shells/SnapProofWorkspace.tsx');
  const field = read('apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx');
  const queue = read('apps/web/src/lib/snapproof-offline-queue.ts');
  const publicReport = read('apps/web/src/app/public/snapproofos/reports/[token]/page.tsx');
  for (const label of [
    'Customers',
    'Jobs',
    'Capture',
    'Findings & notes',
    'Parts & labor',
    'Templates',
    'Reports',
    'Review',
    'Team',
    'Activity',
    'Branding',
  ])
    assert.match(shell, new RegExp(label.replace('&', '\\&')));
  assert.match(field, /capture="environment"/);
  assert.match(field, /PDF/);
  assert.match(field, /DOCX/);
  assert.match(field, /Secure link created/);
  assert.match(queue, /indexedDB\.open/);
  assert.match(queue, /clientMutationId/);
  assert.match(publicReport, /snapproofos-public-report/);
  assert.match(publicReport, /Download PDF/);
  assert.doesNotMatch(`${field}\n${publicReport}`, /placeholder|fake report|Math\.random/iu);
});
