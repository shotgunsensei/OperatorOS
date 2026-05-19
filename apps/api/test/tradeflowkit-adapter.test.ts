/**
 * Task #109 — TradeFlowKit push adapter unit tests.
 *
 * These tests target the pure adapter layer (no HTTP, no DB) so they
 * can assert the exact wire shape, headers, batching rule, feature
 * whitelist, and fail-closed bearer-token behaviour with zero
 * environmental coupling.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tradeflowkitAdapter,
  canonicalSnapshotAdapter,
  getAdapter,
  TRADEFLOWKIT_FEATURE_KEYS,
  type AdapterTarget,
  type MemberSnapshot,
} from '../src/lib/entitlement-adapters.js';
import type { EntitlementSnapshot } from '../src/lib/entitlement-resolver.js';

function makeSnapshot(opts: {
  userId: string;
  tenantId?: string;
  email?: string;
  status?: string | null;
  planSlug?: string | null;
  moduleRole?: 'module_admin' | 'module_user' | 'viewer' | 'none';
  moduleEnabled?: boolean;
  features?: Record<string, boolean>;
  tenantRoleAlias?: 'owner' | 'tenant_admin' | 'user' | 'viewer' | 'billing_admin';
  limits?: Record<string, number>;
}): EntitlementSnapshot {
  return {
    version: 1,
    computedAt: '2026-05-19T12:00:00.000Z',
    tenant: {
      id: opts.tenantId ?? 'tnt_abc',
      slug: 'acme',
      name: 'Acme',
      type: 'company',
      role: 'admin',
      roleAlias: opts.tenantRoleAlias ?? 'tenant_admin',
      viaPlatformRole: false,
    },
    user: {
      id: opts.userId,
      email: opts.email ?? `${opts.userId}@test.local`,
      platformRole: 'user',
    },
    subscription: {
      status: opts.status === undefined ? 'active' : opts.status,
      planSlug: opts.planSlug === undefined ? 'pro' : opts.planSlug,
      planName: 'Pro',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    } as any,
    modules: [{
      slug: 'tradeflowkit',
      name: 'TradeFlowKit',
      baseUrl: 'https://tradeflowkit.test',
      status: 'live',
      enabled: opts.moduleEnabled ?? true,
      accessLevel: 'manager',
      moduleRole: opts.moduleRole ?? 'module_admin',
      features: opts.features ?? {
        automations: true,
        recurring_jobs: true,
        analytics: true,
        team_invites: true,
        // Unknown key — adapter must drop this.
        bogus_key: true as any,
      } as any,
      source: 'plan',
    }],
    limits: opts.limits ?? { customers: -1, teamMembers: 25, jobs: 100 },
    capabilities: {},
  } as any;
}

const TFK_TARGET: AdapterTarget = {
  moduleId: 'mod_tfk',
  moduleSlug: 'tradeflowkit',
  url: 'https://tradeflowkit.test/api/operatoros/entitlements/sync',
  pushShape: 'tradeflowkit_v1',
  pushAuthMode: 'bearer_token',
  pushBearerEnvVar: 'TRADEFLOWKIT_TEST_TOKEN',
};

test('registry: getAdapter dispatches on push shape', () => {
  assert.equal(getAdapter('tradeflowkit_v1').shape, 'tradeflowkit_v1');
  assert.equal(getAdapter('canonical_snapshot').shape, 'canonical_snapshot');
  // Unknown shape -> canonical (safe default).
  assert.equal(getAdapter('mystery').shape, 'canonical_snapshot');
  assert.equal(getAdapter(null).shape, 'canonical_snapshot');
});

test('tfk: emits ONE batched request per receiver with all members', () => {
  process.env.TRADEFLOWKIT_TEST_TOKEN = 'svc-secret-tok';
  try {
    const members: MemberSnapshot[] = [
      { userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) },
      { userId: 'u2', snapshot: makeSnapshot({ userId: 'u2', moduleRole: 'module_user' }) },
      { userId: 'u3', snapshot: makeSnapshot({ userId: 'u3', moduleRole: 'viewer', moduleEnabled: false }) },
    ];
    const out = tradeflowkitAdapter.buildRequests(members, TFK_TARGET, {
      reason: 'stripe:customer.subscription.updated', signingSecret: null,
    });
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    assert.equal(out.requests.length, 1, 'TFK adapter must batch members');
    const req = out.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, TFK_TARGET.url);
    assert.equal(req.headers['Authorization'], 'Bearer svc-secret-tok');
    assert.equal(req.headers['X-Operatoros-Signature'], undefined,
      'TFK uses bearer auth — must NOT carry HMAC signature header');
    const body = JSON.parse(req.body);
    assert.equal(body.tenantId, 'tnt_abc');
    assert.equal(body.planSlug, 'pro');
    assert.equal(body.subscriptionStatus, 'active');
    assert.equal(body.accessLevel, 'full');
    assert.deepEqual(Object.keys(body.members).length, 3);
    assert.equal(body.members[0].operatorosUserId, 'u1');
    assert.equal(body.members[0].moduleRole, 'module_admin');
    assert.equal(body.members[0].enabled, true);
    assert.equal(body.members[0].tenantRole, 'tenant_admin');
    assert.equal(body.members[2].enabled, false);
  } finally {
    delete process.env.TRADEFLOWKIT_TEST_TOKEN;
  }
});

test('tfk: feature whitelist drops unknown keys and includes only TFK keys', () => {
  process.env.TRADEFLOWKIT_TEST_TOKEN = 'svc-secret-tok';
  try {
    const features: Record<string, boolean> = {
      automations: true,
      analytics: false,
      stripe_connect: true,
      bogus_key: true,           // must be dropped
      another_unknown: false,    // must be dropped
    };
    const members: MemberSnapshot[] = [
      { userId: 'u1', snapshot: makeSnapshot({ userId: 'u1', features }) },
    ];
    const out = tradeflowkitAdapter.buildRequests(members, TFK_TARGET, {
      reason: null, signingSecret: null,
    });
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    const body = JSON.parse(out.requests[0].body);
    assert.deepEqual(body.features, {
      automations: true, analytics: false, stripe_connect: true,
    });
    for (const k of Object.keys(body.features)) {
      assert.ok(TRADEFLOWKIT_FEATURE_KEYS.includes(k as any),
        `feature key ${k} must be in whitelist`);
    }
  } finally {
    delete process.env.TRADEFLOWKIT_TEST_TOKEN;
  }
});

test('tfk: subscription status maps to accessLevel correctly', () => {
  process.env.TRADEFLOWKIT_TEST_TOKEN = 'svc-secret-tok';
  try {
    const cases: Array<[string | null, 'full' | 'revoked']> = [
      ['active', 'full'],
      ['trialing', 'full'],
      ['grace', 'full'],
      ['past_due_grace', 'full'],
      ['past_due', 'revoked'],
      ['canceled', 'revoked'],
      ['unpaid', 'revoked'],
      [null, 'revoked'],
    ];
    for (const [status, expected] of cases) {
      const out = tradeflowkitAdapter.buildRequests(
        [{ userId: 'u1', snapshot: makeSnapshot({ userId: 'u1', status }) }],
        TFK_TARGET,
        { reason: null, signingSecret: null },
      );
      assert.equal(out.kind, 'ok');
      if (out.kind !== 'ok') continue;
      const body = JSON.parse(out.requests[0].body);
      assert.equal(body.accessLevel, expected,
        `status=${status} must yield accessLevel=${expected}`);
    }
  } finally {
    delete process.env.TRADEFLOWKIT_TEST_TOKEN;
  }
});

test('tfk: fail-closed when bearer env var is unset', () => {
  delete process.env.TRADEFLOWKIT_TEST_TOKEN;
  const out = tradeflowkitAdapter.buildRequests(
    [{ userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) }],
    TFK_TARGET,
    { reason: null, signingSecret: null },
  );
  assert.equal(out.kind, 'skipped');
  if (out.kind !== 'skipped') return;
  assert.equal(out.reason, 'bearer_env_value_empty');
  assert.equal(out.detail, 'TRADEFLOWKIT_TEST_TOKEN');
});

test('tfk: fail-closed when pushBearerEnvVar is null', () => {
  const out = tradeflowkitAdapter.buildRequests(
    [{ userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) }],
    { ...TFK_TARGET, pushBearerEnvVar: null },
    { reason: null, signingSecret: null },
  );
  assert.equal(out.kind, 'skipped');
  if (out.kind === 'skipped') assert.equal(out.reason, 'missing_bearer_env_var');
});

test('canonical: emits ONE request per (member × receiver) and HMAC-signs', () => {
  const secret = 'shared-test-secret-1234567890';
  const members: MemberSnapshot[] = [
    { userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) },
    { userId: 'u2', snapshot: makeSnapshot({ userId: 'u2' }) },
  ];
  const target: AdapterTarget = {
    moduleId: 'mod_x', moduleSlug: 'torqueshed',
    url: 'https://torqueshed.test/webhooks/entitlements',
    pushShape: 'canonical_snapshot', pushAuthMode: 'hmac_signature',
    pushBearerEnvVar: null,
  };
  const out = canonicalSnapshotAdapter.buildRequests(members, target, {
    reason: 'stripe:invoice.paid', signingSecret: secret,
  });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.equal(out.requests.length, 2);
  for (const req of out.requests) {
    assert.ok(req.headers['X-Operatoros-Signature'].startsWith('sha256='),
      'canonical adapter must HMAC-sign');
    assert.equal(req.headers['Authorization'], undefined,
      'canonical adapter must NOT carry bearer header');
    const body = JSON.parse(req.body);
    assert.equal(body.event, 'entitlements.changed');
    assert.equal(body.receiver_slug, 'torqueshed');
    assert.equal(body.reason, 'stripe:invoice.paid');
    assert.equal(body.version, 1, 'canonical body must contain snapshot at top level');
  }
});

test('tfk: member-only reason omits planSlug/features/limits', () => {
  process.env.TRADEFLOWKIT_TEST_TOKEN = 'svc-secret-tok';
  try {
    const out = tradeflowkitAdapter.buildRequests(
      [{ userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) }],
      TFK_TARGET,
      { reason: 'tenant_user_module_access_set', signingSecret: null },
    );
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    const body = JSON.parse(out.requests[0].body);
    assert.equal(body.tenantId, 'tnt_abc');
    assert.equal(body.accessLevel, 'full');
    assert.ok(Array.isArray(body.members) && body.members.length === 1);
    assert.equal(body.planSlug, undefined,
      'member-only payload must omit planSlug');
    assert.equal(body.features, undefined,
      'member-only payload must omit features');
    assert.equal(body.limits, undefined,
      'member-only payload must omit limits');
    assert.equal(body.subscriptionStatus, undefined,
      'member-only payload must omit subscriptionStatus');
    assert.equal(body._meta.memberOnly, true);
  } finally {
    delete process.env.TRADEFLOWKIT_TEST_TOKEN;
  }
});

test('tfk: non-member-only reason (e.g. stripe:*) keeps full payload', () => {
  process.env.TRADEFLOWKIT_TEST_TOKEN = 'svc-secret-tok';
  try {
    const out = tradeflowkitAdapter.buildRequests(
      [{ userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) }],
      TFK_TARGET,
      { reason: 'stripe:customer.subscription.updated', signingSecret: null },
    );
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    const body = JSON.parse(out.requests[0].body);
    assert.equal(typeof body.planSlug, 'string');
    assert.equal(typeof body.features, 'object');
    assert.equal(typeof body.limits, 'object');
    assert.equal(body._meta.memberOnly, false);
  } finally {
    delete process.env.TRADEFLOWKIT_TEST_TOKEN;
  }
});

test('canonical: fail-closed when MODULE_SSO_SECRET missing', () => {
  const out = canonicalSnapshotAdapter.buildRequests(
    [{ userId: 'u1', snapshot: makeSnapshot({ userId: 'u1' }) }],
    {
      moduleId: 'm', moduleSlug: 'torqueshed', url: 'https://torqueshed.test/h',
      pushShape: 'canonical_snapshot', pushAuthMode: 'hmac_signature',
      pushBearerEnvVar: null,
    },
    { reason: null, signingSecret: null },
  );
  assert.equal(out.kind, 'skipped');
  if (out.kind === 'skipped') assert.equal(out.reason, 'missing_signing_secret');
});
