import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NINJA_LAUNCH_KIT_SOURCE_COMMIT,
  planNinjaLaunchKitImport,
} from '../src/lib/ninja-launch-kit-import.ts';

const descriptor = {
  sourceCommit: NINJA_LAUNCH_KIT_SOURCE_COMMIT,
  export: {
    launchKits: [{ id: 1, title: 'Garage opening' }],
    brandProfiles: [{ id: 2, name: 'Garage brand' }],
    exports: [{ id: 3, launchKitId: 1 }],
    users: [{ id: 99, password: 'excluded' }],
  },
};

test('Ninja Launch Kit dry-run reconciliation is pinned and deterministic', () => {
  const first = planNinjaLaunchKitImport(descriptor);
  const second = planNinjaLaunchKitImport({
    sourceCommit: NINJA_LAUNCH_KIT_SOURCE_COMMIT,
    export: { ...descriptor.export },
  });
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.counts.launchKits, 1);
  assert.match(first.exportSha256, /^[0-9a-f]{64}$/);
});

test('Ninja Launch Kit import never applies child identity, billing, admin, or legacy SSO authority', () => {
  const plan = planNinjaLaunchKitImport(descriptor);
  assert.ok(plan.excluded.includes('password hashes'));
  assert.ok(plan.excluded.includes('stripe events'));
  assert.ok(plan.excluded.includes('legacy SSO tokens'));
  assert.match(plan.blockers.join(' '), /No apply mode/);
  assert.throws(() => planNinjaLaunchKitImport({ ...descriptor, sourceCommit: 'untrusted' }));
});
