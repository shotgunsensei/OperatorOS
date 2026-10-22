import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OFFICEEXIT_CAPABILITIES, OFFICEEXIT_TENANT_PURCHASE_EDITION, OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION,
  TOOL_MODULE_CATALOG, createOfficeExitTenantToolGrant, isOfficeExitToolGrant, officeExitCapabilitiesForEdition,
} from '@operatoros/sdk';
import { CLOSED_TOOL_COMMERCE } from '../src/lib/tool-commerce.js';

test('one $99 tenant product maps to all ten current features including Publisher Rescue', () => {
  const grant = createOfficeExitTenantToolGrant();
  assert.equal(OFFICEEXIT_TENANT_PURCHASE_EDITION, 'MSP Pro');
  assert.equal(OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION, 'officeexit-2026-tenant-v1');
  assert.deepEqual(grant, { edition: 'MSP Pro', coverage: 'entire_tenant', capabilities: [...OFFICEEXIT_CAPABILITIES],
    licenseTermsVersion: 'officeexit-2026-tenant-v1' });
  assert.equal(grant.capabilities.length, 10); assert.equal(new Set(grant.capabilities).size, 10);
  assert.ok(grant.capabilities.includes('publisherRescue')); assert.ok(isOfficeExitToolGrant(grant));
  const product = TOOL_MODULE_CATALOG.find(tool => tool.slug === 'officeexit')!;
  assert.deepEqual(product.price, { amountMinor: 9900, currency: 'usd' });
  assert.equal(product.coverage, 'entire_tenant'); assert.equal(product.requiresPaidBase, false);
  assert.equal(product.recurringCharges, false); assert.equal(product.automaticRenewal, false);
  assert.equal(product.updatesAndSupportCoverage, 'not_bundled'); assert.equal(product.futureMajorVersionCoverage, 'undecided');
  assert.deepEqual(Object.keys(grant).sort(), ['capabilities', 'coverage', 'edition', 'licenseTermsVersion']);
});

test('narrow historical tiers and all-features alternative aliases cannot replace the approved tenant product', () => {
  const grant = createOfficeExitTenantToolGrant();
  for (const edition of ['Technician', 'Professional', 'MSP', 'Consultant'] as const) {
    assert.equal(isOfficeExitToolGrant({ ...grant, edition, capabilities: officeExitCapabilitiesForEdition(edition) }), false);
  }
  assert.equal(officeExitCapabilitiesForEdition('Technician').length, 1);
  assert.equal(officeExitCapabilitiesForEdition('Professional').length, 4);
  assert.equal(officeExitCapabilitiesForEdition('MSP').includes('publisherRescue'), false);
  assert.equal(officeExitCapabilitiesForEdition('MSP Pro').length, 10);
  assert.equal(officeExitCapabilitiesForEdition('Consultant').length, 10);
  for (const patch of [{ capabilities: grant.capabilities.filter(value => value !== 'publisherRescue') },
    { capabilities: [...grant.capabilities, 'invented'] }, { maximumDevices: 1 }, { userLimit: 5 }, { siteLimit: 2 },
    { licenseTermsVersion: 'future-major-unapproved' }]) assert.equal(isOfficeExitToolGrant({ ...grant, ...patch }), false);
});

test('grant factory cannot be used to mutate later grants or the shared feature list', () => {
  const first = createOfficeExitTenantToolGrant(); first.capabilities.pop();
  assert.equal(createOfficeExitTenantToolGrant().capabilities.length, 10); assert.equal(OFFICEEXIT_CAPABILITIES.length, 10);
});

test('approved capability mapping does not open checkout, linking, delivery or downloads', () => {
  assert.deepEqual(CLOSED_TOOL_COMMERCE, { checkout: { enabled: false }, officeexitLink: { enabled: false },
    artifacts: null, officeexitDelivery: { enabled: false } });
  assert.ok(TOOL_MODULE_CATALOG.every(tool => !tool.salesEnabled && !tool.downloadsAvailable && tool.releaseStatus === 'not_accepted'));
  const source = readFileSync(new URL('../../web/src/components/IndependentToolsCatalog.tsx', import.meta.url), 'utf8');
  assert.match(source, /All ten current OfficeExit 2026 features, including Publisher Rescue/);
  assert.match(source, /No per-user, device or site limits/);
  assert.match(source, /Future major-version coverage has not been decided/);
  assert.doesNotMatch(source, /MSP Pro|Consultant|Technician/);
});
