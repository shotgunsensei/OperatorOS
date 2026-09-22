import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP_GUIDES, MODULE_HELP_GUIDE_IDS, findHelpGuide, findHelpPage, helpSearchText } from '../../web/src/lib/help/index.js';
import { MODULE_SETUP_GUIDES } from '../../web/src/lib/help/module-setup.js';
import { serviceReadiness, serviceStateLabel } from '../../web/src/lib/service-readiness.js';

test('each module has actionable setup guidance linked to a documented, canonical destination', () => {
  for (const slug of ['operatoros', ...MODULE_HELP_GUIDE_IDS]) {
    const setup = MODULE_SETUP_GUIDES[slug];
    assert.ok(setup, slug);
    for (const field of ['firstTask', 'services', 'check', 'nextStep'] as const) assert.ok(setup[field].trim(), `${slug}: ${field}`);
    const url = new URL(setup.setupHref);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.searchParams.has('token'), false);
    const guide = HELP_GUIDES.find(item => new URL(item.startHref).host === url.host);
    assert.ok(guide, `${slug}: unrecognized host`);
    assert.ok(findHelpPage(guide, `${url.pathname}${url.search}`), `${slug}: undocumented setup route`);
  }
});

test('all Help instructions avoid implementation jargon while preserving product terminology', () => {
  const engineering = /\b(tenants?|idempotent|payload|webhooks?|adapters?|provenance|schema|server-owned|endpoints?|artifacts?|entitlements?|RBAC|PKCE|nonce|metadata|reconciliation|runtime|bounded|durable|posture|SSO|canonical|deterministic|mutations?|normalized|opaque|callbacks?|reauthentication|identifiers?|rollback|concurrency|telemetry|replays?|tokenized)\b/i;
  for (const guide of HELP_GUIDES) {
    for (const page of guide.pages) {
      for (const text of [page.title, page.summary, ...page.features, ...page.workflow, page.access ?? '', ...(page.notes ?? [])]) {
        assert.doesNotMatch(text, engineering, `${guide.id}/${page.id}: ${text}`);
      }
    }
  }
});

test('vendor setup is searchable without claiming the service is connected', () => {
  const guide = findHelpGuide('callcommand-ai');
  assert.match(helpSearchText(guide, guide.pages[0]), /twilio/);
  assert.match(MODULE_SETUP_GUIDES.pulsedesk.services, /not available yet/);
  assert.match(MODULE_SETUP_GUIDES.outcall.services, /not available yet/);
});

test('missing and unexpected service states never appear ready', () => {
  assert.equal(serviceReadiness().tone, 'unknown');
  assert.equal(serviceReadiness({ kind: 'ai', name: 'unknown', state: 'ready' }).tone, 'unknown');
  assert.equal(serviceReadiness({ kind: 'ai', name: 'test', state: 'test' }).label, 'Test mode · no live delivery');
  assert.equal(serviceReadiness({ kind: 'email', name: 'resend', state: 'configured' }).label, 'Configured · test still needed');
  assert.equal(serviceStateLabel('dead_letter'), 'Needs attention');
  assert.equal(serviceStateLabel('constructor'), 'Needs review');
});
