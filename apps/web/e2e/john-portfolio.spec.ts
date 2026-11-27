import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Support the scoped config and the existing full local release suite.
const targetUrl = (path: string, baseURL?: string) =>
  new URL(path, baseURL ?? process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3127').href;

test('recruiter can navigate work, open evidence and obtain substantive PDFs', async ({ page, request, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(targetUrl('/john', baseURL));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('John Williams.');
  await expect(page.getByText('Senior Support Engineer at Xodus Technology Professionals')).toBeVisible();
  await page.getByRole('navigation', { name: 'Portfolio sections' }).getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page).toHaveURL(/\/john#work$/);
  await expect(page.getByRole('heading', { name: 'Practical problems. Inspectable work.' })).toBeInViewport();
  await page.getByText('Technical decisions and evidence', { exact: true }).click();
  await expect(page.getByText('Real PostgreSQL and pgvector are exercised with synthetic embedding responses.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vector test run' })).toHaveAttribute('href', 'https://github.com/shotgunsensei/OperatorOS/actions/runs/45265660607');
  await expect(page.getByRole('link', { name: 'Release evidence', exact: true })).toHaveAttribute('href', 'https://github.com/shotgunsensei/OperatorOS/actions/runs/45265660645');
  for (const filename of ['John_Williams_Systems_and_AI_Resume.pdf', 'John_Williams_AI_Engineering_Portfolio.pdf']) {
    const response = await request.get(targetUrl(`/resumes/${filename}`, baseURL));
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    const bytes = await response.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(40_000);
  }
  await page.getByRole('navigation', { name: 'Portfolio sections' }).getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page.getByRole('link', { name: 'john@shotgunninjas.com', exact: true })).toHaveAttribute('href', 'mailto:john@shotgunninjas.com');
  expect(errors).toEqual([]);
});

test('portfolio is usable at narrow widths and passes automated accessibility checks', async ({ page, baseURL }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(targetUrl('/john', baseURL));
    await expect(page.getByRole('navigation', { name: 'Portfolio sections' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const findings = await new AxeBuilder({ page }).include('[data-testid="john-portfolio"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(findings.violations).toEqual([]);
  }
});

test('keyboard disclosure controls and skip navigation work without client state', async ({ page, baseURL }) => {
  await page.goto(targetUrl('/john', baseURL));
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  const summary = page.getByText('AI usage context', { exact: true });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('I report approximately 23.7 billion lifetime tokens', { exact: false })).toBeVisible();
  await expect(page.getByText('The provider export and counting method have not yet been verified.', { exact: false })).toBeVisible();
});
