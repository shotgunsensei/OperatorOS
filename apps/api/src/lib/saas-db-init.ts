import { db } from '../db.js';
import { hashPassword } from './auth.js';
import { users, subscriptionPlans, subscriptions, saasWorkspaces, saasProjects, saasTasks, notes, activityFeed, workspaceMemberships, modules, planModules, tenants, tenantUsers, tenantModules, tenantUserModuleAccess } from '../schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { PLAN_CONFIGS } from './plans.js';

export async function ensureSaasTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      avatar_url TEXT,
      plan_id VARCHAR(36),
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMP,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      last_login_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL DEFAULT 0,
      interval TEXT NOT NULL DEFAULT 'month',
      max_workspaces INTEGER NOT NULL DEFAULT 1,
      max_projects INTEGER NOT NULL DEFAULT 3,
      max_tasks INTEGER NOT NULL DEFAULT 50,
      max_team_members INTEGER NOT NULL DEFAULT 0,
      max_ai_actions_per_month INTEGER NOT NULL DEFAULT 10,
      has_exports BOOLEAN NOT NULL DEFAULT false,
      has_automation BOOLEAN NOT NULL DEFAULT false,
      has_templates BOOLEAN NOT NULL DEFAULT false,
      has_advanced_analytics BOOLEAN NOT NULL DEFAULT false,
      stripe_price_id TEXT,
      stripe_product_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      plan_id VARCHAR(36) NOT NULL REFERENCES subscription_plans(id),
      status TEXT NOT NULL DEFAULT 'active',
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      current_period_start TIMESTAMP DEFAULT NOW() NOT NULL,
      current_period_end TIMESTAMP,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
      trial_end TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

    CREATE TABLE IF NOT EXISTS saas_workspaces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id VARCHAR(36) NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saas_workspaces_owner ON saas_workspaces(owner_id);

    CREATE TABLE IF NOT EXISTS workspace_memberships (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES saas_workspaces(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace ON workspace_memberships(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id);

    CREATE TABLE IF NOT EXISTS saas_projects (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES saas_workspaces(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      color TEXT DEFAULT '#3b82f6',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saas_projects_workspace ON saas_projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_saas_projects_user ON saas_projects(user_id);

    CREATE TABLE IF NOT EXISTS saas_tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR(36) NOT NULL REFERENCES saas_projects(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TIMESTAMP,
      assignee_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saas_tasks_project ON saas_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_saas_tasks_user ON saas_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_saas_tasks_status ON saas_tasks(status);

    CREATE TABLE IF NOT EXISTS notes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      workspace_id VARCHAR(36) REFERENCES saas_workspaces(id),
      project_id VARCHAR(36) REFERENCES saas_projects(id),
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);

    CREATE TABLE IF NOT EXISTS activity_feed (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      workspace_id VARCHAR(36) REFERENCES saas_workspaces(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id VARCHAR(36),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_feed_workspace_created ON activity_feed(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS usage_tracking (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      action_type TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON usage_tracking(user_id, period_start);

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id VARCHAR(36) NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_user_id VARCHAR(36),
      details JSONB,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS billing_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      subscription_id VARCHAR(36),
      event_type TEXT NOT NULL,
      stripe_event_id TEXT,
      amount INTEGER,
      currency TEXT DEFAULT 'usd',
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user_id);
    -- Spec: webhook idempotency at the DB level. A non-null stripe_event_id
    -- is the unique key for the *processed* webhook; we still allow
    -- multiple internal rows (e.g. local-mode events) where stripe_event_id
    -- is NULL via a partial unique index.
    --
    -- Backfill: legacy rows (created before idempotency was a hard rule)
    -- may carry duplicate stripe_event_id values. Keep the oldest row's
    -- id intact and NULL out the duplicates so the unique index can be
    -- built without losing forensic history.
    UPDATE billing_events SET stripe_event_id = NULL
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY stripe_event_id ORDER BY created_at ASC) AS rn
          FROM billing_events
          WHERE stripe_event_id IS NOT NULL
        ) t
        WHERE t.rn > 1
      );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_events_stripe_event_id
      ON billing_events(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS admin_notes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id VARCHAR(36) NOT NULL REFERENCES users(id),
      target_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_notes_target ON admin_notes(target_user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_notes_created ON admin_notes(created_at DESC);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

    CREATE TABLE IF NOT EXISTS ai_prompt_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      tool_type TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      is_shared BOOLEAN NOT NULL DEFAULT false,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_templates_user ON ai_prompt_templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_templates_tool ON ai_prompt_templates(tool_type);

    CREATE TABLE IF NOT EXISTS ai_actions_log (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      tool_type TEXT NOT NULL,
      input JSONB,
      output JSONB,
      token_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_actions_user ON ai_actions_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_actions_created ON ai_actions_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_actions_tool ON ai_actions_log(tool_type);

    -- Shotgun OS Hub: modules, entitlements & SSO -------------------------------

    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36);
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'user';

    -- Hybrid billing constraint: at most ONE live base subscription per user.
    -- Migration-safe dedupe: keep the most recently updated active/trialing row,
    -- demote older duplicates to 'canceled' so the partial unique index can be
    -- created without errors on existing data.
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, created_at DESC) AS rn
      FROM subscriptions
      WHERE status IN ('active', 'trialing')
    )
    UPDATE subscriptions s SET status = 'canceled', updated_at = NOW()
      FROM ranked r WHERE s.id = r.id AND r.rn > 1;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_active_per_user
      ON subscriptions(user_id)
      WHERE status IN ('active', 'trialing');

    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS payload_hash TEXT;
    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS error_message TEXT;
    -- Webhook claim rows may not yet have a resolved user (raw event captured
    -- pre-attribution for DLQ replay). Side-effect inserts still set user_id.
    ALTER TABLE billing_events ALTER COLUMN user_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON billing_events(processed_at);

    CREATE TABLE IF NOT EXISTS modules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon_url TEXT,
      category TEXT DEFAULT 'app',
      base_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'coming_soon',
      plan_min TEXT NOT NULL DEFAULT 'elite',
      requires_org BOOLEAN NOT NULL DEFAULT false,
      ord INTEGER NOT NULL DEFAULT 0,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_modules_slug ON modules(slug);
    CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status);
    DO $$ BEGIN
      ALTER TABLE modules ADD CONSTRAINT modules_status_check
        CHECK (status IN ('live', 'beta', 'coming_soon', 'disabled'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS plan_modules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id VARCHAR(36) NOT NULL REFERENCES subscription_plans(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(plan_id, module_id)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_modules_plan ON plan_modules(plan_id);
    CREATE INDEX IF NOT EXISTS idx_plan_modules_module ON plan_modules(module_id);

    CREATE TABLE IF NOT EXISTS addon_subscriptions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      organization_id VARCHAR(36),
      scope_type TEXT NOT NULL DEFAULT 'user',
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      status TEXT NOT NULL DEFAULT 'active',
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      stripe_price_id TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      current_period_start TIMESTAMP DEFAULT NOW() NOT NULL,
      current_period_end TIMESTAMP,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_addon_subs_user ON addon_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_addon_subs_module ON addon_subscriptions(module_id);
    CREATE INDEX IF NOT EXISTS idx_addon_subs_status ON addon_subscriptions(status);
    -- Hybrid billing constraint: one ACTIVE/TRIALING addon row per (user, module).
    -- Cancelled/past_due rows remain for history; only live ones must be unique.
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_addon_active_per_user_module
      ON addon_subscriptions(user_id, module_id)
      WHERE status IN ('active', 'trialing');

    CREATE TABLE IF NOT EXISTS entitlement_overrides (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      organization_id VARCHAR(36),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      "grant" BOOLEAN NOT NULL DEFAULT true,
      reason TEXT,
      created_by_admin_id VARCHAR(36) NOT NULL REFERENCES users(id),
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_overrides_user ON entitlement_overrides(user_id);
    CREATE INDEX IF NOT EXISTS idx_overrides_module ON entitlement_overrides(module_id);

    CREATE TABLE IF NOT EXISTS sso_handoff_tokens (
      jti VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      module_slug TEXT NOT NULL,
      aud TEXT NOT NULL,
      env TEXT NOT NULL,
      issued_ip TEXT,
      consumed_ip TEXT,
      issued_user_agent TEXT,
      consumed_by_user_agent TEXT,
      issued_at TIMESTAMP DEFAULT NOW() NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    ALTER TABLE sso_handoff_tokens ADD COLUMN IF NOT EXISTS issued_user_agent TEXT;
    ALTER TABLE sso_handoff_tokens ADD COLUMN IF NOT EXISTS consumed_by_user_agent TEXT;
    ALTER TABLE sso_handoff_tokens ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP DEFAULT NOW();
    UPDATE sso_handoff_tokens SET issued_at = COALESCE(issued_at, created_at) WHERE issued_at IS NULL;
    ALTER TABLE sso_handoff_tokens ALTER COLUMN issued_at SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sso_tokens_expires ON sso_handoff_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sso_tokens_user ON sso_handoff_tokens(user_id);
  `);

  // Spec contract: sso_handoff_tokens columns are `aud` (matches JWT claim)
  // and `consumed_by_user_agent` (mirrors `issued_user_agent`). Earlier
  // rounds shipped `audience` and `consumed_user_agent`; rename in place
  // when the legacy names are still present. Run as separate statements so
  // we don't depend on PL/pgSQL DO blocks (esbuild template-literal quirks
  // around `$$ ... $$`) and can swallow the "column does not exist" error
  // on fresh installs where the legacy column was never created.
  await renameLegacyColumnIfPresent('sso_handoff_tokens', 'audience', 'aud');
  await renameLegacyColumnIfPresent('sso_handoff_tokens', 'consumed_user_agent', 'consumed_by_user_agent');
}

async function renameLegacyColumnIfPresent(table: string, fromCol: string, toCol: string) {
  const cols = await db.execute(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table}'
       AND column_name IN ('${fromCol}', '${toCol}')`
  );
  const rows: any[] = (cols as any).rows ?? (cols as any) ?? [];
  const present = new Set(rows.map((r: any) => r.column_name));
  if (present.has(fromCol) && !present.has(toCol)) {
    await db.execute(`ALTER TABLE ${table} RENAME COLUMN ${fromCol} TO ${toCol}`);
    console.log(`[saas-db-init] Renamed ${table}.${fromCol} -> ${toCol}`);
  }
}

// ---------------------------------------------------------------------------
// Module catalog seeding
// ---------------------------------------------------------------------------

interface ModuleSeed {
  slug: string;
  name: string;
  description: string;
  category: string;
  status: 'live' | 'beta' | 'coming_soon' | 'disabled';
  baseUrl: string;
  planMin: 'starter' | 'pro' | 'elite';
  ord: number;
}

/**
 * Module catalog seed.
 *
 * Spec: each live module must have its launch base URL provided via env
 * (e.g. TRADEFLOWKIT_URL). When the env var is missing we DEFAULT TO
 * `coming_soon` rather than guessing a public URL — a missing env value
 * means the module is not yet wired up in this environment, and pointing
 * the launch button at a guessed URL would silently leak unsigned SSO
 * traffic to the wrong place. Status flips back to `live` automatically
 * the moment the env var is configured and the server restarts.
 *
 * `defaultStatus` is the status the module *would* have if its URL is
 * configured. The actual `status` column is computed as:
 *   - `coming_soon` if defaultStatus === 'coming_soon'
 *   - `coming_soon` if defaultStatus === 'live' but envUrl is missing
 *   - defaultStatus otherwise
 */
interface ModuleSeedSpec {
  slug: string;
  name: string;
  description: string;
  category: string;
  defaultStatus: 'live' | 'beta' | 'coming_soon';
  envUrl: string | undefined;
  planMin: 'starter' | 'pro' | 'elite';
  ord: number;
  /**
   * Default add-on price in USD cents seeded into modules.metadata
   * on first insert. After insert, admins can edit modules.metadata
   * to override; we never stomp admin-edited values on restart.
   *
   * Pricing rule (matches Stripe price catalog):
   *   starter-tier addon = $19/mo (1900 cents)
   *   pro-tier addon     = $29/mo (2900 cents)
   *   elite-tier addon   = $49/mo (4900 cents)
   */
  addonPriceCents: number;
}

// Default addon prices keyed by plan tier. The buy_addon CTA needs a
// non-null `addon_price_cents` from the API to render — without these
// seeded into `modules.metadata.addonPriceCents`, the UI silently
// suppresses the "Buy Add-on" button even when STRIPE_PRICE_ADDON_<SLUG>
// is configured. Per-tier defaults are baked into the seed; admins can
// edit `modules.metadata` to set custom prices per module.
const ADDON_DEFAULT_CENTS = { starter: 1900, pro: 2900, elite: 4900 } as const;

const MODULE_SEED_SPECS: ModuleSeedSpec[] = [
  { slug: 'tradeflowkit',     name: 'TradeFlowKit',     description: 'Job tracker for trade & service businesses', category: 'ops',     defaultStatus: 'live',        envUrl: process.env.TRADEFLOWKIT_URL,    planMin: 'starter', ord: 1, addonPriceCents: ADDON_DEFAULT_CENTS.starter },
  { slug: 'torqueshed',       name: 'TorqueShed',       description: 'Mechanic shop dashboard & invoicing',        category: 'ops',     defaultStatus: 'live',        envUrl: process.env.TORQUESHED_URL,      planMin: 'starter', ord: 2, addonPriceCents: ADDON_DEFAULT_CENTS.starter },
  { slug: 'techdeck',         name: 'TechDeck',         description: 'Onsite tech command center',                  category: 'ops',     defaultStatus: 'live',        envUrl: process.env.TECHDECK_URL,        planMin: 'starter', ord: 3, addonPriceCents: ADDON_DEFAULT_CENTS.starter },
  { slug: 'pulsedesk',        name: 'PulseDesk',        description: 'Lightweight ticketing for small teams',      category: 'support', defaultStatus: 'live',        envUrl: process.env.PULSEDESK_URL,       planMin: 'pro',     ord: 4, addonPriceCents: ADDON_DEFAULT_CENTS.pro     },
  { slug: 'faultlinelab',     name: 'FaultlineLab',     description: 'Diagnostic + RCA workflow',                   category: 'support', defaultStatus: 'live',        envUrl: process.env.FAULTLINELAB_URL,    planMin: 'pro',     ord: 5, addonPriceCents: ADDON_DEFAULT_CENTS.pro     },
  { slug: 'bf-os',            name: 'BF-OS',            description: 'Body shop / collision OS',                    category: 'ops',     defaultStatus: 'live',        envUrl: process.env.BF_OS_URL,           planMin: 'pro',     ord: 6, addonPriceCents: ADDON_DEFAULT_CENTS.pro     },
  { slug: 'snapproofos',      name: 'SnapProofOS',      description: 'Photo-based proof of work',                   category: 'ops',     defaultStatus: 'live',        envUrl: process.env.SNAPPROOFOS_URL,     planMin: 'elite',   ord: 7, addonPriceCents: ADDON_DEFAULT_CENTS.elite   },
  { slug: 'studyforge-ai',    name: 'StudyForge AI',    description: 'AI study & training partner',                 category: 'ai',      defaultStatus: 'coming_soon', envUrl: process.env.STUDYFORGE_AI_URL,   planMin: 'elite',   ord: 8, addonPriceCents: ADDON_DEFAULT_CENTS.elite   },
  { slug: 'ninja-launch-kit', name: 'Ninja Launch Kit', description: 'Build & ship internal tools fast',            category: 'ai',      defaultStatus: 'coming_soon', envUrl: process.env.NINJA_LAUNCH_KIT_URL, planMin: 'elite',  ord: 9, addonPriceCents: ADDON_DEFAULT_CENTS.elite   },
];

export const MODULE_SEEDS: ModuleSeed[] = MODULE_SEED_SPECS.map(s => ({
  slug: s.slug,
  name: s.name,
  description: s.description,
  category: s.category,
  status: s.defaultStatus === 'live' && !s.envUrl ? 'coming_soon' : s.defaultStatus,
  baseUrl: s.envUrl ?? '',
  planMin: s.planMin,
  ord: s.ord,
}));

export async function seedModules() {
  for (const spec of MODULE_SEED_SPECS) {
    const m = MODULE_SEEDS.find(x => x.slug === spec.slug)!;
    const existing = await db.select().from(modules).where(eq(modules.slug, spec.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(modules).values({
        slug: m.slug, name: m.name, description: m.description,
        category: m.category, status: m.status, baseUrl: m.baseUrl,
        planMin: m.planMin, ord: m.ord,
        // Seed default addon price into metadata so the buy_addon CTA
        // surfaces in the UI on first install. Admin can edit later.
        metadata: { addonPriceCents: spec.addonPriceCents },
      });
    } else {
      // Re-apply env-derived fields so adding/removing an env URL between
      // restarts is reflected on existing rows. We deliberately scope this
      // re-apply to the *env-derived* fields (`baseUrl` + the derived
      // `status` for live-default modules) — admin-edited fields like
      // `planMin`, `ord`, `description`, `name`, `iconUrl` are preserved.
      //
      // Status policy:
      //   - defaultStatus === 'live' + envUrl present  → flip to 'live'
      //   - defaultStatus === 'live' + envUrl missing  → flip to 'coming_soon'
      //   - defaultStatus !== 'live'                   → leave whatever the
      //     admin chose (so admins can promote a `coming_soon` module to
      //     `beta` without us stomping it on every restart).
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      updates.baseUrl = m.baseUrl || existing[0].baseUrl;
      // Back-fill metadata.addonPriceCents on rows that pre-date the
      // addon-price seeding (existing.metadata is null OR missing the
      // key). Never overwrite a value an admin has already set.
      const existingMd = (existing[0].metadata ?? {}) as Record<string, unknown>;
      if (existingMd.addonPriceCents == null) {
        updates.metadata = { ...existingMd, addonPriceCents: spec.addonPriceCents };
      }
      if (spec.defaultStatus === 'live') {
        updates.status = spec.envUrl ? 'live' : 'coming_soon';
      }
      await db.update(modules).set(updates).where(eq(modules.slug, spec.slug));
    }
  }
  console.log(`[seed] Modules: ${MODULE_SEEDS.length} seeded/updated`);

  // Plan -> module mapping (idempotent)
  const allPlans = await db.select().from(subscriptionPlans);
  const planBySlug = Object.fromEntries(allPlans.map(p => [p.slug, p]));
  const allModules = await db.select().from(modules);
  const modBySlug = Object.fromEntries(allModules.map(m => [m.slug, m]));

  // tier hierarchy: starter < pro < elite. A plan grants every module whose plan_min <= plan tier.
  const tierRank: Record<string, number> = { starter: 1, pro: 2, elite: 3 };

  for (const plan of allPlans) {
    const planRank = tierRank[plan.slug] ?? 0;
    if (planRank === 0) continue;
    for (const m of allModules) {
      const modRank = tierRank[m.planMin] ?? 99;
      if (planRank >= modRank) {
        const exists = await db.select().from(planModules)
          .where(and(eq(planModules.planId, plan.id), eq(planModules.moduleId, m.id)))
          .limit(1);
        if (exists.length === 0) {
          await db.insert(planModules).values({ planId: plan.id, moduleId: m.id });
        }
      }
    }
  }
  console.log('[seed] plan_modules mapping refreshed (starter=3, pro=6, elite=9)');
}

export async function seedPlansAndAdmin() {
  const existingPlans = await db.select().from(subscriptionPlans).limit(1);
  if (existingPlans.length === 0) {
    await db.insert(subscriptionPlans).values(
      PLAN_CONFIGS.map(p => ({
        name: p.name,
        slug: p.slug,
        price: p.price,
        interval: p.interval,
        maxWorkspaces: p.limits.maxWorkspaces,
        maxProjects: p.limits.maxProjects,
        maxTasks: p.limits.maxTasks,
        maxTeamMembers: p.limits.maxTeamMembers,
        maxAiActionsPerMonth: p.limits.maxAiActionsPerMonth,
        hasExports: p.features.exports,
        hasAutomation: p.features.automation,
        hasTemplates: p.features.templates,
        hasAdvancedAnalytics: p.features.advancedAnalytics,
      }))
    );
    console.log('[seed] Created subscription plans from PLAN_CONFIGS:', PLAN_CONFIGS.map(p => p.name).join(', '));
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'john@shotgunninjas.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Dr0p$0fJup1t3r';

  const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existingAdmin.length === 0) {
    const passwordHash = await hashPassword(adminPassword);
    const [admin] = await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      name: 'John',
      role: 'admin',
      status: 'active',
    }).returning();

    const [elitePlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'elite')).limit(1);
    if (elitePlan && admin) {
      await db.insert(subscriptions).values({
        userId: admin.id,
        planId: elitePlan.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    }
    console.log(`[seed] Created admin account: ${adminEmail}`);
  }

  const demoEmail = process.env.DEMO_EMAIL || 'demo@operatoros.com';
  const existingDemo = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
  if (existingDemo.length === 0) {
    const demoPassword = process.env.DEMO_PASSWORD || 'Demo1234!';
    const demoHash = await hashPassword(demoPassword);
    const [demoUser] = await db.insert(users).values({
      email: demoEmail,
      passwordHash: demoHash,
      name: 'Demo User',
      role: 'user',
      status: 'active',
    }).returning();

    const [proPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, 'pro')).limit(1);
    if (proPlan && demoUser) {
      await db.insert(subscriptions).values({
        userId: demoUser.id,
        planId: proPlan.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const [ws] = await db.insert(saasWorkspaces).values({
        ownerId: demoUser.id,
        name: 'Demo Workspace',
        slug: 'demo-workspace',
        description: 'A sample workspace to explore OperatorOS',
      }).returning();

      if (ws) {
        await db.insert(workspaceMemberships).values({
          workspaceId: ws.id,
          userId: demoUser.id,
          role: 'owner',
        });
        const [proj] = await db.insert(saasProjects).values({
          workspaceId: ws.id,
          userId: demoUser.id,
          name: 'Getting Started',
          description: 'Your first project',
          color: '#58a6ff',
        }).returning();

        if (proj) {
          await db.insert(saasTasks).values([
            { projectId: proj.id, userId: demoUser.id, title: 'Explore the dashboard', status: 'done', priority: 'low' },
            { projectId: proj.id, userId: demoUser.id, title: 'Create a workspace', status: 'done', priority: 'medium' },
            { projectId: proj.id, userId: demoUser.id, title: 'Set up your first project', status: 'in_progress', priority: 'high' },
            { projectId: proj.id, userId: demoUser.id, title: 'Invite team members', status: 'todo', priority: 'medium' },
            { projectId: proj.id, userId: demoUser.id, title: 'Try AI tools', status: 'todo', priority: 'low' },
          ]);
        }

        await db.insert(notes).values([
          { userId: demoUser.id, title: 'Welcome to OperatorOS', content: 'This is your personal note-taking space. Pin important notes, organize ideas, and keep track of anything you need.', isPinned: true },
          { userId: demoUser.id, title: 'Quick Tips', content: '1. Use workspaces to separate different teams or clients\n2. Color-code projects for visual organization\n3. Set task priorities to stay focused on what matters\n4. Check the billing page to manage your subscription' },
        ]);

        await db.insert(activityFeed).values([
          { userId: demoUser.id, action: 'created', entityType: 'workspace', metadata: { name: 'Demo Workspace' } },
          { userId: demoUser.id, action: 'created', entityType: 'project', metadata: { name: 'Getting Started' } },
          { userId: demoUser.id, action: 'registered', entityType: 'account', metadata: {} },
        ]);
      }
    }
    console.log(`[seed] Created demo account: ${demoEmail}`);
  }
}

// ===========================================================================
// Gate 1 — Tenant tables, backfill, bootstrap super-admin & Demo Co
// ===========================================================================

/**
 * Idempotent DDL for the Gate 1 tenant model. Adds new columns to existing
 * tables (users / subscriptions / addon_subscriptions / entitlement_overrides
 * / billing_events / admin_audit_logs) and creates the five new tenant
 * tables. Safe to run on every boot.
 */
export async function ensureTenantTables() {
  await db.execute(`
    -- New columns on existing tables ---------------------------------------
    ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS current_tenant_id VARCHAR(36);
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_platform_role_check
        CHECK (platform_role IN ('super_admin', 'user'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS idx_users_platform_role ON users(platform_role);

    ALTER TABLE subscriptions          ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE addon_subscriptions    ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE entitlement_overrides  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE billing_events         ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    ALTER TABLE admin_audit_logs       ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant     ON subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_addon_subs_tenant        ON addon_subscriptions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_overrides_tenant         ON entitlement_overrides(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_billing_events_tenant    ON billing_events(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_tenant  ON admin_audit_logs(tenant_id);

    -- tenants -------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS tenants (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'personal',
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_tenants_type  ON tenants(type);
    DO $$ BEGIN
      ALTER TABLE tenants ADD CONSTRAINT tenants_type_check
        CHECK (type IN ('personal', 'company'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- tenant_users --------------------------------------------------------
    CREATE TABLE IF NOT EXISTS tenant_users (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(tenant_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_users_user   ON tenant_users(user_id);
    DO $$ BEGIN
      ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_role_check
        CHECK (role IN ('owner', 'admin', 'member'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- tenant_modules ------------------------------------------------------
    CREATE TABLE IF NOT EXISTS tenant_modules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      status TEXT NOT NULL DEFAULT 'enabled',
      source TEXT NOT NULL DEFAULT 'included',
      allow_all_members BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(tenant_id, module_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant ON tenant_modules(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_modules_module ON tenant_modules(module_id);
    DO $$ BEGIN
      ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_status_check
        CHECK (status IN ('enabled','trial','purchased','beta','disabled','archived'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_source_check
        CHECK (source IN ('included','addon','trial','admin'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- tenant_user_module_access ------------------------------------------
    CREATE TABLE IF NOT EXISTS tenant_user_module_access (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      access_level TEXT NOT NULL DEFAULT 'none',
      granted_by_user_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(tenant_id, user_id, module_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tuma_tenant_user ON tenant_user_module_access(tenant_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_tuma_module      ON tenant_user_module_access(module_id);
    DO $$ BEGIN
      ALTER TABLE tenant_user_module_access ADD CONSTRAINT tuma_level_check
        CHECK (access_level IN ('none','user','manager'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- tenant_invites ------------------------------------------------------
    CREATE TABLE IF NOT EXISTS tenant_invites (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      token TEXT NOT NULL UNIQUE,
      invited_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      accepted_at TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant ON tenant_invites(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_invites_email  ON tenant_invites(email);
    DO $$ BEGIN
      ALTER TABLE tenant_invites ADD CONSTRAINT tenant_invites_role_check
        CHECK (role IN ('owner', 'admin', 'member'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
}

/**
 * Idempotent: every user must have exactly one personal tenant. Existing
 * billing/audit/etc. rows get back-filled to the user's personal tenant
 * so cross-tenant queries don't return NULL-tenant orphans forever.
 *
 * Personal-tenant slug convention: `personal-<userId>`. The tenant name
 * mirrors the user's email so admins can identify it at a glance.
 */
export async function backfillPersonalTenants() {
  const allUsers = await db.select().from(users);
  let created = 0;
  for (const u of allUsers) {
    const slug = `personal-${u.id}`;
    let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) {
      [tenant] = await db.insert(tenants).values({
        name: `${u.email} Personal`,
        slug,
        type: 'personal',
        ownerUserId: u.id,
      }).returning();
      await db.insert(tenantUsers).values({
        tenantId: tenant.id,
        userId: u.id,
        role: 'owner',
      });
      created++;
    } else {
      // Heal: ensure owner row exists (migrations from earlier failed runs).
      const [tu] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, tenant.id), eq(tenantUsers.userId, u.id)))
        .limit(1);
      if (!tu) {
        await db.insert(tenantUsers).values({ tenantId: tenant.id, userId: u.id, role: 'owner' });
      }
    }

    // Set current_tenant_id only if unset; never stomp an explicit choice.
    if (!u.currentTenantId) {
      await db.update(users)
        .set({ currentTenantId: tenant.id, updatedAt: new Date() })
        .where(eq(users.id, u.id));
    }

    // Back-fill tenant_id on user-owned billing & audit rows. Use Drizzle's
    // parameterized `sql` template so values are bound, not interpolated —
    // robust even though both ids are trusted UUIDs from our own tables.
    await db.execute(sql`UPDATE subscriptions         SET tenant_id = ${tenant.id} WHERE user_id  = ${u.id} AND tenant_id IS NULL`);
    await db.execute(sql`UPDATE addon_subscriptions   SET tenant_id = ${tenant.id} WHERE user_id  = ${u.id} AND tenant_id IS NULL`);
    await db.execute(sql`UPDATE entitlement_overrides SET tenant_id = ${tenant.id} WHERE user_id  = ${u.id} AND tenant_id IS NULL`);
    await db.execute(sql`UPDATE billing_events        SET tenant_id = ${tenant.id} WHERE user_id  = ${u.id} AND tenant_id IS NULL`);
    await db.execute(sql`UPDATE admin_audit_logs      SET tenant_id = ${tenant.id} WHERE admin_id = ${u.id} AND tenant_id IS NULL`);
  }
  console.log(`[backfill] Personal tenants: ${created} created, ${allUsers.length} users ensured`);
}

/**
 * Promotes the user identified by OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL to
 * platform `super_admin`. Idempotent. NEVER hard-codes an email — when the
 * env var is absent, the function logs and returns. When the user does not
 * yet exist (first boot, before the seed user is inserted), the function
 * also returns; the next boot picks it up.
 *
 * SECURITY: this is the ONLY supported way to grant `super_admin` outside
 * of a direct SQL update by an existing super_admin.
 */
export async function bootstrapSuperAdmin() {
  const email = process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
  if (!email) {
    console.log('[bootstrap] OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL not set; skipping super-admin promotion');
    return;
  }
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    console.log(`[bootstrap] super-admin email ${email} not found; will retry on next boot`);
    return;
  }
  if (u.platformRole === 'super_admin') {
    return; // already promoted; quiet no-op
  }
  await db.update(users)
    .set({ platformRole: 'super_admin', updatedAt: new Date() })
    .where(eq(users.id, u.id));
  console.log(`[bootstrap] Promoted ${email} to platform super_admin`);
}

/**
 * Demo Co — the showcase company tenant for the demo user. Owns every
 * `live` module via tenant_modules (source = 'included'); the demo user
 * gets `manager` access on each so they can see the full Hub experience.
 *
 * Idempotent: re-runs only insert what's missing. Demo user's
 * current_tenant_id is moved to Demo Co on first creation so the demo
 * lands on the company tenant by default.
 */
export async function seedDemoCoTenant() {
  const demoEmail = process.env.DEMO_EMAIL || 'demo@operatoros.com';
  const [demoUser] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
  if (!demoUser) return;

  const slug = 'demo-co';
  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  let createdTenant = false;
  if (!tenant) {
    [tenant] = await db.insert(tenants).values({
      name: 'Demo Co',
      slug,
      type: 'company',
      ownerUserId: demoUser.id,
    }).returning();
    createdTenant = true;
    console.log('[seed] Created Demo Co tenant');
  }

  const [membership] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenant.id), eq(tenantUsers.userId, demoUser.id)))
    .limit(1);
  if (!membership) {
    await db.insert(tenantUsers).values({
      tenantId: tenant.id,
      userId: demoUser.id,
      role: 'owner',
    });
  }

  // Only switch the demo user's active tenant on the FIRST seed of Demo Co
  // — subsequent boots leave their selection alone.
  if (createdTenant) {
    await db.update(users)
      .set({ currentTenantId: tenant.id, updatedAt: new Date() })
      .where(eq(users.id, demoUser.id));
  }

  // Enable every live module on Demo Co; grant the demo user manager access.
  const liveMods = await db.select().from(modules).where(eq(modules.status, 'live'));
  for (const m of liveMods) {
    const [tmExists] = await db.select().from(tenantModules)
      .where(and(eq(tenantModules.tenantId, tenant.id), eq(tenantModules.moduleId, m.id)))
      .limit(1);
    if (!tmExists) {
      await db.insert(tenantModules).values({
        tenantId: tenant.id,
        moduleId: m.id,
        status: 'enabled',
        source: 'included',
      });
    }
    const [accExists] = await db.select().from(tenantUserModuleAccess)
      .where(and(
        eq(tenantUserModuleAccess.tenantId, tenant.id),
        eq(tenantUserModuleAccess.userId, demoUser.id),
        eq(tenantUserModuleAccess.moduleId, m.id),
      ))
      .limit(1);
    if (!accExists) {
      await db.insert(tenantUserModuleAccess).values({
        tenantId: tenant.id,
        userId: demoUser.id,
        moduleId: m.id,
        accessLevel: 'manager',
      });
    }
  }
}
