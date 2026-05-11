import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCorsAllowedOrigins, isCorsOriginAllowed } from '../src/lib/cors-origin.js';

test('parseCorsAllowedOrigins parses comma-separated list with trimming', () => {
  const parsed = parseCorsAllowedOrigins('https://app.example.com, https://admin.example.com ,,');
  assert.equal(parsed.size, 2);
  assert.equal(parsed.has('https://app.example.com'), true);
  assert.equal(parsed.has('https://admin.example.com'), true);
});

test('isCorsOriginAllowed allows only exact matches from CORS_ALLOWED_ORIGINS', () => {
  const allowed = parseCorsAllowedOrigins('https://example.com');
  assert.equal(isCorsOriginAllowed('https://example.com', allowed, 'production'), true);
  assert.equal(isCorsOriginAllowed('https://example.com.evil', allowed, 'production'), false);
  assert.equal(isCorsOriginAllowed('https://example.com/', allowed, 'production'), false);
});

test('local dev fallback is only enabled in NODE_ENV=development', () => {
  const allowed = parseCorsAllowedOrigins(undefined);
  assert.equal(isCorsOriginAllowed('http://localhost:3000', allowed, 'development'), true);
  assert.equal(isCorsOriginAllowed('http://127.0.0.1:3000', allowed, 'development'), true);
  assert.equal(isCorsOriginAllowed('http://localhost:3000', allowed, 'production'), false);
});

test('requests without Origin header are allowed', () => {
  const allowed = parseCorsAllowedOrigins(undefined);
  assert.equal(isCorsOriginAllowed(undefined, allowed, 'production'), true);
});
