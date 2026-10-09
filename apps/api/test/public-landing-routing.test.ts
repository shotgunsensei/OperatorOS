import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { middleware } from '../../web/src/middleware.js';
const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const { NextRequest } = requireWeb('next/server');
const request = (host: string, pathname: string) => new NextRequest(`https://${host}${pathname}`, {
  headers:{host,'x-forwarded-host':host,'x-forwarded-proto':'https'},
});

test('the three canonical module landings remain public without a session', async () => {
  for (const slug of ['trades','msps','healthcare-legal']) {
    const response = await middleware(request('operatoros.net',`/for/${slug}?utm_source=sales`));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('location'),null);
    assert.equal(response.headers.get('x-middleware-next'),'1');
  }
});

test('unknown and nested audience paths receive 404 before streaming and cannot index', async () => {
  for (const pathname of ['/for/unknown','/for/msps/extra','/for/']) {
    const response = await middleware(request('operatoros.net',pathname));
    assert.equal(response.status,404);
    assert.equal(response.headers.get('x-robots-tag'),'noindex');
  }
});

test('public landing preference does not bypass the module-host sign-in gate', async () => {
  const response = await middleware(request('techdeck.operatoros.net','/for/trades'));
  assert.equal(response.status,307);
  assert.equal(new URL(response.headers.get('location')!).hostname,'auth.operatoros.net');
});
