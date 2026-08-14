import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = "import { requireSessionSecret } from './src/lib/session-secret.ts'; requireSessionSecret();";

test('process fails fast when SESSION_SECRET is missing', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', runner], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      SESSION_SECRET: '',
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, 'process should exit non-zero when SESSION_SECRET is missing');
  assert.match(`${result.stderr}${result.stdout}`, /SESSION_SECRET is required at boot/i);
});
