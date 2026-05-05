import { db } from '../db.js';
import { hashPassword } from './auth.js';
import { users, subscriptionPlans, subscriptions, saasWorkspaces, saasProjects, saasTasks, notes, activityFeed, workspaceMemberships, modules, planModules } from '../schema.js';
import { eq, and } from 'drizzle-orm';
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

    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS payload_hash TEXT;
    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
    ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS error_message TEXT;
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
      audience TEXT NOT NULL,
      env TEXT NOT NULL,
      issued_ip TEXT,
      consumed_ip TEXT,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sso_tokens_expires ON sso_handoff_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sso_tokens_user ON sso_handoff_tokens(user_id);
  `);
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

export const MODULE_SEEDS: ModuleSeed[] = [
  { slug: 'tradeflowkit', name: 'TradeFlowKit', description: 'Job tracker for trade & service businesses', category: 'ops', status: 'live', baseUrl: process.env.TRADEFLOWKIT_URL || 'https://tradeflowkit.com', planMin: 'starter', ord: 1 },
  { slug: 'torqueshed', name: 'TorqueShed', description: 'Mechanic shop dashboard & invoicing', category: 'ops', status: 'live', baseUrl: process.env.TORQUESHED_URL || 'https://torqueshed.pro', planMin: 'starter', ord: 2 },
  { slug: 'techdeck', name: 'TechDeck', description: 'Onsite tech command center', category: 'ops', status: 'live', baseUrl: process.env.TECHDECK_URL || 'https://techdeck.app', planMin: 'starter', ord: 3 },
  { slug: 'pulsedesk', name: 'PulseDesk', description: 'Lightweight ticketing for small teams', category: 'support', status: 'live', baseUrl: process.env.PULSEDESK_URL || 'https://pulsedesk.support', planMin: 'pro', ord: 4 },
  { slug: 'faultlinelab', name: 'FaultlineLab', description: 'Diagnostic + RCA workflow', category: 'support', status: 'live', baseUrl: process.env.FAULTLINELAB_URL || 'https://faultlinelab.com', planMin: 'pro', ord: 5 },
  { slug: 'bf-os', name: 'BF-OS', description: 'Body shop / collision OS', category: 'ops', status: 'live', baseUrl: process.env.BF_OS_URL || 'https://bf-os.com', planMin: 'pro', ord: 6 },
  { slug: 'snapproofos', name: 'SnapProofOS', description: 'Photo-based proof of work', category: 'ops', status: 'live', baseUrl: process.env.SNAPPROOFOS_URL || 'https://snapproofos.com', planMin: 'elite', ord: 7 },
  { slug: 'studyforge-ai', name: 'StudyForge AI', description: 'AI study & training partner', category: 'ai', status: 'coming_soon', baseUrl: process.env.STUDYFORGE_URL || '', planMin: 'elite', ord: 8 },
  { slug: 'ninja-launch-kit', name: 'Ninja Launch Kit', description: 'Build & ship internal tools fast', category: 'ai', status: 'coming_soon', baseUrl: process.env.NINJA_LAUNCH_KIT_URL || '', planMin: 'elite', ord: 9 },
];

export async function seedModules() {
  for (const m of MODULE_SEEDS) {
    const existing = await db.select().from(modules).where(eq(modules.slug, m.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(modules).values({
        slug: m.slug, name: m.name, description: m.description,
        category: m.category, status: m.status, baseUrl: m.baseUrl,
        planMin: m.planMin, ord: m.ord,
      });
    } else {
      // Refresh baseUrl/status/planMin in case env vars changed (but don't overwrite admin-edited fields)
      await db.update(modules).set({
        baseUrl: m.baseUrl || existing[0].baseUrl,
        updatedAt: new Date(),
      }).where(eq(modules.slug, m.slug));
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
