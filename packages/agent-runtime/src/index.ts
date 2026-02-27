import type { AgentTask, TaskStep, VerificationResult, VerificationCheck, TaskResult } from '@veridian/sdk';

export interface TaskLoopConfig {
  maxRetries: number;
  verificationRequired: boolean;
  timeoutMs: number;
}

const DEFAULT_CONFIG: TaskLoopConfig = {
  maxRetries: 3,
  verificationRequired: true,
  timeoutMs: 300_000,
};

export type StepExecutor = (step: TaskStep) => Promise<TaskStep>;
export type StepVerifier = (step: TaskStep) => Promise<VerificationResult>;
export type TaskPlanner = (prompt: string) => Promise<TaskStep[]>;

export class AgentTaskLoop {
  private config: TaskLoopConfig;
  private planner: TaskPlanner;
  private executor: StepExecutor;
  private verifier: StepVerifier;
  private abortController: AbortController | null = null;

  constructor(
    planner: TaskPlanner,
    executor: StepExecutor,
    verifier: StepVerifier,
    config: Partial<TaskLoopConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.planner = planner;
    this.executor = executor;
    this.verifier = verifier;
  }

  async run(task: AgentTask): Promise<TaskResult> {
    this.abortController = new AbortController();

    try {
      task.status = 'planning';
      task.plan = await this.planner(task.prompt);
      task.status = 'executing';

      for (const step of task.plan) {
        if (this.abortController.signal.aborted) {
          step.status = 'skipped';
          continue;
        }

        let attempts = 0;
        let stepPassed = false;

        while (attempts < this.config.maxRetries && !stepPassed) {
          attempts++;
          step.status = 'running';

          const executedStep = await this.executor(step);
          Object.assign(step, executedStep);

          if (step.status === 'failed') {
            if (attempts >= this.config.maxRetries) break;
            continue;
          }

          if (this.config.verificationRequired) {
            task.status = 'verifying';
            const verification = await this.verifier(step);
            step.verificationResult = verification;

            if (verification.passed) {
              step.status = 'completed';
              stepPassed = true;
            } else if (attempts >= this.config.maxRetries) {
              step.status = 'failed';
            }
          } else {
            step.status = 'completed';
            stepPassed = true;
          }
        }

        if (step.status === 'failed') {
          task.status = 'failed';
          return this.buildResult(task, false);
        }
      }

      task.status = 'completed';
      return this.buildResult(task, true);
    } catch (error) {
      task.status = 'failed';
      return this.buildResult(task, false, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  private buildResult(task: AgentTask, success: boolean, errorMessage?: string): TaskResult {
    const steps = task.plan ?? [];
    const completedSteps = steps.filter((s) => s.status === 'completed');
    const allVerified = completedSteps.every((s) =>
      s.verificationResult ? s.verificationResult.passed : true,
    );

    return {
      success,
      summary: errorMessage
        ? `Task failed: ${errorMessage}`
        : `Completed ${completedSteps.length}/${steps.length} steps`,
      artifacts: [],
      verificationPassed: allVerified,
    };
  }
}

export function createNoopVerifier(): StepVerifier {
  return async (_step: TaskStep): Promise<VerificationResult> => ({
    passed: true,
    checks: [
      {
        name: 'noop',
        passed: true,
        message: 'No verification configured',
        severity: 'info',
      },
    ],
    summary: 'Verification skipped (noop)',
  });
}

export function createChecklistVerifier(
  checkFns: Array<(step: TaskStep) => Promise<VerificationCheck>>,
): StepVerifier {
  return async (step: TaskStep): Promise<VerificationResult> => {
    const checks = await Promise.all(checkFns.map((fn) => fn(step)));
    const passed = checks.every((c) => c.severity !== 'error' || c.passed);
    return {
      passed,
      checks,
      summary: passed
        ? `All ${checks.length} checks passed`
        : `${checks.filter((c) => !c.passed).length} check(s) failed`,
    };
  };
}
