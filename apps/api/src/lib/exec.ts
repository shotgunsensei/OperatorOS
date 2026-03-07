import { execInRunner } from '../../../runner-gateway/src/provisioner.js';
import { clampTimeout, isCommandAllowed, truncateOutput } from '../../../runner-gateway/src/safety.js';

export interface SafeExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

export async function safeWorkspaceExec(
  workspaceId: string,
  cmd: string,
  timeoutSec = 30,
  onStdout?: (line: string) => void,
  onStderr?: (line: string) => void,
  stdin?: string,
): Promise<SafeExecResult> {
  const safety = isCommandAllowed(cmd);
  if (!safety.allowed) {
    return {
      exitCode: 126,
      stdout: '',
      stderr: safety.reason ?? 'Command blocked',
      durationMs: 0,
      truncated: false,
    };
  }

  const result = await execInRunner(
    workspaceId,
    cmd,
    clampTimeout(timeoutSec),
    onStdout,
    onStderr,
    stdin,
  );

  const stdoutResult = truncateOutput(result.stdout);
  const stderrResult = truncateOutput(result.stderr);

  return {
    exitCode: result.exitCode,
    stdout: stdoutResult.text,
    stderr: stderrResult.text,
    durationMs: result.durationMs,
    truncated: stdoutResult.truncated || stderrResult.truncated,
  };
}
