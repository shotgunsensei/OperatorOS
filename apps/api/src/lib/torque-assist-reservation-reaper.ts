import { expireTorqueAssistReservations } from './torque-assist-service.js';

const REAPER_INTERVAL_MS = 30_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

async function runReservationReaper(label: 'boot' | 'interval'): Promise<void> {
  if (running) return;
  running = true;
  try {
    let total = 0;
    for (;;) {
      const batch = await expireTorqueAssistReservations({ limit: 100 });
      total += batch.expiredCount;
      if (batch.expiredCount < 100) break;
    }
    if (total > 0) {
      console.info(`[torque-assist-reservations] ${label}: expired ${total} abandoned reservation(s)`);
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? 'REAPER_FAILED').slice(0, 120)
      : 'REAPER_FAILED';
    console.warn(`[torque-assist-reservations] ${label}: ${code}`);
  } finally {
    running = false;
  }
}

export function startTorqueAssistReservationReaper(): void {
  if (timer) return;
  void runReservationReaper('boot');
  timer = setInterval(() => { void runReservationReaper('interval'); }, REAPER_INTERVAL_MS);
  timer.unref?.();
}

export function stopTorqueAssistReservationReaper(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
