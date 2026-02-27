export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
}

export interface Workspace {
  id: string;
  gitUrl: string;
  gitRef: string;
  profileId: string;
  status: 'pending' | 'provisioning' | 'running' | 'stopped' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceRequest {
  gitUrl: string;
  gitRef: string;
  profileId: string;
}

export interface ExecRequest {
  workspaceId: string;
  cmd: string;
  timeoutSec?: number;
  stdin?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated?: boolean;
}

export interface RunnerStatus {
  workspaceId: string;
  podName?: string;
  containerId?: string;
  phase: string;
  ready: boolean;
  startedAt?: string;
  mode: 'k8s' | 'docker';
}

export interface ApplyPatchRequest {
  diff: string;
}

export interface ApplyPatchResult {
  success: boolean;
  changedFiles: string[];
  gitStatus: string;
  error?: string;
}

export interface VerifyResult {
  checks: VerifyCheckResult[];
  allPassed: boolean;
}

export interface VerifyCheckResult {
  name: string;
  label: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  skipped?: boolean;
}

export interface CreateTaskRequest {
  workspaceId: string;
  title: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  requiredChecks: string[] | null;
  checkResults: Record<string, { passed: boolean; output: string }> | null;
  resultSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  ts: string;
  type: string;
  payload: Record<string, unknown> | null;
}

export interface ToolTrace {
  id: string;
  taskId: string;
  ts: string;
  toolName: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  success: boolean | null;
  durationMs: number | null;
}

export interface AgentTask {
  id: string;
  sessionId: string;
  prompt: string;
  status: 'queued' | 'planning' | 'executing' | 'verifying' | 'completed' | 'failed';
  plan?: TaskStep[];
  result?: TaskResult;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStep {
  id: string;
  description: string;
  toolCalls: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  verificationResult?: VerificationResult;
}

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
  summary: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface TaskResult {
  success: boolean;
  summary: string;
  artifacts: string[];
  verificationPassed: boolean;
}

export const PATCH_DENY_PATTERNS = [
  /^\.env/,
  /\.pem$/,
  /\.key$/,
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^\.git\//,
];

export const MAX_PATCH_SIZE = 20 * 1024;

export function validatePatchPaths(diff: string): { valid: boolean; deniedPaths: string[] } {
  const denied: string[] = [];
  const pathRegex = /^(?:\+\+\+|---)\s+[ab]\/(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(diff)) !== null) {
    const filePath = match[1];
    if (filePath === '/dev/null') continue;
    for (const pattern of PATCH_DENY_PATTERNS) {
      if (pattern.test(filePath)) {
        denied.push(filePath);
        break;
      }
    }
  }
  return { valid: denied.length === 0, deniedPaths: denied };
}
