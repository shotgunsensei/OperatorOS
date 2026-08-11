import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
function files(path: string): string[] { return readdirSync(path).flatMap(name => { const full = join(path, name); return statSync(full).isDirectory() ? files(full) : [full]; }); }

test('Phase 29 active native product is Expo Router and never imports migration evidence', () => {
  const appRoot = resolve(root, 'apps/torqueshed-native'); const source = files(appRoot).filter(path => /\.(ts|tsx|json)$/.test(path)).map(path => readFileSync(path, 'utf8')).join('\n');
  assert.match(read('apps/torqueshed-native/package.json'), /expo-router\/entry/);
  assert.doesNotMatch(source, /apps\/modules\/torqueshed\/source|artifacts\/torqueshed-mobile/);
  for (const route of ['(tabs)/index.tsx','(tabs)/garage.tsx','(tabs)/builds.tsx','(tabs)/assist.tsx','(tabs)/market.tsx','build/[id].tsx','diagnostic/[id].tsx','live-bay/[id].tsx','profile.tsx','settings.tsx','notifications.tsx']) assert.ok(statSync(resolve(appRoot, 'src/app', route)).isFile(), route);
});

test('native security, offline, association, and release gates are explicit', () => {
  const auth = read('apps/torqueshed-native/src/lib/auth.tsx'); const queue = read('apps/torqueshed-native/src/lib/offline-queue.ts'); const server = read('apps/api/src/lib/torqueshed-native-auth.ts');
  assert.match(auth, /SecureStore/); assert.match(auth, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/); assert.match(auth, /codeChallenge/); assert.doesNotMatch(auth, /AsyncStorage\.setItem\([^\n]*(accessToken|refreshToken)/);
  assert.match(queue, /client mutation|idempotency|Idempotency|QueuedMutation/i); assert.match(server, /tsn_a_/); assert.match(server, /resolveTenantModuleAccess/); assert.match(server, /timingSafeEqual/);
  assert.match(read('apps/api/src/lib/database-release-contract.ts'), /releaseVersion:\s*39/);
  assert.match(read('apps/web/src/app/.well-known/apple-app-site-association/route.ts'), /TORQUESHED_IOS_TEAM_ID/);
  assert.match(read('apps/web/src/app/.well-known/assetlinks.json/route.ts'), /TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT/);
  assert.doesNotMatch(read('apps/torqueshed-native/app.config.ts'), /YOUR_|PLACEHOLDER|REPLACE_ME|0000000000|AA:AA:AA/i);
});
