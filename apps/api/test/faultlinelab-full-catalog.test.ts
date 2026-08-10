process.env.SESSION_SECRET ||= 'operatoros-faultlinelab-full-catalog-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import {
  FAULTLINELAB_STARTER_CHALLENGES,
  faultlineStarterManifest,
} from '../src/lib/faultlinelab-starter-content.js';
import { createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let owner: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function authHeaders() {
  return {
    authorization: `Bearer ${signToken({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      tokenVersion: owner.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': owner.currentTenantId,
  };
}

function inject(method: string, url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: authHeaders(),
    ...(payload === undefined ? {} : { payload }),
  });
}

async function buildApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerFaultlineLabRoutes } = await import('../src/routes/faultlinelab-routes.js');
  const instance = Fastify({ logger: false });
  await instance.register(cookie);
  await registerFaultlineLabRoutes(instance);
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  const { ensureFaultlineLabTables } = await import('../src/lib/faultlinelab-db-init.js');
  await ensureFaultlineLabTables();
  ({ signToken } = await import('../src/lib/auth.js'));
  owner = await createTestUser();
  let [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'faultlinelab')).limit(1);
  moduleRow ??= await createTestModule('faultlinelab');
  await db.insert(tenantModules).values({
    tenantId: owner.currentTenantId,
    moduleId: moduleRow.id,
    status: 'enabled',
    source: 'admin',
    allowAllMembers: true,
  });
  app = await buildApp();
});

after(async () => {
  if (app) await app.close();
});

test('compiler-discovered catalog imports idempotently and every case can act, score, and reload', async () => {
  const manifest = faultlineStarterManifest();
  const firstCatalogResponse = await inject('GET', '/v1/modules/faultlinelab/challenges');
  assert.equal(firstCatalogResponse.statusCode, 200, firstCatalogResponse.body);
  const firstCatalog = firstCatalogResponse.json();
  assert.equal(firstCatalog.challenges.length, manifest.discoveredCount);
  assert.equal(firstCatalog.facets.total, manifest.discoveredCount);
  assert.deepEqual(firstCatalog.facets.categories, manifest.categoryCounts);
  assert.deepEqual(firstCatalog.facets.difficulties, manifest.difficultyCounts);

  const secondCatalogResponse = await inject('GET', '/v1/modules/faultlinelab/challenges');
  assert.equal(secondCatalogResponse.statusCode, 200, secondCatalogResponse.body);
  assert.deepEqual(
    secondCatalogResponse.json().challenges.map((item: any) => [item.sourceId, item.id, item.publishedVersionNumber]),
    firstCatalog.challenges.map((item: any) => [item.sourceId, item.id, item.publishedVersionNumber]),
    're-import must preserve challenge ids and immutable published versions',
  );

  const bySourceId = new Map(firstCatalog.challenges.map((item: any) => [item.sourceId, item]));
  const completed: Array<{ sourceId: string; challengeId: string; sessionId: string; score: number }> = [];

  for (const [index, source] of FAULTLINELAB_STARTER_CHALLENGES.entries()) {
    const challenge = bySourceId.get(source.sourceId) as any;
    assert.ok(challenge, `missing compiled catalog record ${source.sourceId}`);
    assert.equal(challenge.status, 'published');

    const start = await inject('POST', '/v1/modules/faultlinelab/sessions', {
      challengeId: challenge.id,
      mode: 'standard',
      clientStartKey: `full-catalog-${String(index).padStart(3, '0')}-${source.sourceHash.slice(0, 12)}`,
    });
    assert.equal(start.statusCode, 201, `${source.sourceId}: ${start.body}`);
    let bundle = start.json();

    const action = [
      ...source.content.commands.map((item) => ({
        kind: 'command',
        target: item.command,
        revealsEvidence: item.revealsEvidence,
      })),
      ...source.content.events.map((item) => ({
        kind: 'event',
        target: item.id,
        revealsEvidence: item.revealsEvidence,
      })),
      ...source.content.tickets.map((item) => ({
        kind: 'ticket',
        target: item.id,
        revealsEvidence: item.revealsEvidence,
      })),
    ].find((item) => item.revealsEvidence.length > 0);
    assert.ok(action, `${source.sourceId} has no evidence-producing action after compilation`);

    const actionResponse = await inject(
      'POST',
      `/v1/modules/faultlinelab/sessions/${bundle.session.id}/actions`,
      {
        expectedVersion: bundle.session.version,
        clientActionId: `full-catalog-action-${source.sourceHash.slice(0, 16)}`,
        kind: action.kind,
        target: action.target,
      },
    );
    assert.equal(actionResponse.statusCode, 200, `${source.sourceId}: ${actionResponse.body}`);
    bundle = actionResponse.json();
    assert.ok(bundle.session.unlockedEvidence.length > 0, `${source.sourceId} did not unlock evidence`);

    const submit = await inject(
      'POST',
      `/v1/modules/faultlinelab/sessions/${bundle.session.id}/submit`,
      {
        expectedVersion: bundle.session.version,
        clientSubmissionId: `full-catalog-submit-${source.sourceHash.slice(0, 16)}`,
        hypothesis: source.content.rootCause.description,
        selectedRootCauseId: source.content.rootCause.id,
        evidenceIds: bundle.session.unlockedEvidence,
        remediation: source.content.remediation,
        proofNote: `Automated immutable-version proof for ${source.sourceId}`,
      },
    );
    assert.equal(submit.statusCode, 200, `${source.sourceId}: ${submit.body}`);
    bundle = submit.json();
    assert.equal(bundle.session.state, 'completed', source.sourceId);
    assert.equal(bundle.debrief.rootCause.id, source.content.rootCause.id, source.sourceId);
    assert.equal(typeof bundle.session.score, 'number', source.sourceId);

    const reload = await inject('GET', `/v1/modules/faultlinelab/sessions/${bundle.session.id}`);
    assert.equal(reload.statusCode, 200, `${source.sourceId}: ${reload.body}`);
    assert.equal(reload.json().submission.id, bundle.submission.id, source.sourceId);
    completed.push({
      sourceId: source.sourceId,
      challengeId: challenge.id,
      sessionId: bundle.session.id,
      score: bundle.session.score,
    });
  }

  assert.equal(completed.length, manifest.discoveredCount, 'full-catalog iteration may not exclude a case');
  const persistedCounts = await db.execute(sql`
    SELECT
      COUNT(DISTINCT c.id)::int AS challenge_count,
      COUNT(DISTINCT v.id)::int AS version_count,
      COUNT(DISTINCT s.id)::int AS completed_count
    FROM faultlinelab_challenges c
    JOIN faultlinelab_challenge_versions v
      ON v.tenant_id=c.tenant_id AND v.challenge_id=c.id
    LEFT JOIN faultlinelab_sessions s
      ON s.tenant_id=c.tenant_id AND s.challenge_id=c.id AND s.state='completed'
    WHERE c.tenant_id=${owner.currentTenantId} AND c.scope='tenant' AND c.status='published'
  `);
  const counts = persistedCounts.rows[0] as any;
  assert.equal(Number(counts.challenge_count), manifest.discoveredCount);
  assert.equal(Number(counts.version_count), manifest.discoveredCount);
  assert.equal(Number(counts.completed_count), manifest.discoveredCount);

  const last = completed.at(-1)!;
  await app.close();
  app = await buildApp();
  const restartReload = await inject('GET', `/v1/modules/faultlinelab/sessions/${last.sessionId}`);
  assert.equal(restartReload.statusCode, 200, restartReload.body);
  assert.equal(restartReload.json().session.state, 'completed');
});
