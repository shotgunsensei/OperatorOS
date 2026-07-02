import { pool } from "./db";
import { encryptSecret, decryptSecret } from "./auth/crypto";

async function migrateEnums() {
  const client = await pool.connect();
  try {
    const enumFixesNeeded: { type: string; value: string }[] = [
      { type: "membership_role", value: "owner" },
      { type: "membership_role", value: "admin" },
      { type: "membership_role", value: "supervisor" },
      { type: "membership_role", value: "staff" },
      { type: "membership_role", value: "technician" },
      { type: "membership_role", value: "readonly" },
      { type: "org_plan", value: "free" },
      { type: "org_plan", value: "pro" },
      { type: "org_plan", value: "pro_plus" },
      { type: "org_plan", value: "enterprise" },
      { type: "org_plan", value: "unlimited" },
    ];

    for (const { type, value } of enumFixesNeeded) {
      const typeExists = await client.query(
        `SELECT 1 FROM pg_type WHERE typname = $1`,
        [type]
      );
      if (typeExists.rows.length === 0) continue;

      const valueExists = await client.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = $1 AND e.enumlabel = $2`,
        [type, value]
      );
      if (valueExists.rows.length === 0) {
        try {
          await client.query(`ALTER TYPE ${type} ADD VALUE '${value}'`);
          console.log(`[migration] Added '${value}' to enum ${type}`);
        } catch (err: any) {
          if (err.code === '42710') continue;
          throw err;
        }
      }
    }
  } finally {
    client.release();
  }
}

async function migrateStaleRoles() {
  const client = await pool.connect();
  try {
    const tablesExist = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('memberships', 'invite_codes')`
    );
    const tables = new Set(tablesExist.rows.map((r: any) => r.tablename));
    if (tables.size === 0) return;

    await client.query("BEGIN");

    if (tables.has("memberships")) {
      const r1 = await client.query(`UPDATE memberships SET role = 'technician' WHERE role = 'tech'`);
      if (r1.rowCount && r1.rowCount > 0) console.log(`[migration] Migrated ${r1.rowCount} memberships: tech → technician`);

      const r2 = await client.query(`UPDATE memberships SET role = 'readonly' WHERE role = 'viewer'`);
      if (r2.rowCount && r2.rowCount > 0) console.log(`[migration] Migrated ${r2.rowCount} memberships: viewer → readonly`);

      await client.query(`ALTER TABLE memberships ALTER COLUMN role SET DEFAULT 'staff'::membership_role`);
    }

    if (tables.has("invite_codes")) {
      const r3 = await client.query(`UPDATE invite_codes SET role = 'technician' WHERE role = 'tech'`);
      if (r3.rowCount && r3.rowCount > 0) console.log(`[migration] Migrated ${r3.rowCount} invite_codes: tech → technician`);

      const r4 = await client.query(`UPDATE invite_codes SET role = 'readonly' WHERE role = 'viewer'`);
      if (r4.rowCount && r4.rowCount > 0) console.log(`[migration] Migrated ${r4.rowCount} invite_codes: viewer → readonly`);

      await client.query(`ALTER TABLE invite_codes ALTER COLUMN role SET DEFAULT 'staff'::membership_role`);
    }

    console.log(`[migration] Stale role migration and defaults update complete`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureSchema() {
  await migrateEnums();
  await migrateStaleRoles();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ticket_priority AS ENUM ('critical','high','normal','low');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ticket_status AS ENUM ('new','triage','assigned','waiting_department','waiting_vendor','in_progress','escalated','resolved','closed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ticket_category AS ENUM ('it_infrastructure','medical_equipment','supplies_inventory','facilities_building','housekeeping_environmental','safety_compliance','vendor_external','administrative','hr_staff','other');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE asset_status AS ENUM ('active','under_service','retired','offline');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE supply_request_status AS ENUM ('pending','approved','ordered','fulfilled','denied');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE facility_request_type AS ENUM ('hvac','plumbing','lighting','doors_locks','electrical','room_condition','furniture_workspace','cleaning_environmental','other');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        name text NOT NULL,
        description text DEFAULT '',
        contact_name text DEFAULT '',
        contact_phone text DEFAULT '',
        contact_email text DEFAULT '',
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        asset_tag text NOT NULL,
        name text NOT NULL,
        asset_type text DEFAULT '',
        location text DEFAULT '',
        department_id varchar REFERENCES departments(id),
        service_vendor text DEFAULT '',
        warranty_notes text DEFAULT '',
        maintenance_notes text DEFAULT '',
        status asset_status NOT NULL DEFAULT 'active',
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        ticket_number text NOT NULL,
        title text NOT NULL,
        description text DEFAULT '',
        category ticket_category NOT NULL DEFAULT 'other',
        priority ticket_priority NOT NULL DEFAULT 'normal',
        status ticket_status NOT NULL DEFAULT 'new',
        department_id varchar REFERENCES departments(id),
        location text DEFAULT '',
        building text DEFAULT '',
        floor text DEFAULT '',
        room text DEFAULT '',
        asset_id varchar REFERENCES assets(id),
        reported_by varchar REFERENCES users(id),
        assigned_to varchar REFERENCES users(id),
        due_date timestamp,
        internal_notes text DEFAULT '',
        vendor_reference text DEFAULT '',
        vendor_contacted_at timestamp,
        vendor_expected_follow_up_at timestamp,
        root_cause text DEFAULT '',
        resolution_summary text DEFAULT '',
        is_recurring boolean NOT NULL DEFAULT false,
        is_patient_impacting boolean NOT NULL DEFAULT false,
        is_repeat_issue boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);

    const ticketFollowUpColumns = [
      { col: "vendor_contacted_at", def: "timestamp" },
      { col: "vendor_expected_follow_up_at", def: "timestamp" },
    ];
    for (const { col, def } of ticketFollowUpColumns) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE tickets ADD COLUMN ${col} ${def};
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        ticket_id varchar NOT NULL REFERENCES tickets(id),
        type text NOT NULL,
        content text DEFAULT '',
        created_by varchar REFERENCES users(id),
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_requests (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        request_type text DEFAULT '',
        item_name text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        urgency ticket_priority NOT NULL DEFAULT 'normal',
        department_id varchar REFERENCES departments(id),
        justification text DEFAULT '',
        status supply_request_status NOT NULL DEFAULT 'pending',
        requested_by varchar REFERENCES users(id),
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS facility_requests (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        request_type facility_request_type NOT NULL DEFAULT 'other',
        title text NOT NULL,
        description text DEFAULT '',
        location text DEFAULT '',
        building text DEFAULT '',
        floor text DEFAULT '',
        room text DEFAULT '',
        priority ticket_priority NOT NULL DEFAULT 'normal',
        status ticket_status NOT NULL DEFAULT 'new',
        requested_by varchar REFERENCES users(id),
        assigned_to varchar REFERENCES users(id),
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        name text NOT NULL,
        service_type text DEFAULT '',
        phone text DEFAULT '',
        email text DEFAULT '',
        emergency_contact text DEFAULT '',
        contract_notes text DEFAULT '',
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE notification_type AS ENUM ('ticket_created','ticket_assigned','ticket_status_changed','ticket_note_added','ticket_escalated','ticket_overdue','supply_request_update','facility_request_update');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE org_plan AS ENUM ('free','pro','pro_plus','enterprise','unlimited');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);


    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN plan org_plan NOT NULL DEFAULT 'free';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN stripe_customer_id text;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN stripe_subscription_id text;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN plan_expires_at timestamp;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN subscription_status text;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN last_stripe_event_id text;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN last_stripe_event_created integer;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    const operatorOsUserCols = [
      { col: "operatoros_user_id", def: "text" },
      { col: "operatoros_role", def: "text" },
      { col: "operatoros_plan_slug", def: "text" },
      { col: "operatoros_org_id", def: "text" },
      { col: "last_sso_at", def: "timestamp" },
    ];
    for (const { col, def } of operatorOsUserCols) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE users ADD COLUMN ${col} ${def};
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_operatoros_user_id
        ON users(operatoros_user_id) WHERE operatoros_user_id IS NOT NULL;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE orgs ADD COLUMN operatoros_org_id text;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_operatoros_org_id
        ON orgs(operatoros_org_id) WHERE operatoros_org_id IS NOT NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operatoros_entitlement_snapshots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        operatoros_user_id text NOT NULL,
        operatoros_tenant_id text NOT NULL,
        local_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        local_org_id varchar REFERENCES orgs(id) ON DELETE SET NULL,
        module_slug text NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        access_level text NOT NULL DEFAULT 'none',
        module_role text NOT NULL DEFAULT 'none',
        tenant_role text,
        tenant_role_alias text,
        subscription_status text,
        features jsonb NOT NULL DEFAULT '{}'::jsonb,
        raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        computed_at timestamp NOT NULL,
        received_at timestamp NOT NULL DEFAULT now(),
        revoked_at timestamp
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_operatoros_entitlement_snapshots_unique
        ON operatoros_entitlement_snapshots(operatoros_user_id, operatoros_tenant_id, module_slug);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_operatoros_entitlement_snapshots_local_user
        ON operatoros_entitlement_snapshots(local_user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_operatoros_entitlement_snapshots_local_org
        ON operatoros_entitlement_snapshots(local_org_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_operatoros_entitlement_snapshots_computed_at
        ON operatoros_entitlement_snapshots(computed_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        user_id varchar NOT NULL REFERENCES users(id),
        type notification_type NOT NULL,
        title text NOT NULL,
        message text NOT NULL,
        ticket_id varchar REFERENCES tickets(id),
        read boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE onboarding_status AS ENUM ('pending','in_progress','complete','skipped');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_items (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        title text NOT NULL,
        description text DEFAULT '',
        route text DEFAULT '',
        sort_order integer NOT NULL DEFAULT 0,
        status onboarding_status NOT NULL DEFAULT 'pending',
        completion_source text DEFAULT 'manual',
        completed_by varchar REFERENCES users(id),
        completed_at timestamp,
        dismissed_at timestamp,
        auto_complete_key text,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ticket_source AS ENUM ('manual','email');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tickets ADD COLUMN source ticket_source NOT NULL DEFAULT 'manual';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE inbound_email_status AS ENUM ('accepted','rejected','failed','threaded','created');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_settings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id) UNIQUE,
        inbound_alias text NOT NULL UNIQUE,
        enabled boolean NOT NULL DEFAULT true,
        default_department_id varchar REFERENCES departments(id),
        default_assignee_id varchar REFERENCES users(id),
        allowed_sender_domains text[],
        auto_create_contacts boolean NOT NULL DEFAULT true,
        append_replies_to_tickets boolean NOT NULL DEFAULT true,
        unknown_sender_action text NOT NULL DEFAULT 'create_ticket',
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_contacts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        email text NOT NULL,
        name text DEFAULT '',
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_email_contacts_org_email
        ON email_contacts(org_id, email);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inbound_email_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar REFERENCES orgs(id),
        message_id text,
        from_email text NOT NULL,
        from_name text DEFAULT '',
        to_address text NOT NULL,
        subject text DEFAULT '',
        body_plain text DEFAULT '',
        body_html text DEFAULT '',
        in_reply_to text,
        references_header text,
        headers jsonb,
        attachment_count integer NOT NULL DEFAULT 0,
        spf_result text,
        dkim_result text,
        dmarc_result text,
        status inbound_email_status NOT NULL,
        status_reason text DEFAULT '',
        ticket_id varchar REFERENCES tickets(id),
        provider text DEFAULT 'mock',
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_email_metadata (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id varchar NOT NULL REFERENCES tickets(id),
        org_id varchar NOT NULL REFERENCES orgs(id),
        message_id text,
        in_reply_to text,
        references_header text,
        from_email text NOT NULL,
        from_name text DEFAULT '',
        original_subject text DEFAULT '',
        contact_id varchar REFERENCES email_contacts(id),
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inbound_email_log_org ON inbound_email_log(org_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inbound_email_log_message_id ON inbound_email_log(message_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_email_metadata_ticket ON ticket_email_metadata(ticket_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_email_metadata_message_id ON ticket_email_metadata(message_id);
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE connector_provider AS ENUM ('google','microsoft','imap','forwarding');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE connector_status AS ENUM ('active','error','disabled','pending_auth');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE connector_event_type AS ENUM ('poll_success','poll_error','auth_success','auth_error','disabled','enabled','config_changed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mail_connectors (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL REFERENCES orgs(id),
        provider connector_provider NOT NULL,
        label text NOT NULL DEFAULT '',
        status connector_status NOT NULL DEFAULT 'pending_auth',
        email_address text,
        credentials_encrypted text,
        imap_host text,
        imap_port integer DEFAULT 993,
        imap_tls boolean NOT NULL DEFAULT true,
        imap_folder text DEFAULT 'INBOX',
        poll_interval_seconds integer DEFAULT 120,
        last_polled_at timestamp,
        last_error text,
        consecutive_failures integer NOT NULL DEFAULT 0,
        emails_processed integer NOT NULL DEFAULT 0,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_connectors_org ON mail_connectors(org_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_connectors_provider ON mail_connectors(provider);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mail_connectors_status ON mail_connectors(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        connector_id varchar NOT NULL REFERENCES mail_connectors(id),
        org_id varchar NOT NULL REFERENCES orgs(id),
        event_type connector_event_type NOT NULL,
        message text DEFAULT '',
        metadata jsonb,
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_connector_events_connector ON connector_events(connector_id);
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE inbound_email_log ADD COLUMN connector_id varchar REFERENCES mail_connectors(id);
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    const imapColumns = [
      { col: "imap_host", def: "text" },
      { col: "imap_port", def: "integer DEFAULT 993" },
      { col: "imap_user", def: "text" },
      { col: "imap_password_encrypted", def: "text" },
      { col: "imap_tls", def: "boolean NOT NULL DEFAULT true" },
      { col: "imap_enabled", def: "boolean NOT NULL DEFAULT false" },
      { col: "imap_last_polled_at", def: "timestamp" },
      { col: "imap_last_error", def: "text" },
      { col: "imap_poll_interval_seconds", def: "integer DEFAULT 120" },
      { col: "imap_folder", def: "text DEFAULT 'INBOX'" },
      { col: "imap_consecutive_failures", def: "integer NOT NULL DEFAULT 0" },
      { col: "imap_emails_processed", def: "integer NOT NULL DEFAULT 0" },
    ];
    for (const { col, def } of imapColumns) {
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE email_settings ADD COLUMN ${col} ${def};
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE email_settings ADD COLUMN imap_migrated_to_connector boolean NOT NULL DEFAULT false;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    const legacyImap = await client.query(`
      SELECT es.org_id, es.imap_host, es.imap_port, es.imap_user, es.imap_password_encrypted,
             es.imap_tls, es.imap_enabled, es.imap_folder, es.imap_poll_interval_seconds,
             es.imap_last_polled_at, es.imap_last_error, es.imap_consecutive_failures, es.imap_emails_processed
      FROM email_settings es
      WHERE es.imap_host IS NOT NULL
        AND es.imap_user IS NOT NULL
        AND es.imap_password_encrypted IS NOT NULL
        AND es.imap_migrated_to_connector = false
    `);

    for (const row of legacyImap.rows) {
      const existing = await client.query(
        `SELECT 1 FROM mail_connectors WHERE org_id = $1 AND provider = 'imap' AND label = 'Legacy IMAP'`,
        [row.org_id]
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE email_settings SET imap_migrated_to_connector = true WHERE org_id = $1`,
          [row.org_id]
        );
        continue;
      }

      let connectorCredentials: string;
      try {
        const legacyPassword = decryptSecret(row.imap_password_encrypted);
        connectorCredentials = encryptSecret(JSON.stringify({
          imapUser: row.imap_user,
          imapPassword: legacyPassword,
        }));
      } catch (err: any) {
        console.error(`[migration] Failed to re-encrypt IMAP credentials for org ${row.org_id}: ${err.message}`);
        continue;
      }

      await client.query(`
        INSERT INTO mail_connectors (org_id, provider, label, status, email_address, credentials_encrypted,
          imap_host, imap_port, imap_tls, imap_folder, poll_interval_seconds, last_polled_at, last_error,
          consecutive_failures, emails_processed, enabled)
        VALUES ($1, 'imap', 'Legacy IMAP', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        row.org_id,
        row.imap_enabled ? 'active' : 'disabled',
        row.imap_user,
        connectorCredentials,
        row.imap_host,
        row.imap_port || 993,
        row.imap_tls !== false,
        row.imap_folder || 'INBOX',
        row.imap_poll_interval_seconds || 120,
        row.imap_last_polled_at || null,
        row.imap_last_error || null,
        row.imap_consecutive_failures || 0,
        row.imap_emails_processed || 0,
        row.imap_enabled || false,
      ]);

      await client.query(
        `UPDATE email_settings SET imap_migrated_to_connector = true WHERE org_id = $1`,
        [row.org_id]
      );

      console.log(`[migration] Migrated legacy IMAP config for org ${row.org_id} to mail_connectors`);
    }

    await client.query("COMMIT");
    console.log("Schema verification complete - all tables ensured.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Schema migration error:", err);
    throw err;
  } finally {
    client.release();
  }
}
