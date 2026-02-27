import { spawn } from 'child_process';
import type { RunnerStatus } from '../../../packages/sdk/src/index.js';
import {
  dockerCreateRunner,
  dockerStopRunner,
  dockerGetStatus,
  dockerExec,
} from './docker-provider.js';
import {
  localCreateRunner,
  localStopRunner,
  localGetStatus,
  localExec,
} from './local-provider.js';

function detectRunnerMode(): 'k8s' | 'docker' | 'local' {
  const env = process.env.RUNNER_MODE;
  if (env === 'k8s' || env === 'docker' || env === 'local') return env;
  return 'local';
}

const RUNNER_MODE = detectRunnerMode();
const NAMESPACE = 'veridian-runners';
const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-/]+$/;
const SAFE_URL_PATTERN = /^https?:\/\/[a-zA-Z0-9._\-/:@]+$/;

function sanitizeGitRef(ref: string): string {
  if (!SAFE_REF_PATTERN.test(ref)) throw new Error(`Invalid git ref: ${ref}`);
  return ref;
}

function sanitizeGitUrl(url: string): string {
  if (!SAFE_URL_PATTERN.test(url)) throw new Error(`Invalid git URL: ${url}`);
  return url;
}

function kubectl(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('kubectl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
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

function applyManifest(json: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('kubectl', ['apply', '-f', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
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
    proc.stdin.write(json);
    proc.stdin.end();
  });
}

function podName(workspaceId: string): string {
  return `ws-${workspaceId}`;
}

function pvcName(workspaceId: string): string {
  return `ws-${workspaceId}`;
}

async function k8sCreateRunner(
  workspaceId: string,
  _profileId: string,
  profileImage: string,
  gitUrl: string,
  gitRef: string,
): Promise<{ success: boolean; message: string }> {
  const safeUrl = sanitizeGitUrl(gitUrl);
  const safeRef = sanitizeGitRef(gitRef);
  const pvc = pvcName(workspaceId);
  const pod = podName(workspaceId);

  const pvcManifest = JSON.stringify({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: pvc, namespace: NAMESPACE, labels: { 'operatoros.dev/workspace': workspaceId } },
    spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '1Gi' } } },
  });

  const pvcApply = await applyManifest(pvcManifest);
  if (pvcApply.exitCode !== 0 && !pvcApply.stderr.includes('already exists')) {
    return { success: false, message: `PVC creation failed: ${pvcApply.stderr}` };
  }

  const podManifest = JSON.stringify({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: pod,
      namespace: NAMESPACE,
      labels: { 'operatoros.dev/workspace': workspaceId, 'operatoros.dev/component': 'runner' },
    },
    spec: {
      restartPolicy: 'Never',
      initContainers: [{
        name: 'git-clone',
        image: 'alpine/git:latest',
        command: ['sh', '-c', `set -e; if [ -z "$(ls -A /workspace)" ]; then git clone --depth 1 --branch '${safeRef}' '${safeUrl}' /workspace; else echo "skipping clone"; fi`],
        volumeMounts: [{ name: 'workspace-vol', mountPath: '/workspace' }],
      }],
      containers: [{
        name: 'runner',
        image: profileImage,
        command: ['sleep', 'infinity'],
        workingDir: '/workspace',
        volumeMounts: [{ name: 'workspace-vol', mountPath: '/workspace' }],
        resources: { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '1', memory: '1Gi' } },
      }],
      volumes: [{ name: 'workspace-vol', persistentVolumeClaim: { claimName: pvc } }],
    },
  });

  const podApply = await applyManifest(podManifest);
  if (podApply.exitCode !== 0 && !podApply.stderr.includes('already exists')) {
    return { success: false, message: `Pod creation failed: ${podApply.stderr}` };
  }

  return { success: true, message: `Runner ${pod} created in ${NAMESPACE}` };
}

async function k8sStopRunner(workspaceId: string): Promise<{ success: boolean; message: string }> {
  const pod = podName(workspaceId);
  const result = await kubectl(['delete', 'pod', pod, '--namespace', NAMESPACE, '--ignore-not-found=true', '--grace-period=10']);
  if (result.exitCode !== 0) {
    return { success: false, message: `Failed to stop runner: ${result.stderr}` };
  }
  return { success: true, message: `Runner ${pod} stopped` };
}

async function k8sGetStatus(workspaceId: string): Promise<RunnerStatus | null> {
  const pod = podName(workspaceId);
  const result = await kubectl(['get', 'pod', pod, '--namespace', NAMESPACE, '-o', 'json']);
  if (result.exitCode !== 0) return null;

  try {
    const podObj = JSON.parse(result.stdout);
    const phase = podObj.status?.phase ?? 'Unknown';
    const conditions = podObj.status?.conditions ?? [];
    const ready = conditions.some((c: { type: string; status: string }) => c.type === 'Ready' && c.status === 'True');
    return { workspaceId, podName: pod, phase, ready, startedAt: podObj.status?.startTime, mode: 'k8s' };
  } catch {
    return null;
  }
}

async function k8sExec(
  workspaceId: string,
  command: string,
  timeoutSec: number,
  onStdout?: (line: string) => void,
  onStderr?: (line: string) => void,
  stdin?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const pod = podName(workspaceId);
  const start = Date.now();

  return new Promise((resolve) => {
    const args = ['exec'];
    if (stdin) args.push('-i');
    args.push(pod, '--namespace', NAMESPACE, '--container', 'runner', '--', 'bash', '-lc', command);

    const proc = spawn('kubectl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
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

export function getRunnerMode(): 'k8s' | 'docker' | 'local' {
  return RUNNER_MODE;
}

export async function createWorkspaceRunner(
  workspaceId: string,
  profileId: string,
  profileImage: string,
  gitUrl: string,
  gitRef: string,
): Promise<{ success: boolean; message: string; containerId?: string }> {
  if (RUNNER_MODE === 'local') {
    return localCreateRunner(workspaceId, profileId, profileImage, gitUrl, gitRef);
  }
  if (RUNNER_MODE === 'docker') {
    return dockerCreateRunner(workspaceId, profileId, profileImage, gitUrl, gitRef);
  }
  return k8sCreateRunner(workspaceId, profileId, profileImage, gitUrl, gitRef);
}

export async function stopWorkspaceRunner(
  workspaceId: string,
): Promise<{ success: boolean; message: string }> {
  if (RUNNER_MODE === 'local') {
    return localStopRunner(workspaceId);
  }
  if (RUNNER_MODE === 'docker') {
    return dockerStopRunner(workspaceId);
  }
  return k8sStopRunner(workspaceId);
}

export async function getWorkspaceRunnerStatus(
  workspaceId: string,
): Promise<RunnerStatus | null> {
  if (RUNNER_MODE === 'local') {
    return localGetStatus(workspaceId);
  }
  if (RUNNER_MODE === 'docker') {
    return dockerGetStatus(workspaceId);
  }
  return k8sGetStatus(workspaceId);
}

export async function execInRunner(
  workspaceId: string,
  command: string,
  timeoutSec: number,
  onStdout?: (line: string) => void,
  onStderr?: (line: string) => void,
  stdin?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  if (RUNNER_MODE === 'local') {
    return localExec(workspaceId, command, timeoutSec, onStdout, onStderr, stdin);
  }
  if (RUNNER_MODE === 'docker') {
    return dockerExec(workspaceId, command, timeoutSec, onStdout, onStderr, stdin);
  }
  return k8sExec(workspaceId, command, timeoutSec, onStdout, onStderr, stdin);
}
