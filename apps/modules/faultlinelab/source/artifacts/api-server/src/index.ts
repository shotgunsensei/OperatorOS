import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from "./stripeClient";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureE2EAuthTokenInDev } from "./lib/e2eAuthToken";
import { startCrossPromoRetentionJob } from "./lib/crossPromoRetention";
import { startSubscriptionRenewalNoticeJob } from "./lib/subscriptionRenewalNotices";

ensureE2EAuthTokenInDev();

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set, skipping Stripe init');
    return;
  }

  try {
    logger.info('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    logger.info('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN}`;
    await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    logger.info('Webhook configured');

    stripeSync.syncBackfill()
      .then(() => logger.info('Stripe data synced'))
      .catch((err: any) => logger.error({ err }, 'Error syncing Stripe data'));
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Stripe (non-fatal)');
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initStripe();

startCrossPromoRetentionJob();
startSubscriptionRenewalNoticeJob();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
