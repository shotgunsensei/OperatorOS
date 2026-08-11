import { spawnSync } from 'node:child_process';

function available(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { shell: false, stdio: 'ignore' });
  return !result.error && result.status === 0;
}
const android = available('adb', ['get-state']);
const ios = process.platform === 'darwin' && available('xcrun', ['simctl', 'list', 'devices', 'booted', '--json']);
const result = { android, ios, platform: process.platform, required: process.env.TORQUESHED_REQUIRE_DEVICE_HARNESS === '1' };
console.log(JSON.stringify(result));
if (result.required && (!android || !ios)) process.exit(2);
