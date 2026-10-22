import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureKey = '__operatorosOutcallApprovalFixture';

// Bundle the real provider and resource-readiness functions. Only persistence
// and unrelated phone parsers are synthetic; no database or HTTP client loads.
async function loadProvider() {
  const output = await build({
    entryPoints: [resolve(root, 'apps/api/src/lib/outcall-provider.ts')],
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'isolated-outcall-readiness', setup(plugin) {
      plugin.onResolve({ filter: /^\.\.\/db\.js$/ }, () => ({ path: 'db', namespace: 'offline' }));
      plugin.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: 'sql', namespace: 'offline' }));
      plugin.onResolve({ filter: /^(?:\.\/callcommand\.js|libphonenumber-js\/max)$/ }, () => ({ path: 'phone', namespace: 'offline' }));
      plugin.onLoad({ filter: /.*/, namespace: 'offline' }, ({ path }) => ({
        loader: 'js', contents: path === 'db'
          ? `export const db={async execute(query){const fixture=globalThis.${fixtureKey};fixture.queries.push(query);return {rows:fixture.approved?[{account_key:'synthetic-account'}]:[]};}};`
          : path === 'sql' ? 'export const sql=(strings,...values)=>({strings:[...strings],values});'
            : 'export const normalizeE164=()=>{throw new Error("Unexpected phone operation");}; export const parsePhoneNumberFromString=normalizeE164;',
      }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}

test('catalog launch never substitutes for live configuration, policy, approval or production adapter guards', async () => {
  const provider = await loadProvider();
  const policy = { currency: 'USD', dailyMicros: 1000000, monthlyMicros: 2000000, voiceCeilingMicros: 1000,
    verificationCeilingMicros: 1000, smsCeilingMicros: 1000, dailyVoiceRequests: 2, dailyVerificationRequests: 4,
    dailySmsReplies: 2, maxOutstanding: 2, maxCallSeconds: 30, maxQueueLatenessSeconds: 60 };
  const env = { APP_ENV: 'production', NODE_ENV: 'production', OUTCALL_TEST_ADAPTER: 'enabled',
    OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '', OUTCALL_LIVE_PROVIDER: 'enabled',
    OUTCALL_PUBLIC_URL: 'https://outcall.operatoros.net', TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'synthetic-outcall-signing-placeholder', TWILIO_VERIFY_SERVICE_SID: `VA${'b'.repeat(32)}`,
    TWILIO_PHONE_NUMBER: '+15555550100', TWILIO_ALLOWED_COUNTRIES: 'US,CA',
    TWILIO_API_KEY_SID: '', TWILIO_API_KEY_SECRET: '', OUTCALL_RESOURCE_POLICY_JSON: JSON.stringify(policy) };
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  const previousFixture = globalThis[fixtureKey];
  const fixture = { approved: false, queries: [] };
  globalThis[fixtureKey] = fixture;
  globalThis.fetch = () => { throw new Error('External calls prohibited'); };
  try {
    Object.assign(process.env, env);
    assert.equal((await provider.outCallReadyState()).ready, false, 'no matching approval row');
    assert.equal(provider.outCallProviderState().name, 'twilio', 'production never selects test adapter');
    assert.equal(fixture.queries.length, 1);
    const approvalQuery = fixture.queries[0].strings.join('');
    for (const predicate of ['a.account_key=', 'a.policy_hash=', 'a.revoked_at IS NULL', 'a.approved_at<=NOW()', 'a.expires_at>NOW()', "u.status='active'", "u.platform_role='super_admin'"]) {
      assert.ok(approvalQuery.includes(predicate), predicate);
    }
    fixture.approved = true;
    assert.equal((await provider.outCallReadyState()).ready, true, 'synthetic matching approval is the positive control');
    delete process.env.OUTCALL_RESOURCE_POLICY_JSON;
    assert.equal((await provider.outCallReadyState()).ready, false, 'approval cannot replace policy');
    process.env.OUTCALL_RESOURCE_POLICY_JSON = env.OUTCALL_RESOURCE_POLICY_JSON;
    process.env.OUTCALL_LIVE_PROVIDER = 'disabled';
    assert.equal((await provider.outCallReadyState()).ready, false, 'approval cannot enable the live switch');
    process.env.OUTCALL_LIVE_PROVIDER = 'enabled';
    process.env.TWILIO_ALLOWED_COUNTRIES = 'US,GB';
    assert.equal((await provider.outCallReadyState()).ready, false, 'approval cannot replace valid configuration');
    process.env.TWILIO_ALLOWED_COUNTRIES = 'US';
    process.env.APP_ENV = 'test';
    assert.notEqual(provider.outCallProviderState().name, 'test', 'production NODE_ENV rejects test adapter');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousFixture === undefined) delete globalThis[fixtureKey]; else globalThis[fixtureKey] = previousFixture;
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
