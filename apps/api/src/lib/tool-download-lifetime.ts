import type { ServerResponse } from 'node:http';

let outstanding = 0;
/** Hold a memory reservation until both handler validation and the HTTP reply end. */
export function reserveToolDownload(raw: Pick<ServerResponse, 'once' | 'destroyed' | 'writableFinished'>): (() => void) | null {
  if (outstanding >= 2) return null;
  outstanding++;
  let settled = false, ended = raw.destroyed || raw.writableFinished, released = false;
  const release = () => { if (!released && settled && ended) { released = true; outstanding--; } };
  const end = () => { ended = true; release(); };
  raw.once('finish', end); raw.once('close', end);
  return () => { settled = true; release(); };
}
