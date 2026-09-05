import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';
import { establishParitySession } from './parity-auth';
import type { NinjaPoolOnlineRoom } from '../src/lib/auth';
import { chooseBotShot, createSeededRandom } from '../src/lib/ninja-pool-hall/bot';
import { findFreeSpot, PLAY_LEFT, TABLE_HEIGHT, TABLE_WIDTH } from '../src/lib/ninja-pool-hall/physics';
import { simulateOnlineShot } from '../src/lib/ninja-pool-hall/online';
import type { GameState, Shot, Vec2 } from '../src/lib/ninja-pool-hall/types';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001';
const exactHost = process.env.E2E_PRODUCTION_HOSTS === '1';
const WEB = exactHost ? 'https://operatorpoolhall.operatoros.net' : (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5000');
const PASSWORD = 'Phase30-Disposable-Only-9!';
const moduleUrl = (path: string) => `${WEB}${exactHost ? '' : '/modules/ninja-pool-hall'}${path}`;

async function prepareExactHost(page: Page): Promise<{ userId: string; tenantId: string; email: string }> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase30-host-${nonce}@example.com`;
  const registration = await page.request.post(`${API}/v1/auth/register`, {
    headers: {
      host: 'auth.operatoros.net',
      'x-forwarded-host': 'auth.operatoros.net',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.80.0.${10 + Math.floor(Math.random() * 200)}`,
    },
    data: { email, password: PASSWORD, name: 'Phase 30 Host' },
  });
  expect(registration.status(), await registration.text()).toBe(202);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the Phase 30 browser test');
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  let userId: string;
  let tenantId: string;
  try {
    const identity = await pg.query<{ user_id: string; tenant_id: string }>(
      `select id as user_id, current_tenant_id as tenant_id from users where email = $1 limit 1`,
      [email],
    );
    expect(identity.rows).toHaveLength(1);
    ({ user_id: userId, tenant_id: tenantId } = identity.rows[0]);
    await pg.query(
      `insert into tenant_modules (tenant_id, module_id, status, source, allow_all_members)
       select $1, id, 'enabled', 'included', true from modules where slug = 'ninja-pool-hall' and status = 'live'
       on conflict do nothing`,
      [tenantId],
    );
  } finally {
    await pg.end();
  }
  await page.goto(moduleUrl('/online'));
  await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/^https:\/\/operatorpoolhall\.operatoros\.net\/online(?:[?#].*)?$/, { timeout: 30_000 }),
    page.getByTestId('button-login').click(),
  ]);
  return { userId, tenantId, email };
}

async function prepareGuest(context: BrowserContext, tenantId: string): Promise<Page> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `phase30-guest-${nonce}@example.com`;
  const registration = await context.request.post(`${API}/v1/auth/register`, {
    ...(exactHost ? {
      headers: {
        host: 'auth.operatoros.net',
        'x-forwarded-host': 'auth.operatoros.net',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': `10.81.0.${10 + Math.floor(Math.random() * 200)}`,
      },
    } : {}),
    data: { email, password: PASSWORD, name: 'Phase 30 Guest' },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  let body: { user: { id: string } } | undefined;
  if (!exactHost) {
    const login = await context.request.post(`${API}/v1/auth/login`, { data: { email, password: PASSWORD } });
    expect(login.ok(), await login.text()).toBeTruthy();
    body = await login.json();
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the Phase 30 browser test');
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    const identity = body ?? await pg.query<{ id: string }>(`select id from users where email = $1 limit 1`, [email]);
    const userId = body?.user.id ?? ('rows' in identity ? identity.rows[0]?.id : undefined);
    expect(userId).toBeTruthy();
    await pg.query(
      `insert into tenant_users (tenant_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`,
      [tenantId, userId],
    );
    await pg.query(`update users set current_tenant_id = $1 where id = $2`, [tenantId, userId]);
  } finally {
    await pg.end();
  }
  if (!exactHost) {
    const switched = await context.request.post(`${API}/v1/tenants/${tenantId}/switch`);
    expect(switched.ok(), await switched.text()).toBeTruthy();
  }
  await context.addInitScript((id) => localStorage.setItem('activeTenantId', id), tenantId);
  const page = await context.newPage();
  if (exactHost) {
    await page.goto(moduleUrl('/join'));
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/operatorpoolhall\.operatoros\.net\/join(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
  }
  return page;
}

async function tablePointer(page: Page, point: Vec2): Promise<void> {
  const table = page.getByTestId('ninja-pool-online-table');
  const box = await table.boundingBox();
  expect(box).not.toBeNull();
  await table.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: box!.x + (point.x / TABLE_WIDTH) * box!.width,
    clientY: box!.y + (point.y / TABLE_HEIGHT) * box!.height,
    buttons: 1,
  });
}

