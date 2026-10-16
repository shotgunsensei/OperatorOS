import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOutCallResourceFixtureEnvironment } from './outcall-resource-fixture-guard.js';

const safe = {
  APP_ENV: 'test',
  NODE_ENV: 'test',
  PARITY_DATABASE_IS_DISPOSABLE: '1',
  DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_phase21_release',
};

test('OutCall resource fixture accepts the authoritative disposable CI identity', () => {
  assert.equal(assertOutCallResourceFixtureEnvironment(safe).database, 'operatoros_phase21_release');
  assert.equal(assertOutCallResourceFixtureEnvironment({
    ...safe,
    DATABASE_URL: 'postgres://postgres:synthetic@localhost:55471/operatoros_outcall_oct14_test',
  }).database, 'operatoros_outcall_oct14_test');
});

test('OutCall resource fixture rejects missing or production environment signals', () => {
  for (const [app, node] of [
    ['production', 'test'], ['test', 'production'], ['production', 'production'],
    [undefined, 'test'], ['test', undefined], ['development', 'test'],
  ]) {
    assert.throws(() => assertOutCallResourceFixtureEnvironment({
      ...safe, APP_ENV: app, NODE_ENV: node,
    }), /APP_ENV=test and NODE_ENV=test/u);
  }
});

test('OutCall resource fixture requires an explicit disposable marker', () => {
  for (const marker of [undefined, '0', 'true']) {
    assert.throws(() => assertOutCallResourceFixtureEnvironment({
      ...safe, PARITY_DATABASE_IS_DISPOSABLE: marker,
    }), /PARITY_DATABASE_IS_DISPOSABLE=1/u);
  }
});

test('OutCall resource fixture rejects remote, unmarked and redirected database targets', () => {
  for (const url of [
    'postgresql://postgres:synthetic@db.example.invalid:5432/operatoros_test',
    'postgresql://postgres:synthetic@localhost.example.invalid:5432/operatoros_test',
    'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros',
    'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_latest',
    'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_contest',
    'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_test?host=db.example.invalid',
    'postgresql://postgres:synthetic@127.0.0.1:5432/operatoros_test#host=db.example.invalid',
    'https://127.0.0.1/operatoros_test',
    'postgresql://127.0.0.1/',
    '',
    'not a URL',
  ]) {
    assert.throws(() => assertOutCallResourceFixtureEnvironment({ ...safe, DATABASE_URL: url }));
  }
});
