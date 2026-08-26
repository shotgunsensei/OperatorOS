import { spawn, spawnSync } from 'node:child_process';
import { closeSync, createWriteStream, openSync } from 'node:fs';
import net from 'node:net';

// A bare pnpm shim can resolve an unrelated globally bundled CLI (the Codex
// desktop runtime currently exposes pnpm 11). Route every repository child
// command through Corepack so packageManager remains the single version
// authority on Windows, CI, and Replit.
export const PNPM = 'corepack-pnpm';

function requiresWindowsCommandShell(command) {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(command);
}

function executableInvocation(command, args) {
  if (command === PNPM) {
    return executableInvocation(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', ...args]);
  }
  if (!requiresWindowsCommandShell(command)) return { command, args };
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  };
}

export function run(command, args, { cwd = process.cwd(), env = process.env, stdio = 'inherit' } = {}) {
  const invocation = executableInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    stdio,
    // Windows command shims are batch files. Invoke cmd.exe explicitly so
    // Node 24 does not raise EINVAL and no general-purpose shell is enabled.
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runCaptured(command, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const invocation = executableInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

export function parseNodeTestSummary(output) {
  const valueFor = (label) => {
    const expression = new RegExp(`(?:^|\\n)\\s*(?:ℹ|#)?\\s*${label}\\s+(\\d+)`, 'giu');
    const matches = [...output.matchAll(expression)];
    return matches.length > 0 ? Number(matches.at(-1)[1]) : null;
  };
  const summary = Object.fromEntries([
    'tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo',
  ].map((label) => [label, valueFor(label)]));
  return ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
    .every((label) => summary[label] != null) ? summary : null;
}

export function requiredTestExitCode(processStatus, summary) {
  if (processStatus !== 0) return processStatus;
  if (!summary) return 1;
  return summary.fail === 0 && summary.cancelled === 0 && summary.skipped === 0 && summary.todo === 0
    ? 0
    : 1;
}

export function spawnLogged(command, args, {
  cwd = process.cwd(), env = process.env, logPath, mirrorToParent = true, directToLog = false,
} = {}) {
  const invocation = executableInvocation(command, args);
  const directLogDescriptor = directToLog ? openSync(logPath, 'w') : null;
  const child = spawn(invocation.command, invocation.args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: directLogDescriptor == null
      ? ['ignore', 'pipe', 'pipe']
      : ['ignore', directLogDescriptor, directLogDescriptor],
  });
  if (directLogDescriptor != null) {
    closeSync(directLogDescriptor);
    return child;
  }
  const stream = createWriteStream(logPath, { flags: 'w' });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  if (mirrorToParent) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }
  child.once('exit', () => stream.end());
  return child;
}

export async function waitForHttp(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let detail = 'not reachable';
  while (Date.now() < deadline) {
    if (child?.exitCode != null) throw new Error(`Process exited before ${url} became ready (${child.exitCode})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      detail = `HTTP ${response.status}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}: ${detail}`);
}

export async function waitForPort(port, host = '127.0.0.1', timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise(resolve => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.setTimeout(1_000, () => { socket.destroy(); resolve(false); });
    });
    if (connected) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

export async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32' && child.pid) {
    // Windows command shims create a cmd -> pnpm -> node process tree. Killing
    // only the shim leaves Next/runtime descendants holding inherited pipes and
    // the release gate never exits. Terminate only the exact spawned tree.
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 10_000)),
    ]);
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 10_000)),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
}
