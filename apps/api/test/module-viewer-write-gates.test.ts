import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SESSION_SECRET ||= 'module-viewer-write-gate-test-secret-32-plus';

const { requireTenantModuleWriteAccess } = await import('../src/lib/tenant-auth.ts');

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function replyHarness() {
  return {
    sent: false,
    statusCode: 200,
    payload: null as Record<string, unknown> | null,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload: Record<string, unknown>) {
      this.sent = true;
      this.payload = payload;
      return this;
    },
  };
}

type RegisteredRoute = {
  method: string;
  path: string;
  preHandler: string | null;
};

function moduleRoutes(source: string): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const routePattern = /app\.(get|post|patch|put|delete)\(\s*'([^']+)'\s*,([\s\S]*?)(?=\n\s*app\.(?:get|post|patch|put|delete)\(|\n\s*\/\/ =====|\n\s*}\s*$)/g;
  for (const match of source.matchAll(routePattern)) {
    const path = match[2];
    if (!path.startsWith('/v1/modules/')) continue;
    const preHandler = match[3].match(/preHandler:\s*([^}\n]+)/)?.[1]?.trim() ?? null;
    routes.push({ method: match[1], path, preHandler });
  }
  return routes;
}

test('module write guard rejects viewer and permits write-capable grants', async () => {
  const viewerReply = replyHarness();
  await requireTenantModuleWriteAccess(
    { tenantModuleAccessLevel: 'viewer' } as never,
    viewerReply as never,
  );
  assert.equal(viewerReply.statusCode, 403);
  assert.equal(viewerReply.payload?.code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
  assert.equal(viewerReply.payload?.currentAccessLevel, 'viewer');

  for (const accessLevel of ['user', 'manager']) {
    const reply = replyHarness();
    await requireTenantModuleWriteAccess({ tenantModuleAccessLevel: accessLevel } as never, reply as never);
    assert.equal(reply.sent, false, `${accessLevel} should retain mutation authority`);
  }

  const tenantViewerReply = replyHarness();
  await requireTenantModuleWriteAccess({
    tenantModuleAccessLevel: 'manager',
    tenantContext: { membershipRole: 'viewer', viaPlatformRole: false },
  } as never, tenantViewerReply as never);
  assert.equal(tenantViewerReply.statusCode, 403);
  assert.equal(tenantViewerReply.payload?.code, 'TENANT_WRITE_ACCESS_REQUIRED');

  const platformAdminReply = replyHarness();
  await requireTenantModuleWriteAccess({
    tenantModuleAccessLevel: 'manager',
    tenantContext: { membershipRole: 'viewer', viaPlatformRole: true },
  } as never, platformAdminReply as never);
  assert.equal(platformAdminReply.sent, false, 'platform authority remains owner-equivalent');
});

test('shared-runtime module mutations use write guards while GET routes remain read-only gated', () => {
  const moduleShell = readRepoFile('apps/api/src/routes/module-shell-routes.ts');
  const pulsedesk = readRepoFile('apps/api/src/routes/pulsedesk-routes.ts');
  const launchkit = readRepoFile('apps/api/src/routes/ninja-launch-kit-routes.ts');

  for (const [readGuard, writeGuard] of [
    ['callcommandGuards', 'callcommandWriteGuards'],
    ['studyforgeGuards', 'studyforgeWriteGuards'],
    ['ninjamationGuards', 'ninjamationWriteGuards'],
    ['tradeflowkitGuards', 'tradeflowkitWriteGuards'],
    ['techdeckGuards', 'techdeckWriteGuards'],
  ]) {
    assert.match(
      moduleShell,
      new RegExp(`const ${writeGuard} = \\[\\.\\.\\.${readGuard}, requireTenantModuleWriteAccess\\]`),
    );
  }
  assert.match(
    moduleShell,
    /const callcommandAdminGuards = \[\s*\.\.\.callcommandWriteGuards,\s*requireTenantAdmin,\s*\]/,
  );
  assert.match(
    pulsedesk,
    /const pulsedeskWriteGuards = \[\.\.\.pulsedeskGuards, requireTenantModuleWriteAccess\]/,
  );
  assert.match(
    launchkit,
    /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/,
  );

  const routes = [...moduleRoutes(moduleShell), ...moduleRoutes(pulsedesk)];
  const signedWebhooks = routes.filter((route) => route.path.includes('/webhooks/twilio/'));
  assert.equal(signedWebhooks.length, 2, 'Twilio provider callbacks remain on their signature boundary');

  const firstPartyRoutes = routes.filter((route) => !route.path.includes('/webhooks/twilio/'));
  const mutations = firstPartyRoutes.filter((route) => route.method !== 'get');
  const reads = firstPartyRoutes.filter((route) => route.method === 'get');
  assert.equal(mutations.length, 30, 'all legacy shared-shell first-party mutations should be inventoried');
  assert.equal(reads.length, 15, 'all legacy shared-shell first-party reads should be inventoried');

  for (const route of mutations) {
    assert.ok(
      route.preHandler && /(?:WriteGuards|callcommandAdminGuards)/.test(route.preHandler),
      `${route.method.toUpperCase()} ${route.path} must run a module write guard`,
    );
  }
  for (const route of reads) {
    assert.ok(route.preHandler, `GET ${route.path} must retain module read/launch guards`);
    assert.doesNotMatch(
      route.preHandler,
      /WriteGuards|requireTenantModuleWriteAccess/,
      `GET ${route.path} must remain available to viewer grants`,
    );
  }

  const launchKitRoutes = moduleRoutes(launchkit);
  assert.ok(launchKitRoutes.length >= 12, 'dedicated Ninja Launch Kit routes should be inventoried');
  for (const route of launchKitRoutes.filter((item) => item.method !== 'get')) {
    assert.match(
      route.preHandler ?? '',
      /writeGuards/,
      `${route.method.toUpperCase()} ${route.path} must enforce the dedicated write guard`,
    );
  }
  for (const route of launchKitRoutes.filter((item) => item.method === 'get')) {
    assert.match(
      route.preHandler ?? '',
      /readGuards/,
      `GET ${route.path} must remain viewer-readable through the dedicated read guard`,
    );
  }
});
