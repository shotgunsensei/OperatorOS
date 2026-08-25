import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WEB = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:5000';

const MAIN_MODULES = [
  ['tradeflowkit', 'TradeFlowKit'],
  ['pulsedesk', 'PulseDesk'],
  ['techdeck', 'TechDeck'],
] as const;

const ACTIVE_COMPANIONS = [
  ['torqueshed', 'TorqueShed'],
  ['faultlinelab', 'FaultlineLab'],
  ['ninja-pool-hall', 'Operator Pool Hall'],
  ['brandforgeos', 'BrandForgeOS'],
  ['snapproofos', 'SnapProofOS'],
  ['studyforge-ai', 'StudyForge AI'],
  ['ninja-launch-kit', 'Deploy Ops'],
  ['callcommand-ai', 'CallCommand AI'],
  ['ninjamation', 'Script Ops'],
] as const;

const RETIRED_PUBLIC_NAMES = /Ninja Pool Hall|Ninja Launch Kit|Ninjamation/;

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content, `horizontal overflow at ${dimensions.viewport}px`).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

test('homepage leads with the canonical application hierarchy and complete active inventory', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  let anonymousIdentity401s = 0;
  page.on('console', (message) => {
    const expectedAnonymousIdentityProbe =
      message.type() === 'error' &&
      message.text() === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
    if (message.type() === 'error' && !expectedAnonymousIdentityProbe) {
      runtimeErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() === 401 && response.url().includes('/api/auth/me')) {
      anonymousIdentity401s += 1;
    }
  });

  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('marketing-module-grid')).toBeVisible();

  const hierarchyPrecedesOrbit = await page.evaluate(() => {
    const hierarchy = document.querySelector('[data-testid="marketing-module-grid"]');
    const orbit = document.querySelector('[data-testid="marketing-orbit"]');
    return Boolean(
      hierarchy &&
        orbit &&
        hierarchy.compareDocumentPosition(orbit) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(hierarchyPrecedesOrbit).toBe(true);

  const mainCards = page.locator('[data-application-type="main-module"]');
  await expect(mainCards).toHaveCount(3);
  for (const [index, [slug, name]] of MAIN_MODULES.entries()) {
    const card = page.getByTestId(`module-gateway-card-${slug}`);
    await expect(card).toHaveAttribute('data-application-type', 'main-module');
    await expect(card).toContainText(name);
    await expect(mainCards.nth(index)).toContainText(name);
    await expect(card).toContainText('Main Module');
  }

  for (const [slug, name] of ACTIVE_COMPANIONS) {
    const card = page.getByTestId(`module-gateway-card-${slug}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-application-type', 'companion-application');
    await expect(card).toContainText(name);
    await expect(card).toContainText('Companion Application');
  }

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(RETIRED_PUBLIC_NAMES);
  expect(anonymousIdentity401s).toBeGreaterThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

test('ecosystem page orders and labels main modules before companion applications', async ({ page }) => {
  await page.goto(`${WEB}/ecosystem`, { waitUntil: 'domcontentloaded' });

  const mainSection = page.getByTestId('ecosystem-section-main-modules');
  const companionSection = page.getByTestId('ecosystem-section-companion-applications');
  await expect(mainSection).toBeVisible();
  await expect(companionSection).toBeVisible();
  expect((await mainSection.boundingBox())!.y).toBeLessThan((await companionSection.boundingBox())!.y);

  for (const [slug, name] of MAIN_MODULES) {
    const card = page.getByTestId(`ecosystem-card-${slug}`);
    await expect(card).toContainText(name);
    await expect(card).toContainText('Main Module');
  }
  for (const [slug, name] of ACTIVE_COMPANIONS) {
    const card = page.getByTestId(`ecosystem-card-${slug}`);
    await expect(card).toContainText(name);
    await expect(card).toContainText('Companion Application');
  }

  await expect(page.getByTestId('ecosystem-launch-ninja-pool-hall')).toHaveAttribute(
    'href',
    'https://operatorpoolhall.operatoros.net',
  );
  await expect(page.getByTestId('ecosystem-launch-ninja-launch-kit')).toHaveAttribute(
    'href',
    'https://deployops.operatoros.net',
  );
  await expect(page.getByTestId('ecosystem-launch-ninjamation')).toHaveAttribute(
    'href',
    'https://scriptops.operatoros.net',
  );

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(RETIRED_PUBLIC_NAMES);
  expect(bodyText).not.toMatch(/Ecosystem module/i);
});

test('marketing footer exposes exactly the three main modules and linked parent attribution', async ({
  page,
}) => {
  await page.goto(`${WEB}/modules`, { waitUntil: 'domcontentloaded' });
  const footer = page.getByTestId('marketing-footer');
  const moduleLinks = footer.getByTestId('footer-column-modules').locator('a');
  expect(await moduleLinks.allTextContents()).toEqual(['TradeFlowKit', 'PulseDesk', 'TechDeck']);
  await expect(footer.getByTestId('footer-attribution').getByRole('link')).toHaveAttribute(
    'href',
    'https://shotgunninjas.com',
  );
});

test('renamed public acquisitions publish new metadata and accessible rendered identities', async ({
  page,
}) => {
  const surfaces = [
    {
      path: '/public/ninja-launch-kit/home',
      name: 'Deploy Ops',
      canonical: 'https://deployops.operatoros.net',
    },
    {
      path: '/public/ninjamation/home',
      name: 'Script Ops',
      canonical: 'https://scriptops.operatoros.net',
    },
  ];

  for (const surface of surfaces) {
    await page.goto(`${WEB}${surface.path}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(new RegExp(surface.name));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', surface.canonical);
    await expect(page.locator('body')).toContainText(surface.name);
    expect(await page.locator('body').innerText()).not.toMatch(RETIRED_PUBLIC_NAMES);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  }
});

test('refactored marketing surfaces reflow without horizontal clipping', async ({ page }) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  const paths = ['/', '/ecosystem', '/public/ninja-launch-kit/home', '/public/ninjamation/home'];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of paths) {
      await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  }
});