async function readRoom(page: Page, roomId: string, tenantId: string): Promise<NinjaPoolOnlineRoom> {
  return page.evaluate(async ({ id, activeTenantId }) => {
    const response = await fetch(`/api/modules/ninja-pool-hall/rooms/${encodeURIComponent(id)}`, {
      headers: { 'X-Tenant-Id': activeTenantId },
    });
    if (!response.ok) throw new Error(`Room read failed with ${response.status}`);
    return (await response.json()).room;
  }, { id: roomId, activeTenantId: tenantId });
}

function planLegalShot(room: NinjaPoolOnlineRoom): Shot {
  const state = structuredClone(room.authoritativeState) as GameState;
  let placement: Vec2 | undefined;
  if (state.ballInHand) {
    placement = findFreeSpot(state, { x: PLAY_LEFT + 110, y: TABLE_HEIGHT / 2 });
    const cue = state.balls.find((ball) => ball.id === 0)!;
    cue.pos = placement;
    cue.inPocket = false;
  }
  const seat = state.currentPlayer;
  const base = chooseBotShot(state, createSeededRandom(3 + state.shotCount * 17 + seat));
  const shot: Shot = {
    ...base,
    power: Math.round(base.power * 100) / 100,
    ...(placement ? { cuePlacement: placement } : {}),
  };
  for (let calledPocket = 0; calledPocket < 6; calledPocket += 1) {
    const candidate = { ...shot, calledPocket };
    const simulated = simulateOnlineShot(state, candidate, room.rulesSettings);
    if (simulated.state.gameOver?.winner === seat) return candidate;
  }
  return { ...shot, calledPocket: 0 };
}

async function playPlannedShot(page: Page, room: NinjaPoolOnlineRoom, shot: Shot): Promise<void> {
  await expect(page.getByTestId('ninja-pool-online-shoot')).toBeEnabled({ timeout: 20_000 });
  await page.locator('.npho-controls input[type="range"]').first().fill(String(shot.power));
  if (shot.calledPocket !== undefined && await page.locator('.npho-controls select').count()) {
    await page.locator('.npho-controls select').selectOption(String(shot.calledPocket));
  }
  const cue = shot.cuePlacement ?? room.authoritativeState.balls.find((ball) => ball.id === 0)!.pos;
  if (shot.cuePlacement) await tablePointer(page, shot.cuePlacement);
  const dx = Math.cos(shot.angle);
  const dy = Math.sin(shot.angle);
  const xDistance = dx > 0 ? (TABLE_WIDTH - cue.x - 2) / dx : (2 - cue.x) / dx;
  const yDistance = dy > 0 ? (TABLE_HEIGHT - cue.y - 2) / dy : (2 - cue.y) / dy;
  const distance = Math.max(20, Math.min(220, xDistance, yDistance) * 0.8);
  await tablePointer(page, { x: cue.x + dx * distance, y: cue.y + dy * distance });
  await page.getByTestId('ninja-pool-online-shoot').click();
}

