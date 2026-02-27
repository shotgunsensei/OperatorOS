import { spawn } from 'child_process';
import type { RunnerStatus } from '../../../packages/sdk/src/index.js';

const WORKSPACE_BASE = process.env.WORKSPACE_VOLUME_BASE ?? '/tmp/operatoros-workspaces';
const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-/]+$/;
const SAFE_URL_PATTERN = /^https?:\/\/[a-zA-Z0-9._\-/:@]+$/;

function validateGitInputs(url: string, ref: string): void {
  if (!SAFE_URL_PATTERN.test(url)) throw new Error(`Invalid git URL: ${url}`);
  if (!SAFE_REF_PATTERN.test(ref)) throw new Error(`Invalid git ref: ${ref}`);
}

function containerName(workspaceId: string): string {
  return `ws-${workspaceId}`;
}

function volumePath(workspaceId: string): string {
  return `${WORKSPACE_BASE}/${workspaceId}`;
}

function dockerCmd(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });
    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
  });
}

function spawnWithStdin(cmd: string, args: string[], stdin: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });
    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });
    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

export async function dockerCreateRunner(
  workspaceId: string,
  _profileId: string,
  profileImage: string,
  gitUrl: string,
  gitRef: string,
): Promise<{ success: boolean; message: string; containerId?: string }> {
  validateGitInputs(gitUrl, gitRef);
  const name = containerName(workspaceId);
  const vol = volumePath(workspaceId);

  const mkdirResult = await dockerCmd(['run', '--rm', '-v', `${vol}:/workspace`, 'alpine', 'sh', '-c',
    `if [ -z "$(ls -A /workspace 2>/dev/null)" ]; then echo "empty"; fi`]);

  const needsClone = mkdirResult.stdout.includes('empty') || mkdirResult.exitCode !== 0;

  if (needsClone) {
    const cloneResult = await dockerCmd([
      'run', '--rm',
      '-v', `${vol}:/workspace`,
      'alpine/git',
      'clone', '--depth', '1', '--branch', gitRef, gitUrl, '/workspace',
    ]);
    if (cloneResult.exitCode !== 0) {
      return { success: false, message: `Git clone failed: ${cloneResult.stderr}` };
    }
  }

  const existing = await dockerCmd(['ps', '-aq', '-f', `name=^${name}$`]);
  if (existing.stdout) {
    await dockerCmd(['rm', '-f', existing.stdout]);
  }

  const createResult = await dockerCmd([
    'run', '-d',
    '--name', name,
    '-v', `${vol}:/workspace`,
    '-w', '/workspace',
    profileImage,
    'sleep', 'infinity',
  ]);

  if (createResult.exitCode !== 0) {
    return { success: false, message: `Container creation failed: ${createResult.stderr}` };
  }

  return { success: true, message: `Docker runner ${name} created`, containerId: createResult.stdout };
}

export async function dockerStopRunner(
  workspaceId: string,
): Promise<{ success: boolean; message: string }> {
  const name = containerName(workspaceId);
  const result = await dockerCmd(['rm', '-f', name]);
  if (result.exitCode !== 0 && !result.stderr.includes('No such container')) {
    return { success: false, message: `Failed to stop: ${result.stderr}` };
  }
  return { success: true, message: `Docker runner ${name} stopped` };
}

export async function dockerGetStatus(workspaceId: string): Promise<RunnerStatus | null> {
  const name = containerName(workspaceId);
  const result = await dockerCmd(['inspect', '--format', '{{.State.Status}}||{{.State.StartedAt}}||{{.Id}}', name]);
  if (result.exitCode !== 0) return null;

  const [status, startedAt, containerId] = result.stdout.split('||');
  return {
    workspaceId,
    containerId: containerId?.substring(0, 12),
    phase: status === 'running' ? 'Running' : status,
    ready: status === 'running',
    startedAt,
    mode: 'docker',
  };
}

export async function dockerExec(
  workspaceId: string,
  command: string,
  timeoutSec: number,
  onStdout?: (line: string) => void,
  onStderr?: (line: string) => void,
  stdin?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const name = containerName(workspaceId);
  const start = Date.now();

  return new Promise((resolve) => {
    const args = ['exec'];
    if (stdin) args.push('-i');
    args.push(name, 'bash', '-lc', command);

    const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 2000);
      }
    }, timeoutSec * 1000);

    proc.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      if (onStdout) {
        for (const line of chunk.split('\n')) {
          if (line) onStdout(line);
        }
      }
    });

    proc.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      if (onStderr) {
        for (const line of chunk.split('\n')) {
          if (line) onStderr(line);
        }
      }
    });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim(), durationMs: Date.now() - start });
    });

    proc.on('error', (err) => {
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout: '', stderr: err.message, durationMs: Date.now() - start });
    });
  });
}
