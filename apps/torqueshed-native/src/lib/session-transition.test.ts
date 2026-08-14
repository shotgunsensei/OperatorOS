import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionTransitionCoordinator } from './session-transition';

test('session transitions serialize refresh installation before logout', async () => {
  const coordinator = new SessionTransitionCoordinator();
  const events: string[] = [];
  let releaseRefresh!: () => void;
  const refreshPaused = new Promise<void>(resolve => { releaseRefresh = resolve; });

  const refresh = coordinator.serialize(async () => {
    events.push('refresh-start');
    await refreshPaused;
    events.push('refresh-installed');
  });
  const logout = coordinator.serialize(() => {
    events.push('logout-clear');
    coordinator.advance();
  });

  await Promise.resolve();
  assert.deepEqual(events, ['refresh-start']);
  releaseRefresh();
  await Promise.all([refresh, logout]);
  assert.deepEqual(events, ['refresh-start', 'refresh-installed', 'logout-clear']);
});

test('logout generation prevents a late refresh response from installing', async () => {
  const coordinator = new SessionTransitionCoordinator();
  const refreshGeneration = coordinator.generation;

  await coordinator.serialize(() => coordinator.advance());
  const installed = await coordinator.serialize(() => coordinator.isCurrent(refreshGeneration));

  assert.equal(installed, false);
});
