import assert from 'node:assert/strict';
import makeConfig from '../app.config';

process.env.TORQUESHED_RELEASE_CONFIG = '1';
const config = makeConfig({ config: { name: 'TorqueShed', slug: 'torqueshed' } } as any);
assert.match(process.env.TORQUESHED_IOS_TEAM_ID ?? '', /^[A-Z0-9]{10}$/);
assert.match(process.env.TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT ?? '', /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
assert.match(process.env.TORQUESHED_MOBILE_BUILD_ID ?? '', /^[A-Za-z0-9._-]{3,80}$/);
console.log(JSON.stringify({ valid: true, buildId: (config.extra as any)?.mobileBuildId, associations: 'configured' }));
