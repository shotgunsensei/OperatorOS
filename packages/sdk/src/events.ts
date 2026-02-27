export type WebSocketEventType =
  | 'runner:connect'
  | 'runner:disconnect'
  | 'runner:output'
  | 'runner:error'
  | 'stream:stdout'
  | 'stream:stderr'
  | 'stream:status'
  | 'stream:exit'
  | 'task:created'
  | 'task:status'
  | 'task:step'
  | 'task:completed'
  | 'tool:call'
  | 'tool:result'
  | 'verification:start'
  | 'verification:result';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  payload: T;
  timestamp: string;
  correlationId?: string;
}

export interface RunnerConnectPayload {
  sessionId: string;
  workspaceId: string;
}

export interface RunnerOutputPayload {
  sessionId: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface StreamEventPayload {
  workspaceId: string;
  message: string;
  ts: string;
}

export interface StreamExitPayload {
  workspaceId: string;
  exitCode: number;
  durationMs: number;
}

export interface TaskStatusPayload {
  taskId: string;
  status: string;
  message?: string;
}

export interface ToolCallPayload {
  callId: string;
  taskId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolResultPayload {
  callId: string;
  taskId: string;
  output?: Record<string, unknown>;
  error?: string;
}
