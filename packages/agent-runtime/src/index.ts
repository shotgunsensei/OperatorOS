export interface TaskRunnerConfig {
  apiBaseUrl: string;
  maxRetries: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: TaskRunnerConfig = {
  apiBaseUrl: 'http://localhost:5000',
  maxRetries: 1,
  timeoutMs: 300_000,
};

export interface TaskRunResult {
  taskId: string;
  status: 'succeeded' | 'failed';
  summary: string;
  checkResults: Record<string, { passed: boolean; output: string }>;
  events: TaskRunEvent[];
}

export interface TaskRunEvent {
  type: string;
  ts: string;
  payload: Record<string, unknown>;
}

export class DeterministicTaskRunner {
  private config: TaskRunnerConfig;

  constructor(config: Partial<TaskRunnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async run(taskId: string): Promise<TaskRunResult> {
    const events: TaskRunEvent[] = [];
    const emit = (type: string, payload: Record<string, unknown> = {}) => {
      events.push({ type, ts: new Date().toISOString(), payload });
    };

    try {
      emit('PLAN', { message: 'Starting deterministic verification task' });

      const runResp = await fetch(`${this.config.apiBaseUrl}/v1/tasks/${taskId}/run`, { method: 'POST' });
      if (!runResp.ok) {
        emit('ERROR', { message: `Failed to start task: ${runResp.status}` });
        return {
          taskId,
          status: 'failed',
          summary: 'Failed to start task run',
          checkResults: {},
          events,
        };
      }

      emit('COMMAND', { message: 'Task run initiated, polling for completion' });

      let task: any = null;
      const deadline = Date.now() + this.config.timeoutMs;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const taskResp = await fetch(`${this.config.apiBaseUrl}/v1/tasks/${taskId}`);
        task = await taskResp.json();

        if (task.status === 'succeeded' || task.status === 'failed') {
          break;
        }
        emit('VERIFY', { message: `Task status: ${task.status}` });
      }

      if (!task || (task.status !== 'succeeded' && task.status !== 'failed')) {
        emit('ERROR', { message: 'Task timed out' });
        return { taskId, status: 'failed', summary: 'Task timed out', checkResults: {}, events };
      }

      emit('DONE', { status: task.status, summary: task.resultSummary });

      return {
        taskId,
        status: task.status,
        summary: task.resultSummary || '',
        checkResults: task.checkResults || {},
        events,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      emit('ERROR', { error: errMsg });
      return { taskId, status: 'failed', summary: `Error: ${errMsg}`, checkResults: {}, events };
    }
  }
}
