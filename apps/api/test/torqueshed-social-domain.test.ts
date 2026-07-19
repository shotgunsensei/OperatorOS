import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseListingInput,
  parsePostInput,
  parseProfileInput,
  parseReaction,
  parseReportInput,
  SOCIAL_RATE_LIMITS,
} from '../src/lib/torqueshed-social-domain.js';

test('marketplace input uses integer minor units and privacy-safe locality data', () => {
  const listing = parseListingInput({
    title: 'Clean diagnostic scan tool',
    description: 'Working scan tool with adapters and a printed quick-start guide.',
    categorySlug: 'tools',
    type: 'sell',
    condition: 'working',
    priceMinor: 12_500,
    locality: 'Raleigh',
    region: 'NC',
    countryCode: 'us',
  });
  assert.equal(listing.priceMinor, 12_500);
  assert.equal(listing.currency, 'USD');
  assert.equal(listing.countryCode, 'US');
  assert.equal(listing.contentHash.length, 64);
  assert.throws(
    () => parseListingInput({ ...listing, categorySlug: 'tools', priceMinor: 12.5 }),
    (error: any) => error.code === 'SOCIAL_MINOR_UNITS_INVALID',
  );
});

test('stored markup, precise addresses, and prohibited marketplace content are rejected', () => {
  const base = {
    title: 'Automotive service item',
    description: 'A legitimate automotive workshop item.',
    categorySlug: 'other',
    type: 'sell',
    condition: 'working',
    priceMinor: 500,
  };
  assert.throws(
    () => parseListingInput({ ...base, description: '<img src=x onerror=alert(1)>' }),
    (error: any) => error.code === 'SOCIAL_MARKUP_PROHIBITED',
  );
  assert.throws(
    () => parseListingInput({ ...base, locality: '123 Main Street' }),
    (error: any) => error.code === 'SOCIAL_PRECISE_LOCATION_PROHIBITED',
  );
  assert.throws(
    () => parseListingInput({ ...base, description: 'Emissions defeat device ready to install.' }),
    (error: any) => error.code === 'MARKETPLACE_ITEM_PROHIBITED',
  );
});

test('community input normalizes tags and keeps privacy and moderation values bounded', () => {
  const post = parsePostInput({
    title: 'Intermittent misfire investigation',
    body: 'Sharing observed symptoms and the tests that ruled out an ignition fault.',
    topicSlug: 'diagnostics',
    visibility: 'followers',
    tags: ['Diagnostics', 'diagnostics', 'Test First'],
  });
  assert.deepEqual(post.tags, ['diagnostics', 'test first']);
  assert.equal(post.visibility, 'followers');
  assert.equal(parseReaction('helpful'), 'helpful');
  assert.equal(
    parseReportInput({ reasonCode: 'privacy', details: 'Contains private data.' }).reasonCode,
    'privacy',
  );
  assert.throws(
    () => parseProfileInput({ displayName: 'Builder', locality: '35.7796, -78.6382' }),
    (error: any) => error.code === 'SOCIAL_PRECISE_LOCATION_PROHIBITED',
  );
  assert.equal(SOCIAL_RATE_LIMITS.userWritesPerMinute, 20);
  assert.ok(SOCIAL_RATE_LIMITS.tenantWritesPerMinute > SOCIAL_RATE_LIMITS.userWritesPerMinute);
});
