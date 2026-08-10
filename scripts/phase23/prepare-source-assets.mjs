import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const sourceLogo = resolve(root, 'apps/modules/tradeflowkit/source/attached_assets/tradeflow512_1773073035241.png');
const targetLogo = resolve(root, 'apps/web/public/brand/tradeflowkit-logo.png');
const lighthouseReport = resolve(root, 'apps/modules/tradeflowkit/source/docs/a11y/dashboard-lighthouse.report.json');
const sourceDashboard = resolve(root, 'docs/phase-23/evidence/source-dashboard-780x580.webp');

await mkdir(dirname(targetLogo), { recursive: true });
await mkdir(dirname(sourceDashboard), { recursive: true });
await copyFile(sourceLogo, targetLogo);

const report = JSON.parse(await readFile(lighthouseReport, 'utf8'));
const dataUrl = report?.fullPageScreenshot?.screenshot?.data;
if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/webp;base64,')) {
  throw new Error('The preserved Lighthouse report does not contain the expected full-page WebP screenshot.');
}
await writeFile(sourceDashboard, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));

for (const path of [targetLogo, sourceDashboard]) {
  const bytes = await readFile(path);
  console.log(`${path.slice(root.length + 1)} sha256=${createHash('sha256').update(bytes).digest('hex')}`);
}
