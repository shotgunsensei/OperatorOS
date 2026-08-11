import assert from 'node:assert/strict';
import makeConfig from '../app.config';

const config = makeConfig({ config: { name: 'TorqueShed', slug: 'torqueshed' } } as any);
assert.equal(config.scheme, 'torqueshed');
assert.equal(config.ios?.bundleIdentifier, 'pro.torqueshed.app');
assert.equal(config.android?.package, 'pro.torqueshed.app');
assert.ok(config.ios?.associatedDomains?.includes('applinks:torqueshed.operatoros.net'));
assert.ok(config.android?.intentFilters?.some(filter => filter.autoVerify === true));
assert.equal((config.extra as any)?.apiBaseUrl, 'https://torqueshed.operatoros.net/api');
const serialized = JSON.stringify(config);
assert.doesNotMatch(serialized, /YOUR_|PLACEHOLDER|TEAMID|SHA256_FINGERPRINT|example\.com/i);
console.log(JSON.stringify({ valid: true, bundleIdentifier: config.ios?.bundleIdentifier, package: config.android?.package, apiBaseUrl: (config.extra as any)?.apiBaseUrl }));
