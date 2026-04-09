import { db } from '../db.js';
import { hashPassword } from './auth.js';
import { users, subscriptionPlans, subscriptions, saasWorkspaces, saasProjects, saasTasks, notes, activityFeed, workspaceMemberships } from '../schema.js';
import { eq } from 'drizzle-orm';
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
  `);
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

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@operatoros.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

  const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existingAdmin.length === 0) {
    const passwordHash = await hashPassword(adminPassword);
    const [admin] = await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      name: 'Admin',
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
