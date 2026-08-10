import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateTradeFlowKitVisualContract } from './tradeflowkit-visual-contract.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const paths = {
  sourceCss: 'apps/modules/tradeflowkit/source/client/src/index.css',
  moduleCss: 'apps/web/src/components/module-shells/TradeFlowKitShell.module.css',
  shellSource: 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx',
  routeMapSource: 'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
  logo: 'apps/web/public/brand/tradeflowkit-logo.png',
};

const input = Object.fromEntries(await Promise.all(
  Object.entries(paths).filter(([key]) => key !== 'logo').map(async ([key, path]) => [key, await readFile(resolve(root, path), 'utf8')]),
));
const issues = validateTradeFlowKitVisualContract(input);
if (!existsSync(resolve(root, paths.logo))) issues.push({ code: 'MISSING_SOURCE_LOGO', detail: paths.logo });
const result = { schemaVersion: 1, moduleSlug: 'tradeflowkit', files: paths, failures: issues.length, issues };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (issues.length > 0) process.exitCode = 1;
