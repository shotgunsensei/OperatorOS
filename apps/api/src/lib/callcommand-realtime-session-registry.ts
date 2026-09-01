export interface CallCommandRealtimeSidebandSession {
  close(): void;
}

const activeSidebands = new Map<string, CallCommandRealtimeSidebandSession>();

/**
 * Best-effort same-process lifecycle registry. Database state remains the
 * authority; a provider-terminated socket also closes itself when callbacks
 * land on a different API replica.
 */
export function registerCallCommandRealtimeSideband(
  callId: string,
  controller: CallCommandRealtimeSidebandSession,
): () => void {
  const existing = activeSidebands.get(callId);
  if (existing && existing !== controller) {
    try { existing.close(); } catch { /* best-effort cleanup only */ }
  }
  activeSidebands.set(callId, controller);
  return () => {
    if (activeSidebands.get(callId) === controller) activeSidebands.delete(callId);
  };
}

export function closeCallCommandRealtimeSideband(callId: string): boolean {
  const controller = activeSidebands.get(callId);
  if (!controller) return false;
  activeSidebands.delete(callId);
  try { controller.close(); } catch { /* terminal state remains database-authoritative */ }
  return true;
}

export function hasCallCommandRealtimeSideband(callId: string): boolean {
  return activeSidebands.has(callId);
}
