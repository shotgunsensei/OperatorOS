import { execFileSync } from 'node:child_process';

const COMMIT = /^[0-9a-f]{40}$/;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sourceCommit() {
  const supplied = argument('--source-commit', '').trim().toLowerCase();
  if (supplied) return supplied;
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
}

async function json(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'OperatorOS-Phase41-Revenue-Audit/1.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json();
}

export function compareRevenueRelease(source, health, readiness) {
  const deployed = health?.release?.commit;
  const readyCommit = readiness?.release?.commit;
  const sourceValid = COMMIT.test(source ?? '');
  const deployedValid = COMMIT.test(deployed ?? '');
  const endpointsAgree = deployedValid && deployed === readyCommit;
  const matches = sourceValid && deployedValid && endpointsAgree && source === deployed;
  return {
    code: matches ? 'TORQUE_RELEASE_IDENTITY_MATCH' : 'TORQUE_RELEASE_IDENTITY_MISMATCH',
    matches,
    sourceCommit: sourceValid ? source : null,
    deployedCommit: deployedValid ? deployed : null,
    endpointsAgree,
    buildId: typeof health?.release?.buildId === 'string' ? health.release.buildId : null,
    deployedAt: typeof health?.release?.deployedAt === 'string' ? health.release.deployedAt : null,
    databaseRelease: health?.release?.databaseRelease && typeof health.release.databaseRelease === 'object'
      ? health.release.databaseRelease
      : null,
    externalDependencies: {
      stripe: readiness?.externalDependencies?.stripe ?? 'unknown',
      openai: readiness?.externalDependencies?.openai ?? 'unknown',
    },
  };
}

export async function auditTorqueShedRevenue({
  source = sourceCommit(),
  healthUrl = argument('--health-url', 'https://operatoros.net/api/health'),
  readinessUrl = argument('--readiness-url', 'https://api.operatoros.net/readyz'),
} = {}) {
  const [health, readiness] = await Promise.all([json(healthUrl), json(readinessUrl)]);
  return {
    contractVersion: 1,
    checkedAt: new Date().toISOString(),
    environment: 'deployed-read-only',
    ...compareRevenueRelease(source, health, readiness),
    limitations: [
      'No authenticated TorqueShed request was sent.',
      'No Stripe object, payment, purchase-intent row, webhook receipt, ledger row, or secret was read.',
      'Provider configured state is not catalog or settlement proof.',
    ],
  };
}

async function main() {
  try {
    const report = await auditTorqueShedRevenue();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.matches ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({
      contractVersion: 1,
      code: 'TORQUE_REVENUE_AUDIT_UNAVAILABLE',
      error: error instanceof Error ? error.message : 'Revenue audit failed',
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  await main();
}
