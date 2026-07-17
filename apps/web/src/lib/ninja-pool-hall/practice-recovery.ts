export interface PracticeSessionSummary {
  id: string;
  status: 'active' | 'completed' | 'abandoned';
  shots: number;
  objectBallsPocketed: number;
  scratches: number;
  version: number;
}

export interface PendingPracticeProgress {
  expectedVersion: number;
  shots: number;
  objectBallsPocketed: number;
  scratches: number;
}

export type PracticeReconciliation<TSession extends PracticeSessionSummary> =
  | { kind: 'committed'; session: TSession }
  | { kind: 'server-state'; session: TSession }
  | { kind: 'missing' };

/**
 * Reconciles an uncertain local save against a tenant/user-scoped server
 * summary. Exact counter and version matching is required before treating a
 * lost response as committed; any other server state needs a clean recovery
 * because ball coordinates intentionally never leave the browser.
 */
export function reconcilePracticeProgress<TSession extends PracticeSessionSummary>(
  sessionId: string,
  pending: PendingPracticeProgress,
  serverSessions: readonly TSession[],
): PracticeReconciliation<TSession> {
  const current = serverSessions.find((candidate) => candidate.id === sessionId);
  if (!current) return { kind: 'missing' };

  const expectedStatus = pending.objectBallsPocketed === 15 ? 'completed' : 'active';
  const exactLostResponse = current.version === pending.expectedVersion + 1
    && current.status === expectedStatus
    && current.shots === pending.shots
    && current.objectBallsPocketed === pending.objectBallsPocketed
    && current.scratches === pending.scratches;

  return exactLostResponse
    ? { kind: 'committed', session: current }
    : { kind: 'server-state', session: current };
}

export function findActivePracticeSummary<TSession extends PracticeSessionSummary>(
  serverSessions: readonly TSession[],
): TSession | null {
  return serverSessions.find((candidate) => candidate.status === 'active') ?? null;
}
