import {
  drainCallCommandRealtimeSidebands,
  runCallCommandRealtimeRecoveryBatch,
} from '../routes/callcommand-realtime-routes.js';

export const CALLCOMMAND_RECOVERY_INTERVAL_MS = 2_000;
export const CALLCOMMAND_RECOVERY_DRAIN_MS = 30_000;
let timer: ReturnType<typeof setInterval> | undefined;
let active: Promise<void> | undefined;
let stopping = false;
let lastErrorCode: string | null = null;
let lastCompletedAt: string | null = null;

export function getCallCommandRealtimeRecoveryStatus() {
  return {started:Boolean(timer),running:Boolean(active),stopping,lastErrorCode,lastCompletedAt};
}

function cycle() {
  if(stopping || active) return;
  active=(async()=>{
    try {
      await runCallCommandRealtimeRecoveryBatch();lastErrorCode=null;
    } catch {
      lastErrorCode='CALLCOMMAND_REALTIME_RECOVERY_CYCLE_FAILED';
    } finally {lastCompletedAt=new Date().toISOString();}
  })().finally(()=>{active=undefined;});
}

/** Called only after API database readiness; no accept, redial or new call. */
export function startCallCommandRealtimeRecovery() {
  if(timer || stopping) return;
  cycle();timer=setInterval(cycle,CALLCOMMAND_RECOVERY_INTERVAL_MS);timer.unref();
}

/** Drain own scans, controller callbacks and heartbeats before pool shutdown. */
export async function stopCallCommandRealtimeRecovery() {
  stopping=true;if(timer)clearInterval(timer);timer=undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async()=>{await active;await drainCallCommandRealtimeSidebands();})(),
      new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(Object.assign(
        new Error('CallCommand recovery/controller drainage is incomplete; database pool must remain open'),
        {code:'CALLCOMMAND_REALTIME_DRAIN_INCOMPLETE'})),CALLCOMMAND_RECOVERY_DRAIN_MS);}),
    ]);
    stopping=false;
  } catch(error) {
    lastErrorCode='CALLCOMMAND_REALTIME_DRAIN_INCOMPLETE';throw error;
  } finally {if(deadline)clearTimeout(deadline);}
}
