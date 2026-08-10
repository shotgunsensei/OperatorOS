import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function ensurePulseDeskLiteralTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pulsedesk_mail_connectors (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      provider TEXT NOT NULL CHECK (provider IN ('sendgrid','imap','google','microsoft')),
      label TEXT NOT NULL CHECK (char_length(label) BETWEEN 2 AND 120),
      inbound_alias TEXT NOT NULL UNIQUE CHECK (inbound_alias ~ '^[a-z0-9][a-z0-9-]{7,63}$'),
      mailbox_address TEXT,
      mode TEXT NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled','test','live')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','degraded','disabled','revoked')),
      public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      secret_reference_id VARCHAR(36) REFERENCES shared_secret_references(id) ON DELETE SET NULL,
      oauth_state_hash TEXT,
      oauth_state_expires_at TIMESTAMP,
      last_polled_at TIMESTAMP,
      last_success_at TIMESTAMP,
      last_error_code TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_connectors_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_connectors_tenant_provider_mailbox
      ON pulsedesk_mail_connectors(tenant_id, provider, lower(COALESCE(mailbox_address, label))) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_connectors_poll
      ON pulsedesk_mail_connectors(status, last_polled_at) WHERE status IN ('active','degraded') AND revoked_at IS NULL;

    CREATE TABLE IF NOT EXISTS pulsedesk_connector_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      connector_id VARCHAR(36) NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('configured','oauth_started','oauth_completed','tested','poll_queued','ingested','duplicate','failed','disabled','revoked')),
      safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_code TEXT,
      actor_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_connector_events_connector_fk FOREIGN KEY (tenant_id, connector_id)
        REFERENCES pulsedesk_mail_connectors(tenant_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_connector_events_tenant_connector
      ON pulsedesk_connector_events(tenant_id, connector_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS pulsedesk_inbound_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      connector_id VARCHAR(36) NOT NULL,
      provider TEXT NOT NULL,
      message_id TEXT NOT NULL CHECK (char_length(message_id) BETWEEN 3 AND 512),
      sender_hash TEXT NOT NULL CHECK (char_length(sender_hash) = 64),
      subject_summary TEXT NOT NULL CHECK (char_length(subject_summary) BETWEEN 5 AND 160),
      attachment_count INTEGER NOT NULL DEFAULT 0 CHECK (attachment_count BETWEEN 0 AND 20),
      scan_status TEXT NOT NULL DEFAULT 'clean' CHECK (scan_status IN ('clean','pending','rejected','infected')),
      status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','duplicate','rejected','processed','dead_letter')),
      ticket_id VARCHAR(36),
      received_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP,
      safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT pulsedesk_inbound_connector_fk FOREIGN KEY (tenant_id, connector_id)
        REFERENCES pulsedesk_mail_connectors(tenant_id, id),
      CONSTRAINT pulsedesk_inbound_ticket_fk FOREIGN KEY (tenant_id, ticket_id)
        REFERENCES pulsedesk_requests(tenant_id, id) ON DELETE SET NULL,
      CONSTRAINT uq_pulsedesk_inbound_message UNIQUE (tenant_id, provider, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_inbound_status ON pulsedesk_inbound_messages(tenant_id, status, received_at DESC);

    CREATE TABLE IF NOT EXISTS pulsedesk_public_intake_policies (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      public_slug TEXT NOT NULL UNIQUE CHECK (public_slug ~ '^[a-z0-9][a-z0-9-]{7,63}$'),
      directory_site_id VARCHAR(36),
      asset_id VARCHAR(36),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      max_requests_per_hour INTEGER NOT NULL DEFAULT 10 CHECK (max_requests_per_hour BETWEEN 1 AND 100),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_intake_site_fk FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT pulsedesk_intake_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES pulsedesk_assets(tenant_id, id),
      CONSTRAINT uq_pulsedesk_intake_policy_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS pulsedesk_public_intake_windows (
      policy_id VARCHAR(36) NOT NULL REFERENCES pulsedesk_public_intake_policies(id) ON DELETE CASCADE,
      client_hash TEXT NOT NULL,
      window_start TIMESTAMP NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (policy_id, client_hash, window_start)
    );
  `);
}
