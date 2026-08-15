const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key|raw[_-]?(?:body|payload)|session|credential|ssn|recording|transcript|phi)/i;
const UNSAFE_OBJECT_KEY = /^(?:__proto__|prototype|constructor)$/i;

function boundedString(value: string, max = 500): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Keep shared timeline/job/webhook metadata useful without turning it into a
 * second payload or secret store. Sensitive keys are removed recursively and
 * collection sizes are bounded.
 */
export function sanitizeSharedMetadata(
  value: unknown,
  depth = 0,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return {};
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    const key = boundedString(rawKey, 80);
    if (SENSITIVE_KEY.test(key) || UNSAFE_OBJECT_KEY.test(key)) continue;
    if (rawValue === null || typeof rawValue === 'boolean' || typeof rawValue === 'number') {
      result[key] = rawValue;
    } else if (typeof rawValue === 'string') {
      result[key] = boundedString(rawValue);
    } else if (Array.isArray(rawValue)) {
      result[key] = rawValue.slice(0, 20).map(item => {
        if (item === null || typeof item === 'boolean' || typeof item === 'number') return item;
        if (typeof item === 'string') return boundedString(item);
        return sanitizeSharedMetadata(item, depth + 1);
      });
    } else if (typeof rawValue === 'object') {
      result[key] = sanitizeSharedMetadata(rawValue, depth + 1);
    }
  }
  return result;
}

/**
 * Idempotent API replays must preserve the original public response shape.
 * Keep bounded response content and serialize dates while applying the same
 * secret-key denylist. A numeric tokenCount is usage telemetry, not a bearer
 * token or credential.
 */
export function sanitizeIdempotencyResponse(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return boundedString(value, 60_000);
  if (value instanceof Date) return value.toISOString();
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeIdempotencyResponse(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return null;
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 120)) {
    const key = boundedString(rawKey, 80);
    const numericTokenCount = /^tokenCount$/i.test(key) && typeof rawValue === 'number';
    if ((!numericTokenCount && SENSITIVE_KEY.test(key)) || UNSAFE_OBJECT_KEY.test(key)) continue;
    result[key] = sanitizeIdempotencyResponse(rawValue, depth + 1);
  }
  return result;
}

export function safeFailureCode(error: unknown, fallback = 'UNEXPECTED_ERROR'): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (/^[A-Z0-9_:-]{2,120}$/.test(code)) return code;
  }
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(error.name)) {
    return error.name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  }
  return fallback;
}

export function boundedRetryDelayMs(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(20, Math.floor(attempt)));
  return Math.min(60 * 60 * 1000, 5_000 * (2 ** (boundedAttempt - 1)));
}

export function isOperatorOSTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test';
}

/**
 * Production-artifact acceptance may use deterministic AI/payment adapters,
 * but only inside CI against a database explicitly declared disposable. The
 * three-part gate prevents a lone production environment variable from ever
 * activating test provider behavior in a deployed runtime.
 */
export function isOperatorOSDeterministicProviderTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === 'test' || env.APP_ENV === 'test' || (
    env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE === '1'
    && env.PARITY_DATABASE_IS_DISPOSABLE === '1'
    && env.CI === 'true'
  );
}
