import { spawn } from 'child_process';
import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, readlinkSync } from 'fs';
import type { RunnerStatus } from '../../../packages/sdk/src/index.js';

const WORKSPACE_BASE = process.env.WORKSPACE_VOLUME_BASE ?? '/tmp/operatoros-workspaces';
const WORKSPACE_SYMLINK = '/tmp/workspace';
const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-/]+$/;
const SAFE_URL_PATTERN = /^https?:\/\/[a-zA-Z0-9._\-/:@]+$/;

function validateGitInputs(url: string, ref: string): void {
  if (!SAFE_URL_PATTERN.test(url)) throw new Error(`Invalid git URL: ${url}`);
  if (!SAFE_REF_PATTERN.test(ref)) throw new Error(`Invalid git ref: ${ref}`);
}

function workspacePath(workspaceId: string): string {
  return `${WORKSPACE_BASE}/${workspaceId}`;
}

const activeRunners = new Map<string, { startedAt: string }>();

function runCmd(cmd: string, args: string[], cwd?: string, stdinData?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
    if (stdinData) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    }
  });
}

function setupWorkspaceSymlink(wsPath: string): void {
  try {
    if (lstatSync(WORKSPACE_SYMLINK)) {
      const target = readlinkSync(WORKSPACE_SYMLINK);
      if (target === wsPath) return;
      unlinkSync(WORKSPACE_SYMLINK);
    }
  } catch {
  }
  try {
    symlinkSync(wsPath, WORKSPACE_SYMLINK);
  } catch {
  }
}

function removeWorkspaceSymlink(wsPath: string): void {
  try {
    if (lstatSync(WORKSPACE_SYMLINK)) {
      const target = readlinkSync(WORKSPACE_SYMLINK);
      if (target === wsPath) {
        unlinkSync(WORKSPACE_SYMLINK);
      }
    }
  } catch {
  }
}

export async function localCreateRunner(
  workspaceId: string,
  _profileId: string,
  _profileImage: string,
  gitUrl: string,
  gitRef: string,
): Promise<{ success: boolean; message: string; containerId?: string }> {
  validateGitInputs(gitUrl, gitRef);
  const wsPath = workspacePath(workspaceId);

  if (!existsSync(WORKSPACE_BASE)) {
    mkdirSync(WORKSPACE_BASE, { recursive: true });
  }

  if (!existsSync(wsPath)) {
    const cloneResult = await runCmd('git', ['clone', '--depth', '1', '--branch', gitRef, gitUrl, wsPath]);
    if (cloneResult.exitCode !== 0) {
      return { success: false, message: `Git clone failed: ${cloneResult.stderr}` };
    }
  }

  setupWorkspaceSymlink(wsPath);
  activeRunners.set(workspaceId, { startedAt: new Date().toISOString() });
  return { success: true, message: `Local runner ready at ${wsPath}`, containerId: `local-${workspaceId}` };
}

export async function localStopRunner(
  workspaceId: string,
): Promise<{ success: boolean; message: string }> {
  const wsPath = workspacePath(workspaceId);
  removeWorkspaceSymlink(wsPath);
  activeRunners.delete(workspaceId);
  return { success: true, message: `Local runner ${workspaceId} stopped` };
}

export async function localGetStatus(workspaceId: string): Promise<RunnerStatus | null> {
  const wsPath = workspacePath(workspaceId);
  const runner = activeRunners.get(workspaceId);
  if (!runner && !existsSync(wsPath)) return null;

  return {
    workspaceId,
    containerId: `local-${workspaceId}`,
    phase: runner ? 'Running' : 'Stopped',
    ready: !!runner,
    startedAt: runner?.startedAt,
    mode: 'local',
  };
}

export async function localExec(
  workspaceId: string,
  command: string,
  timeoutSec: number,
  onStdout?: (line: string) => void,
  onStderr?: (line: string) => void,
  stdin?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const wsPath = workspacePath(workspaceId);
  const start = Date.now();

  if (!activeRunners.has(workspaceId)) {
    return { exitCode: 1, stdout: '', stderr: `Runner not started for workspace ${workspaceId}. Call start first.`, durationMs: Date.now() - start };
  }

  if (!existsSync(wsPath)) {
    return { exitCode: 1, stdout: '', stderr: `Workspace directory not found: ${wsPath}. Start the runner first.`, durationMs: Date.now() - start };
  }

  setupWorkspaceSymlink(wsPath);
  const resolvedCommand = command.replace(/\/workspace/g, wsPath);

  return new Promise((resolve) => {
    const proc = spawn('bash', ['-lc', resolvedCommand], {
      cwd: wsPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: wsPath, WORKSPACE: wsPath },
    });
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
