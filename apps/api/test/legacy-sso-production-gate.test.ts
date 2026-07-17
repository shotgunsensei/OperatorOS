import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ALLOW_LEGACY_SSO_ROLLBACK = 'false';
process.env.SESSION_SECRET = 'production-gate-session-secret-32-plus';
process.env.SSO_CODE_ENCRYPTION_SECRET = 'production-gate-code-secret-32-plus';
process.env.MODULE_SSO_SECRET = 'legacy-rollback-secret-32-plus-chars';

test('production mounts only the SSO v1 browser lane when rollback is disabled', async () => {
  const Fastify = (await import('fastify')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.ts');
  const { registerSsoRoutes } = await import('../src/routes/sso-routes.ts');

  const app = Fastify();
  await registerModuleRoutes(app);
  await registerSsoRoutes(app);
  await app.ready();

  try {
    for (const url of [
      '/v1/modules/techdeck/handoff',
      '/v1/modules/sso/consume',
      '/v1/modules/sso/exchange',
      '/modules/sso/consume',
      '/modules/sso/exchange',
      '/v1/modules/sso/diagnose',
      '/v1/sso/consume',
      '/api/sso/consume',
    ]) {
      const response = await app.inject({ method: 'POST', url, payload: {} });
      assert.equal(response.statusCode, 404, `${url} must be unmounted in production`);
    }

    const browserExchange = await app.inject({
      method: 'POST',
      url: '/v1/sso/browser-exchange',
      payload: {},
    });
    assert.notEqual(browserExchange.statusCode, 404, 'canonical browser exchange remains mounted');
  } finally {
    await app.close();
  }
});
