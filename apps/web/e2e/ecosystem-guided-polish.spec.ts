import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { establishParitySession } from './parity-auth';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';
const artifacts = resolve(process.cwd(), '../../build/ecosystem-polish');
const modules = [
  ['torqueshed', 'TorqueShed', 'Garage totals'],
  ['faultlinelab', 'FaultlineLab', 'Training progress'],
  ['ninja-pool-hall', 'Operator Pool Hall', 'Your match record'],
  ['brandforgeos', 'BrandForgeOS', 'Creative workspace totals'],
  ['snapproofos', 'SnapProofOS', 'Proof and job totals'],
  ['studyforge-ai', 'StudyForge AI', 'Study plan and deliverables'],
  ['ninja-launch-kit', 'Deploy Ops', 'Campaign package details'],
  ['callcommand-ai', 'CallCommand AI', 'Call operations totals'],
  ['ninjamation', 'Script Ops', 'Script library totals'],
] as const;

for (const [slug, name, section] of modules) {
  test(`${name}: authenticated local workflow navigation and responsive dashboard`, async ({ page }) => {
    await establishParitySession(page.request);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(WEB).origin ? route.continue() : route.abort());
    mkdirSync(artifacts, { recursive: true });
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${WEB}/modules/${slug}/dashboard`);
      const journey = page.getByTestId(`${slug}-workflow-journey`);
      await expect(journey).toBeVisible();
      await expect(journey.getByRole('link').first()).toHaveAttribute('href', new RegExp(`^/modules/${slug}/`));
      const summary = page.locator('summary').filter({ hasText: section });
      // CallCommand's new setup may precede the operational dashboard until
      // this disposable tenant has completed its existing setup requirements.
      if (slug !== 'callcommand-ai') {
        await expect(summary).toBeVisible();
        await expect(summary.locator('..')).not.toHaveAttribute('open');
        await summary.focus(); await page.keyboard.press('Enter');
        await expect(summary.locator('..')).toHaveAttribute('open', '');
        await page.keyboard.press('Enter');
      }
      const audit = await new AxeBuilder({ page }).include(`[data-testid="${slug === 'studyforge-ai' ? 'studyforge' : slug === 'callcommand-ai' ? 'callcommand' : slug === 'ninja-launch-kit' ? 'launchkit' : slug}-module-shell"]`).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect.soft(audit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByTestId(`${slug}-workflow-journey`).locator('p').click();
      await page.screenshot({ path: resolve(artifacts, `${slug}-${width}.png`), fullPage: true });
      if (width === 390) {
        const trigger = page.getByRole('button', { name: `Open ${name} navigation`, exact: true });
        await trigger.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
    }
    expect(errors).toEqual([]);
  });
}

test('OutCall: existing unavailable boundary remains visible and does not offer activation', async ({ page }) => {
  await establishParitySession(page.request);
  await page.goto(`${WEB}/modules/outcall/dashboard`);
  await expect(page.getByRole('heading', { name: 'OutCall is not available right now.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to My Apps' })).toBeVisible();
  await expect(page.getByTestId('outcall-workflow-journey')).toHaveCount(0);
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, 'outcall-availability.png'), fullPage: true });
});
