export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
}

export interface RunnerSession {
  id: string;
  userId: string;
  workspaceId: string;
  status: 'pending' | 'running' | 'stopped' | 'error';
  createdAt: string;
  lastActiveAt: string;
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
  podName: string;
  phase: string;
  ready: boolean;
  startedAt?: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
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

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'file_read',
    description: 'Read contents of a file in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
      },
      required: ['path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        encoding: { type: 'string' },
      },
    },
  },
  {
    name: 'file_write',
    description: 'Write contents to a file in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        bytesWritten: { type: 'number' },
      },
    },
  },
  {
    name: 'shell_exec',
    description: 'Execute a shell command in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['command'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
      },
    },
  },
  {
    name: 'terminal_snapshot',
    description: 'Capture current terminal output for verification',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Terminal session ID' },
        lines: { type: 'number', description: 'Number of lines to capture' },
      },
      required: ['sessionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        output: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  },
];
