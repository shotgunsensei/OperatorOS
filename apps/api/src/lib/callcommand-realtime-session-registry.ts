export interface CallCommandRealtimeSidebandSession {
  close(): void;
  drain?(): Promise<void>;
}

const activeSidebands = new Map<string, CallCommandRealtimeSidebandSession>();
const drainingSidebands = new Set<CallCommandRealtimeSidebandSession>();
let pendingDrain: Promise<void> | undefined;

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
  if(controller.drain) drainingSidebands.add(controller);
  return () => {
    if (activeSidebands.get(callId) === controller) activeSidebands.delete(callId);
  };
}

/** Called only after a retired controller's queued callbacks/heartbeat settle. */
export function retireCallCommandRealtimeSideband(controller:CallCommandRealtimeSidebandSession):void {
  drainingSidebands.delete(controller);
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

/** Stop owned timers/callback work before the API closes its database pool. */
export async function drainCallCommandRealtimeSidebands(): Promise<void> {
  if(pendingDrain) return pendingDrain;
  const sessions = [...new Set([...activeSidebands.values(),...drainingSidebands])];
  activeSidebands.clear();
  pendingDrain=Promise.all(sessions.map(async session => {
    if (session.drain) await session.drain();
    else session.close();
    drainingSidebands.delete(session);
  })).then(()=>undefined).finally(()=>{pendingDrain=undefined;});
  return pendingDrain;
}
