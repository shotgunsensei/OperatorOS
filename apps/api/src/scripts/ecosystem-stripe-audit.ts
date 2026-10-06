import Stripe from 'stripe';
import { recurringCommercialPrices, TORQUESHED_CREDIT_CATALOG } from '@operatoros/sdk';
import { auditEcosystemStripe, ECOSYSTEM_STRIPE_EVENTS, ECOSYSTEM_STRIPE_WEBHOOK_URL } from '../lib/ecosystem-stripe-audit.js';

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  if (args.length !== 1 || !['--plan', '--validate'].includes(args[0])) throw new Error('Choose --plan or --validate (both are read-only)');
  if (args[0] === '--plan') {
    console.log(JSON.stringify({
      operation: 'plan', recurring: recurringCommercialPrices(process.env), oneTime: TORQUESHED_CREDIT_CATALOG,
      webhookUrl: ECOSYSTEM_STRIPE_WEBHOOK_URL, webhookEvents: ECOSYSTEM_STRIPE_EVENTS,
      portalEnvKey: 'STRIPE_BILLING_PORTAL_CONFIGURATION_ID',
      note: 'Prices already in use are validated by configured ID. No legacy sale is reopened; OutCall remains unavailable.',
    }, null, 2));
    return;
  }
  const mode = process.env.STRIPE_MODE;
  if (mode !== 'test' && mode !== 'live') throw new Error('STRIPE_MODE must be test or live');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !new RegExp(`^(sk|rk)_${mode}_`).test(key)) throw new Error('STRIPE_SECRET_KEY must match the explicitly selected Stripe mode');
  const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover', maxNetworkRetries: 1, timeout: 15000 });
  const report = await auditEcosystemStripe(stripe, process.env);
  console.log(JSON.stringify(report, null, 2));
  if (!report.providerConfigurationValidated) process.exitCode = 2;
}

main().catch(() => {
  // Provider exceptions can contain request headers. Print no raw provider error.
  console.error(JSON.stringify({ code: 'ECOSYSTEM_STRIPE_AUDIT_FAILED', error: 'Check the operation, Stripe mode, expected account, credentials and provider read permissions. No mutation occurred.', secretValuesIncluded: false }));
  process.exitCode = 1;
});
