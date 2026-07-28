import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closeDatabasePool } from '../db.js';
import { applyTradeFlowKitImport } from '../lib/tradeflowkit-import-apply.js';
import { planTradeFlowKitImport } from '../lib/tradeflowkit-import.js';

type Mode = 'dry-run' | 'apply';

function option(args: string[], name: string, required = true): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value && required) throw new Error(`Missing required option ${name}`);
  return value ?? '';
}

function mode(args: string[]): Mode {
  const modes = [args.includes('--dry-run'), args.includes('--apply')].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error('Choose exactly one mode: --dry-run or --apply');
  }
  return args.includes('--apply') ? 'apply' : 'dry-run';
}

function assertApplyGate(args: string[]): void {
  if (process.env.OPERATOROS_TRADEFLOWKIT_IMPORT_MODE !== 'apply') {
    throw new Error('OPERATOROS_TRADEFLOWKIT_IMPORT_MODE must equal apply');
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required for apply');
  if (process.env.APP_ENV === 'production') {
    if (process.env.OPERATOROS_TRADEFLOWKIT_PRODUCTION_CUTOVER !== 'approved') {
      throw new Error('OPERATOROS_TRADEFLOWKIT_PRODUCTION_CUTOVER must equal approved in production');
    }
    if (!args.includes('--confirm-production-cutover')) {
      throw new Error('--confirm-production-cutover is required in production');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const selectedMode = mode(args);
  const input = resolve(option(args, '--input'));
  const raw = JSON.parse(await readFile(input, 'utf8'));
  const plan = planTradeFlowKitImport(raw);

  if (selectedMode === 'dry-run') {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    if (!plan.readyToApply) process.exitCode = 2;
    return;
  }

  assertApplyGate(args);
  const userMapPath = option(args, '--user-map', false);
  const userMap = userMapPath
    ? JSON.parse(await readFile(resolve(userMapPath), 'utf8')) as Record<string, string>
    : undefined;
  const result = await applyTradeFlowKitImport(raw, {
    tenantId: option(args, '--tenant-id'),
    actorUserId: option(args, '--actor-user-id'),
    sourceOrgId: option(args, '--source-org-id'),
    expectedSourceFingerprint: option(args, '--expect-source-fingerprint'),
    backupReference: option(args, '--backup-reference'),
    userMap,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  console.error(`[tradeflowkit-import] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}).finally(async () => {
  await closeDatabasePool();
});
