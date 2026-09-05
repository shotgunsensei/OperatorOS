import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { launchFixPostSeed } from './launch-fix-init.js';

/**
 * Release v60: atomically freeze legacy application access and create the
 * tenant-owned application-stack billing authority.
 *
 * The column-existence test is the one-shot migration marker. Existing
 * active/trialing rows are grandfathered only when the column is introduced;
 * reapplying v60 never marks subscriptions created after the cutover.
 */
export async function ensureForwardCommerceContract(): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='subscriptions'
            AND column_name='legacy_access_grandfathered_at'
        ) THEN
          ALTER TABLE subscriptions ADD COLUMN legacy_access_grandfathered_at TIMESTAMPTZ;
          UPDATE subscriptions
            SET legacy_access_grandfathered_at = clock_timestamp()
            WHERE status IN ('active','trialing');
        END IF;
      END
      $$;

      CREATE INDEX IF NOT EXISTS idx_subscriptions_legacy_access
        ON subscriptions(legacy_access_grandfathered_at)
        WHERE legacy_access_grandfathered_at IS NOT NULL;

      CREATE TABLE IF NOT EXISTS tenant_application_subscriptions (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        initiated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        core_product TEXT NOT NULL,
        included_companion_key TEXT NOT NULL,
        additional_module_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
        additional_seats INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'incomplete',
        stripe_customer_id TEXT NOT NULL,
        stripe_checkout_session_id TEXT,
        stripe_subscription_id TEXT,
        core_price_id TEXT NOT NULL,
        companion_price_id TEXT,
        additional_seat_price_id TEXT,
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT tenant_application_subscriptions_tenant_unique UNIQUE (tenant_id),
        CONSTRAINT tenant_application_subscriptions_core_check
          CHECK (core_product IN ('tradeflowkit','pulsedesk','techdeck')),
        CONSTRAINT tenant_application_subscriptions_companion_check
          CHECK (included_companion_key IN (
            'snapproofos','brandforgeos','studyforge-ai','ninja-launch-kit','callcommand-ai','ninjamation'
          )),
        CONSTRAINT tenant_application_subscriptions_modules_check
          CHECK (jsonb_typeof(additional_module_keys)='array'),
        CONSTRAINT tenant_application_subscriptions_seats_check
          CHECK (additional_seats BETWEEN 0 AND 10000),
        CONSTRAINT tenant_application_subscriptions_status_check
          CHECK (status IN (
            'incomplete','checkout_failed','trialing','active','past_due','canceling','canceled','expired'
          ))
      );

      -- Converge a partially-created v60 table instead of accepting whatever
      -- shape happened to exist when CREATE TABLE IF NOT EXISTS ran. Missing
      -- required business values on a non-empty partial table intentionally
      -- make the transaction fail at SET NOT NULL; those values cannot be
      -- inferred safely by a release migration.
      ALTER TABLE tenant_application_subscriptions
        ADD COLUMN IF NOT EXISTS id VARCHAR(36),
        ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
        ADD COLUMN IF NOT EXISTS initiated_by_user_id VARCHAR(36),
        ADD COLUMN IF NOT EXISTS core_product TEXT,
        ADD COLUMN IF NOT EXISTS included_companion_key TEXT,
        ADD COLUMN IF NOT EXISTS additional_module_keys JSONB,
        ADD COLUMN IF NOT EXISTS additional_seats INTEGER,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS core_price_id TEXT,
        ADD COLUMN IF NOT EXISTS companion_price_id TEXT,
        ADD COLUMN IF NOT EXISTS additional_seat_price_id TEXT,
        ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN,
        ADD COLUMN IF NOT EXISTS metadata JSONB,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

      UPDATE tenant_application_subscriptions SET id=gen_random_uuid()::text WHERE id IS NULL;
      UPDATE tenant_application_subscriptions SET additional_module_keys='[]'::jsonb WHERE additional_module_keys IS NULL;
      UPDATE tenant_application_subscriptions SET additional_seats=0 WHERE additional_seats IS NULL;
      UPDATE tenant_application_subscriptions SET status='incomplete' WHERE status IS NULL;
      UPDATE tenant_application_subscriptions SET cancel_at_period_end=false WHERE cancel_at_period_end IS NULL;
      UPDATE tenant_application_subscriptions SET metadata='{}'::jsonb WHERE metadata IS NULL;
      UPDATE tenant_application_subscriptions SET created_at=NOW() WHERE created_at IS NULL;
      UPDATE tenant_application_subscriptions SET updated_at=NOW() WHERE updated_at IS NULL;

      ALTER TABLE tenant_application_subscriptions
        ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
        ALTER COLUMN additional_module_keys SET DEFAULT '[]'::jsonb,
        ALTER COLUMN additional_seats SET DEFAULT 0,
        ALTER COLUMN status SET DEFAULT 'incomplete',
        ALTER COLUMN cancel_at_period_end SET DEFAULT false,
        ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
        ALTER COLUMN created_at SET DEFAULT NOW(),
        ALTER COLUMN updated_at SET DEFAULT NOW(),
        ALTER COLUMN id SET NOT NULL,
        ALTER COLUMN tenant_id SET NOT NULL,
        ALTER COLUMN core_product SET NOT NULL,
        ALTER COLUMN included_companion_key SET NOT NULL,
        ALTER COLUMN additional_module_keys SET NOT NULL,
        ALTER COLUMN additional_seats SET NOT NULL,
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN stripe_customer_id SET NOT NULL,
        ALTER COLUMN core_price_id SET NOT NULL,
        ALTER COLUMN cancel_at_period_end SET NOT NULL,
        ALTER COLUMN metadata SET NOT NULL,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN updated_at SET NOT NULL;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass AND contype='p'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_pkey PRIMARY KEY (id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_tenant_id_fkey'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_initiated_by_user_id_fkey'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_initiated_by_user_id_fkey
            FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_tenant_unique'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_tenant_unique UNIQUE (tenant_id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_core_check'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_core_check
            CHECK (core_product IN ('tradeflowkit','pulsedesk','techdeck'));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_companion_check'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_companion_check
            CHECK (included_companion_key IN (
              'snapproofos','brandforgeos','studyforge-ai','ninja-launch-kit','callcommand-ai','ninjamation'
            ));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_modules_check'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_modules_check
            CHECK (jsonb_typeof(additional_module_keys)='array');
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_seats_check'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_seats_check
            CHECK (additional_seats BETWEEN 0 AND 10000);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.tenant_application_subscriptions'::regclass
            AND conname='tenant_application_subscriptions_status_check'
        ) THEN
          ALTER TABLE tenant_application_subscriptions
            ADD CONSTRAINT tenant_application_subscriptions_status_check
            CHECK (status IN (
              'incomplete','checkout_failed','trialing','active','past_due','canceling','canceled','expired'
            ));
        END IF;
      END
      $$;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_application_subscriptions_customer
        ON tenant_application_subscriptions(stripe_customer_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_application_subscriptions_status
        ON tenant_application_subscriptions(status,updated_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_application_subscriptions_stripe_subscription
        ON tenant_application_subscriptions(stripe_subscription_id)
        WHERE stripe_subscription_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_application_subscriptions_checkout_session
        ON tenant_application_subscriptions(stripe_checkout_session_id)
        WHERE stripe_checkout_session_id IS NOT NULL;
    `));
  });

  // `launch_fix_post_seed` is intentionally earlier in the immutable release
  // manifest, so a clean database reaches it before the v60 grandfather marker
  // exists. Re-run its idempotent tenant-scoped backfill after the marker is
  // committed so pre-cutover contracts receive their preserved module rows on
  // the same one-pass release apply.
  await launchFixPostSeed();
}

/** Read-only predicate shared by every legacy plan-to-application path. */
export async function subscriptionHasLegacyApplicationAccess(subscriptionId: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM subscriptions
        WHERE id=${subscriptionId} AND legacy_access_grandfathered_at IS NOT NULL
      ) AS grandfathered
    `);
    return result.rows[0]?.grandfathered === true;
  } catch (error) {
    const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
    if (candidate?.code === '42703' || candidate?.cause?.code === '42703') return false;
    throw error;
  }
}
