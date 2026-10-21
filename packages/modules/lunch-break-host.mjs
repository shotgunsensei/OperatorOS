// Runtime-neutral public host policy, shared by Next and the Node gateway.
export const LUNCH_BREAK_HOST = 'lunchbreak.operatoros.net';
export const LUNCH_BREAK_PATH = '/lunch-break';

export function isLunchBreakHost(value) {
  if (typeof value !== 'string') return false;
  return /^lunchbreak\.operatoros\.net\.?(?::[0-9]+)?$/i.test(value.trim());
}

export function lunchBreakHostPathAllowed(method, pathname) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return (
    pathname === '/' ||
    pathname === LUNCH_BREAK_PATH ||
    pathname === '/brand/operatoros-mark.png' ||
    pathname === '/favicon.ico' ||
    /^\/lunch-break\/(?:pool-hall|kage)\.webp$/.test(pathname) ||
    /^\/lunch-break\/(?:scrapshift|roaming-garden|neon-racer)\.jpg$/.test(pathname) ||
    /^\/_next\/static\/[A-Za-z0-9_./%-]+$/.test(pathname)
  );
}
