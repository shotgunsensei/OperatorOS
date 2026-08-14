import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findLegacyPaletteLiterals } from './tradeflowkit-visual-contract.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const shellDir = resolve(root, 'apps/web/src/components/module-shells');
const shellFiles = (await readdir(shellDir))
  .filter(name => /^TradeFlowKit.*\.(tsx|css)$/.test(name))
  .map(name => resolve(shellDir, name));
const files = [
  ...shellFiles,
  resolve(root, 'apps/web/src/app/public/tradeflowkit/[documentType]/[token]/page.tsx'),
];

const replacements = new Map([
  ['#34d399', 'var(--tfk-primary)'],
  ['#059669', 'var(--tfk-primary)'],
  ['#047857', 'var(--tfk-primary-hover)'],
  ['#10b981', 'var(--tfk-primary)'],
  ['#a7f3d0', 'hsl(25 95% 88%)'],
  ['#ecfdf5', 'var(--tfk-primary-soft)'],
  ['#eef8f2', 'var(--tfk-primary-soft)'],
  ['#f0fdf4', 'var(--tfk-primary-soft)'],
  ['#f3faf6', 'var(--tfk-primary-soft)'],
  ['#f4fbf7', 'var(--tfk-card)'],
  ['#f6fbf8', 'var(--tfk-card)'],
  ['#f8fcfa', 'var(--tfk-card)'],
  ['#fbfefc', 'var(--tfk-card)'],
  ['rgba(52,211,153,.10)', 'color-mix(in srgb, var(--tfk-primary) 10%, transparent)'],
  ['rgba(52, 211, 153, 0.10)', 'color-mix(in srgb, var(--tfk-primary) 10%, transparent)'],
  ['rgba(52, 211, 153, 0.18)', 'color-mix(in srgb, var(--tfk-primary) 18%, transparent)'],
  ['rgba(5,150,105,.2)', 'color-mix(in srgb, var(--tfk-primary) 20%, transparent)'],
  ['rgba(5,150,105,.14)', 'color-mix(in srgb, var(--tfk-primary) 14%, transparent)'],
  ['rgba(5,150,105,.22)', 'color-mix(in srgb, var(--tfk-primary) 22%, transparent)'],
  ['rgba(5,150,105,.24)', 'color-mix(in srgb, var(--tfk-primary) 24%, transparent)'],
  ['rgba(5,150,105,.25)', 'color-mix(in srgb, var(--tfk-primary) 25%, transparent)'],
  ['rgba(5,150,105,.28)', 'color-mix(in srgb, var(--tfk-primary) 28%, transparent)'],
  ['rgba(5,150,105,.3)', 'color-mix(in srgb, var(--tfk-primary) 30%, transparent)'],
  ['rgba(5,150,105,.35)', 'color-mix(in srgb, var(--tfk-primary) 35%, transparent)'],
  ['rgba(22,101,52,.09)', 'color-mix(in srgb, var(--tfk-primary) 9%, transparent)'],
  ['rgba(22,101,52,.1)', 'color-mix(in srgb, var(--tfk-primary) 10%, transparent)'],
  ['rgba(22,101,52,.12)', 'color-mix(in srgb, var(--tfk-primary) 12%, transparent)'],
  ['rgba(22,101,52,.13)', 'color-mix(in srgb, var(--tfk-primary) 13%, transparent)'],
  ['rgba(22,101,52,.14)', 'color-mix(in srgb, var(--tfk-primary) 14%, transparent)'],
  ['rgba(22,101,52,.16)', 'color-mix(in srgb, var(--tfk-primary) 16%, transparent)'],
  ['rgba(22,101,52,.18)', 'color-mix(in srgb, var(--tfk-primary) 18%, transparent)'],
  ['rgba(22,101,52,.2)', 'color-mix(in srgb, var(--tfk-primary) 20%, transparent)'],
  ['rgba(22,101,52,.24)', 'color-mix(in srgb, var(--tfk-primary) 24%, transparent)'],
  ['rgba(22,101,52,.25)', 'color-mix(in srgb, var(--tfk-primary) 25%, transparent)'],
  ['rgba(22, 101, 52, .16)', 'color-mix(in srgb, var(--tfk-primary) 16%, transparent)'],
  ['rgba(22, 101, 52, .2)', 'color-mix(in srgb, var(--tfk-primary) 20%, transparent)'],
  ['rgba(134,239,172,.18)', 'color-mix(in srgb, var(--tfk-primary) 18%, transparent)'],
  ['rgba(134, 239, 172, 0.16)', 'color-mix(in srgb, var(--tfk-primary) 16%, transparent)'],
  ['rgba(52, 211, 153, 0.38)', 'color-mix(in srgb, var(--tfk-primary) 38%, transparent)'],
]);

const write = process.argv.includes('--write');
const failures = [];

for (const path of files) {
  const before = await readFile(path, 'utf8');
  let after = before;
  if (write) {
    for (const [from, to] of replacements) after = after.replaceAll(from, to);
    if (after !== before) await writeFile(path, after, 'utf8');
  }
  const matches = findLegacyPaletteLiterals(after);
  if (matches.length > 0) failures.push(`${path.slice(root.length + 1)}: ${[...new Set(matches)].join(', ')}`);
}

if (failures.length > 0) {
  console.error('TradeFlowKit legacy green palette literals remain:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`TradeFlowKit palette check passed for ${files.length} owned files${write ? ' after normalization' : ''}.`);
}
