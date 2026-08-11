import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRANDFORGE_COPY_MODES,
  BRANDFORGE_INTEGRATION_CATALOG,
  BRANDFORGE_REPORT_TYPES,
  BRANDFORGE_TONES,
  BRANDFORGE_WORKFLOWS,
  exportInput,
  integrationConnectInput,
  parsePhase31,
  reportInput,
  scoreCopyContent,
  stableJsonHash,
} from '../src/lib/brandforgeos-phase31.js';

test('Phase 31 exposes the complete bounded source mode catalogs', () => {
  assert.deepEqual(BRANDFORGE_COPY_MODES, [
    'google_ad', 'meta_ad', 'linkedin_post', 'email', 'landing_page',
    'social_post', 'sms', 'product_description', 'retargeting_ad', 'sales_page',
  ]);
  assert.equal(BRANDFORGE_TONES.length, 8);
  assert.equal(BRANDFORGE_WORKFLOWS.length, 6);
  assert.equal(BRANDFORGE_REPORT_TYPES.length, 6);
  assert.equal(BRANDFORGE_INTEGRATION_CATALOG.length, 12);
  assert.equal(new Set(BRANDFORGE_INTEGRATION_CATALOG.map(item => item.provider)).size, 12);
});

test('copy scoring and export hashes are deterministic evidence, never random metrics', () => {
  const copy = 'Book a 30 minute strategy review and discover three concrete campaign improvements.';
  const first = scoreCopyContent(copy);
  const second = scoreCopyContent(copy);
  assert.deepEqual(first, second);
  assert.equal(first.method, 'brandforge-copy-score-v1');
  assert.ok(first.clarity >= 0 && first.clarity <= 100);
  assert.equal(first.ctaStrength, 85);
  assert.equal(stableJsonHash({ copy, first }), stableJsonHash({ copy, first }));
  assert.match(stableJsonHash({ copy, first }), /^[a-f0-9]{64}$/);
});

test('report, integration, and export contracts reject unbounded or unsafe inputs', () => {
  const report = parsePhase31(reportInput, {
    name: 'Executive review', reportType: 'executive_summary', dateFrom: '2026-08-01',
    dateTo: '2026-08-31', isWhiteLabel: true,
    branding: { companyName: 'Shotgun Ninjas Productions', color: '#ef4444' },
  });
  assert.equal(report.isWhiteLabel, true);
  assert.equal(report.reportType, 'executive_summary');
  assert.throws(() => parsePhase31(reportInput, {
    name: 'Invalid range', dateFrom: '2026-09-01', dateTo: '2026-08-01',
  }), /dateTo must not precede dateFrom/);
  assert.throws(() => parsePhase31(integrationConnectInput, {
    mode: 'live', secret: 'raw-secret-is-not-an-accepted-field',
  }), /Unrecognized key/);
  assert.throws(() => parsePhase31(exportInput, {
    exportType: 'workspace', format: 'pdf', idempotencyKey: 'phase31-export-1',
  }));
});