async function playRackShots(
  hostPage: Page,
  guestPage: Page,
  roomId: string,
  tenantId: string,
  maximumShots: number,
): Promise<NinjaPoolOnlineRoom> {
  let room = await readRoom(hostPage, roomId, tenantId);
  const targetShotCount = room.authoritativeState.shotCount + maximumShots;
  while (!room.authoritativeState.gameOver && room.authoritativeState.shotCount < targetShotCount) {
    if (room.authoritativeState.pendingChoice) {
      const chooser = room.authoritativeState.pendingChoice.chooser === 0 ? hostPage : guestPage;
      const version = room.version;
      await chooser.getByRole('button', { name: 'Accept table' }).click();
      await expect.poll(async () => (await readRoom(hostPage, roomId, tenantId)).version).toBeGreaterThan(version);
      room = await readRoom(hostPage, roomId, tenantId);
      continue;
    }
    const before = room.authoritativeState.shotCount;
    const shooter = room.authoritativeState.currentPlayer === 0 ? hostPage : guestPage;
    await playPlannedShot(shooter, room, planLegalShot(room));
    await expect.poll(async () => (await readRoom(hostPage, roomId, tenantId)).authoritativeState.shotCount, {
      timeout: 30_000,
    }).toBeGreaterThan(before);
    room = await readRoom(hostPage, roomId, tenantId);
  }
  return room;
}

test.describe('Operator Pool Hall playable browser contract (stable Phase 30 API contract)', () => {
  test.setTimeout(180_000);

  test('mobile host and guest complete verified shots, reconnect, resize, and expose the PWA shell', async ({ browser, page }) => {
    const host = exactHost ? await prepareExactHost(page) : await establishParitySession(page.request);
    await page.addInitScript((id) => localStorage.setItem('activeTenantId', id), host.tenantId);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(moduleUrl('/online'), { waitUntil: 'networkidle' });
    await expect(page.getByTestId('ninja-pool-online-lobby')).toBeVisible();
    await page.getByRole('button', { name: 'Host table' }).click();
    await expect(page.getByTestId('ninja-pool-online-room')).toBeVisible();
    const roomCode = (await page.locator('.npho-toolbar h2 b').textContent())?.trim();
    expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    const roomId = new URL(page.url()).pathname.split('/').at(-1)!;

    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guestPage = await prepareGuest(guestContext, host.tenantId);
    try {
      await guestPage.emulateMedia({ reducedMotion: 'reduce' });
      await guestPage.goto(moduleUrl('/join'), { waitUntil: 'networkidle' });
      await guestPage.getByLabel('Room code').fill(roomCode!);
      await guestPage.getByRole('button', { name: 'Join table' }).click();
      await expect(guestPage.getByTestId('ninja-pool-online-table')).toBeVisible();
      await expect(page.locator('.npho-overlay')).toHaveCount(0);

      const afterTwoShots = await playRackShots(page, guestPage, roomId, host.tenantId, 2);
      expect(afterTwoShots.authoritativeState.shotCount).toBeGreaterThanOrEqual(2);

      await guestPage.reload({ waitUntil: 'networkidle' });
      await expect(guestPage.getByTestId('ninja-pool-online-room')).toBeVisible();
      await expect(guestPage.locator('.npho-connection')).toContainText('open');

      const completed = await playRackShots(page, guestPage, roomId, host.tenantId, 78);
      expect(completed.authoritativeState.gameOver).not.toBeNull();
      expect(completed.authoritativeState.shotCount).toBeLessThanOrEqual(80);

      for (const viewport of [{ width: 844, height: 390 }, { width: 900, height: 1000 }, { width: 1440, height: 1000 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      }

      const pwa = await page.evaluate(async () => {
        const [manifestResponse, workerResponse] = await Promise.all([
          fetch('/ninja-pool-hall.webmanifest'),
          fetch('/ninja-pool-hall-sw.js'),
        ]);
        return {
          manifestStatus: manifestResponse.status,
          manifest: await manifestResponse.json(),
          workerStatus: workerResponse.status,
          worker: await workerResponse.text(),
        };
      });
      expect(pwa.manifestStatus).toBe(200);
      expect(pwa.manifest.display).toBe('standalone');
      expect(pwa.manifest.orientation).toBe('any');
      expect(pwa.workerStatus).toBe(200);
      expect(pwa.worker).toContain('Authenticated pages and API responses are never cached');
    } finally {
      await guestContext.close();
    }
  });
});
