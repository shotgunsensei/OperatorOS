const UNSAFE_PATTERN = /(curl|wget|ssh|scp|sudo|docker|kubectl)/i;
const MAX_TIMEOUT_SEC = 300;
const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

export function isCommandAllowed(cmd: string): { allowed: boolean; reason?: string } {
  if (process.env.ALLOW_UNSAFE_COMMANDS === 'true') {
    return { allowed: true };
  }
  if (UNSAFE_PATTERN.test(cmd)) {
    return {
      allowed: false,
      reason: `Command matches deny-list pattern. Blocked tokens: ${cmd.match(UNSAFE_PATTERN)?.[0]}. Set ALLOW_UNSAFE_COMMANDS=true to override.`,
    };
  }
  return { allowed: true };
}

export function clampTimeout(requested?: number): number {
  if (!requested || requested <= 0) return 30;
  return Math.min(requested, MAX_TIMEOUT_SEC);
}

export function truncateOutput(
  output: string,
): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(output, 'utf-8');
  if (bytes <= MAX_OUTPUT_BYTES) {
    return { text: output, truncated: false };
  }
  const truncated = Buffer.from(output, 'utf-8').subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return { text: truncated, truncated: true };
}
