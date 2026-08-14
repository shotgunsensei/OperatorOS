import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import { syncFromGithub } from "./githubSync";
import app from "./app";
import { logger } from "./lib/logger";

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  try {
    logger.info('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' } as Parameters<typeof runMigrations>[0]);
    logger.info('Stripe schema ready');

    const stripeSync = await getStripeSync();

    logger.info('Setting up managed webhook...');
    const replitDomains = process.env.REPLIT_DOMAINS;
    if (!replitDomains) {
      throw new Error('REPLIT_DOMAINS environment variable is required for webhook URL');
    }
    const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info('Webhook configured');

    logger.info('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => logger.info('Stripe data synced'))
      .catch((err: Error) => logger.error({ error: err }, 'Error syncing Stripe data'));
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Stripe');
    throw error;
  }
}

const GITHUB_SYNC_INTERVAL_MS = 60 * 60 * 1000;
let syncInProgress = false;

async function runGithubSync() {
  if (syncInProgress) {
    logger.info('GitHub sync already in progress, skipping');
    return;
  }
  syncInProgress = true;
  try {
    const result = await syncFromGithub();
    logger.info({ synced: result.synced }, result.message);
  } catch (error) {
    logger.error({ error }, 'GitHub sync failed');
  } finally {
    syncInProgress = false;
  }
}

async function initGithubSync() {
  logger.info('Starting initial GitHub sync...');
  await runGithubSync();
  setInterval(runGithubSync, GITHUB_SYNC_INTERVAL_MS);
  logger.info('Periodic GitHub sync scheduled (every hour)');
}

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");

  initStripe().catch((err) => {
    logger.error({ error: err }, "Failed to initialize Stripe");
  });

  initGithubSync();
});
