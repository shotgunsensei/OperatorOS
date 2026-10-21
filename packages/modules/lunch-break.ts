/** Public links only: no SSO client, paid SKU, tenant data or session exchange. */
export {
  LUNCH_BREAK_HOST,
  LUNCH_BREAK_PATH,
  lunchBreakHostPathAllowed,
} from './lunch-break-host.mjs';

export interface LunchBreakGame {
  id: string;
  name: string;
  genre: string;
  description: string;
  url: string | null;
  status: 'module' | 'site' | 'preview' | 'planned';
  action: string;
  note: string;
}

/** Server configuration only. Never accept a destination from request parameters. */
export function safeGameUrl(value: string | undefined): string | null {
  if (!value || value.length > 2048 || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.port && url.port !== '443')
    )
      return null;
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function lunchBreakGames(
  env: Readonly<Record<string, string | undefined>> = {},
): LunchBreakGame[] {
  const configured = (key: string, fallback: string) =>
    safeGameUrl(env[key] === undefined ? fallback : env[key]);
  // These exact default sites were observed on 2026-10-21. A replacement
  // destination needs explicit readiness; false/empty flags remove the link.
  const ready = (prefix: string) =>
    env[`${prefix}_READY`] === 'true' ||
    (env[`${prefix}_READY`] === undefined && env[`${prefix}_URL`] === undefined);
  return [
    {
      id: 'pool-hall',
      name: 'Pool Hall',
      genre: 'Billiards',
      description: 'Step away from the desk. Step up to the table.',
      url: 'https://operatorpoolhall.operatoros.net/',
      status: 'module',
      action: 'Open Pool Hall',
      note: 'Sign in with your existing OperatorOS account.',
    },
    {
      id: 'scrapshift',
      name: 'Scrapshift',
      genre: 'Delivery driving',
      description: 'Build a scrappy delivery rig. Try to keep the cargo in one piece.',
      url: configured('LUNCH_BREAK_SCRAPSHIFT_URL', 'https://scrapshift.operatoros.net/'),
      status: ready('LUNCH_BREAK_SCRAPSHIFT') ? 'site' : 'planned',
      action: 'Open Scrapshift',
      note: ready('LUNCH_BREAK_SCRAPSHIFT')
        ? 'A browser demo with a garage, parts counter and delivery routes.'
        : 'Destination is not connected. Check back for a verified game link.',
    },
    {
      id: 'roaming-garden',
      name: 'Roaming Garden',
      genre: 'Gardening adventure',
      description: 'A little care. A world in bloom. Grow a garden on a gentle giant.',
      url: configured('LUNCH_BREAK_ROAMING_GARDEN_URL', 'https://roaminggarden.operatoros.net/'),
      status: ready('LUNCH_BREAK_ROAMING_GARDEN') ? 'site' : 'planned',
      action: 'Open Roaming Garden',
      note: ready('LUNCH_BREAK_ROAMING_GARDEN')
        ? 'Keyboard/mouse or controller. First visit downloads the full game; no mobile touch controls.'
        : 'Destination is not connected. Check back for a verified game link.',
    },
    {
      id: 'neon-racer',
      name: 'Neon Racer',
      genre: 'Arcade runner',
      description: 'Steer, shoot and chase the signal through a neon mainframe.',
      url: configured('LUNCH_BREAK_NEON_RACER_URL', 'https://neonracer.operatoros.net/'),
      status: ready('LUNCH_BREAK_NEON_RACER') ? 'site' : 'planned',
      action: 'Open Neon Racer',
      note: ready('LUNCH_BREAK_NEON_RACER')
        ? 'Choose Arcade, Racer or Chaos. Calm effects are available in the game.'
        : 'Destination is not connected. Check back for a verified game link.',
    },
    {
      id: 'kage',
      name: 'Kage',
      genre: '2.5D action',
      description: 'From lantern streets to the Storm Spire. Take the village back.',
      url: configured('LUNCH_BREAK_KAGE_URL', 'https://kage.operatoros.net/'),
      status: ready('LUNCH_BREAK_KAGE') ? 'site' : 'planned',
      action: 'Open Kage',
      note: ready('LUNCH_BREAK_KAGE')
        ? 'Opens the Kage-9 Rising campaign website. Check the field manual before starting.'
        : 'Destination is not connected. Check back for a verified game link.',
    },
  ];
}
