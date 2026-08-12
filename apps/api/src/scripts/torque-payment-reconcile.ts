import { closeDatabasePool } from '../db.js';
import { reconcileTorquePayment } from '../lib/operatoros-token-reconciliation.js';

const args = process.argv.slice(2);
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const paymentIntentId = value('--payment-intent') || '';
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run') || !apply;

if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId) || (apply && dryRun && args.includes('--dry-run'))) {
  console.error('Usage: pnpm billing:reconcile:torque -- --payment-intent pi_... --dry-run');
  process.exitCode = 2;
} else if (apply && process.env.BILLING_RECONCILIATION_LIVE_APPLY !== paymentIntentId) {
  console.error('Live apply blocked: BILLING_RECONCILIATION_LIVE_APPLY must exactly equal the PaymentIntent id.');
  process.exitCode = 2;
} else {
  try {
    const report = await reconcileTorquePayment({ paymentIntentId, apply });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.checks.failures.length) process.exitCode = 3;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as any).code)
      : 'TORQUE_RECONCILIATION_FAILED';
    process.stderr.write(`${JSON.stringify({
      schema: 'operatoros.torque-payment-reconciliation.v1', paymentIntentId,
      mode: apply ? 'apply' : 'dry-run', applied: false, blocked: true, code,
    }, null, 2)}\n`);
    process.exitCode = 3;
  } finally {
    await closeDatabasePool();
  }
}
