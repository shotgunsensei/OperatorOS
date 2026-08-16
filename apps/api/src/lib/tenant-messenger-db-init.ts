import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v53: durable, tenant-owned instant messaging.
 *
 * The composite tenant/conversation keys are deliberate. They make it
 * impossible for a message, participant, reply, or audit event to point at a
 * conversation in another tenant even if an application predicate regresses.
 * User deletion preserves the remaining participants' history by nulling the
 * user reference while retaining the display-name snapshot.
 */
export async function ensureTenantMessengerTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS tenant_messenger_conversations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      kind VARCHAR(12) NOT NULL,
      direct_key VARCHAR(80),
      title VARCHAR(120),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      last_message_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tenant_messenger_conversation_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tenant_messenger_conversation_kind_check CHECK (kind IN ('direct','group')),
      CONSTRAINT tenant_messenger_conversation_shape_check CHECK (
        (kind='direct' AND direct_key IS NOT NULL AND title IS NULL)
        OR (kind='group' AND direct_key IS NULL)
      ),
      CONSTRAINT tenant_messenger_conversation_version_check CHECK (version > 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_messenger_direct_key
      ON tenant_messenger_conversations(tenant_id, direct_key)
      WHERE direct_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_conversations_recent
      ON tenant_messenger_conversations(tenant_id, last_message_at DESC NULLS LAST, updated_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS tenant_messenger_participants (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      conversation_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      display_name_snapshot VARCHAR(160) NOT NULL,
      role VARCHAR(12) NOT NULL DEFAULT 'member',
      muted BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_read_at TIMESTAMPTZ,
      hidden_at TIMESTAMPTZ,
      left_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tenant_messenger_participant_role_check CHECK (role IN ('owner','member')),
      CONSTRAINT tenant_messenger_participant_conversation_fk
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES tenant_messenger_conversations(tenant_id, id)
        ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_messenger_participant_user
      ON tenant_messenger_participants(tenant_id, conversation_id, user_id)
      WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_participants_user
      ON tenant_messenger_participants(tenant_id, user_id, hidden_at, left_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_participants_conversation
      ON tenant_messenger_participants(tenant_id, conversation_id, user_id);

    CREATE TABLE IF NOT EXISTS tenant_messenger_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      conversation_id VARCHAR(36) NOT NULL,
      sender_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      sender_name_snapshot VARCHAR(160) NOT NULL,
      client_message_id VARCHAR(80) NOT NULL,
      request_hash VARCHAR(64) NOT NULL,
      reply_to_message_id VARCHAR(36),
      body TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      edited_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tenant_messenger_message_tenant_conversation_id
        UNIQUE (tenant_id, conversation_id, id),
      CONSTRAINT tenant_messenger_message_conversation_fk
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES tenant_messenger_conversations(tenant_id, id)
        ON DELETE CASCADE,
      CONSTRAINT tenant_messenger_message_reply_fk
        FOREIGN KEY (tenant_id, conversation_id, reply_to_message_id)
        REFERENCES tenant_messenger_messages(tenant_id, conversation_id, id),
      CONSTRAINT tenant_messenger_message_body_check CHECK (
        (deleted_at IS NULL AND body IS NOT NULL AND char_length(btrim(body)) BETWEEN 1 AND 4000)
        OR (deleted_at IS NOT NULL AND body IS NULL)
      ),
      CONSTRAINT tenant_messenger_message_version_check CHECK (version > 0),
      CONSTRAINT tenant_messenger_client_id_check CHECK (
        client_message_id ~ '^[A-Za-z0-9._:-]{8,80}$'
      ),
      CONSTRAINT tenant_messenger_request_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$')
    );
    ALTER TABLE tenant_messenger_messages ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);
    UPDATE tenant_messenger_messages
    SET request_hash=md5(conversation_id || ':' || client_message_id || ':' || COALESCE(body,''))
      || md5(tenant_id || ':' || client_message_id || ':' || COALESCE(reply_to_message_id,''))
    WHERE request_hash IS NULL;
    ALTER TABLE tenant_messenger_messages ALTER COLUMN request_hash SET NOT NULL;
    DO $$ BEGIN
      ALTER TABLE tenant_messenger_messages ADD CONSTRAINT tenant_messenger_request_hash_check
        CHECK (request_hash ~ '^[0-9a-f]{64}$');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_messenger_message_idempotency
      ON tenant_messenger_messages(tenant_id, sender_user_id, client_message_id)
      WHERE sender_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_messages_timeline
      ON tenant_messenger_messages(tenant_id, conversation_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_messages_sender_rate
      ON tenant_messenger_messages(tenant_id, sender_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS tenant_messenger_presence (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id VARCHAR(80),
      status VARCHAR(12) NOT NULL DEFAULT 'offline',
      active_until TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, user_id),
      CONSTRAINT tenant_messenger_presence_status_check CHECK (status IN ('online','offline'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_presence_active
      ON tenant_messenger_presence(tenant_id, active_until DESC, user_id);

    CREATE TABLE IF NOT EXISTS tenant_messenger_presence_connections (
      tenant_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      connection_id VARCHAR(80) NOT NULL,
      active_until TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, user_id, connection_id),
      CONSTRAINT tenant_messenger_presence_connection_user_fk
        FOREIGN KEY (tenant_id, user_id)
        REFERENCES tenant_messenger_presence(tenant_id, user_id)
        ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_presence_connections_active
      ON tenant_messenger_presence_connections(tenant_id, user_id, active_until DESC);

    CREATE TABLE IF NOT EXISTS tenant_messenger_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      conversation_id VARCHAR(36) NOT NULL,
      message_id VARCHAR(36),
      actor_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(80) NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      correlation_id VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT tenant_messenger_event_conversation_fk
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES tenant_messenger_conversations(tenant_id, id)
        ON DELETE CASCADE,
      CONSTRAINT tenant_messenger_event_message_fk
        FOREIGN KEY (tenant_id, conversation_id, message_id)
        REFERENCES tenant_messenger_messages(tenant_id, conversation_id, id),
      CONSTRAINT tenant_messenger_event_metadata_check CHECK (jsonb_typeof(metadata_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_messenger_events_conversation
      ON tenant_messenger_events(tenant_id, conversation_id, created_at DESC, id DESC);

    -- Repair the constraint shape for any disposable/pre-release database
    -- that applied an earlier v53 draft before the composite keys landed.
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='tenant_messenger_messages'::regclass
          AND conname='tenant_messenger_message_reply_fk'
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (tenant_id, conversation_id, reply_to_message_id)%'
      ) THEN
        ALTER TABLE tenant_messenger_messages DROP CONSTRAINT IF EXISTS tenant_messenger_message_reply_fk;
        ALTER TABLE tenant_messenger_messages ADD CONSTRAINT tenant_messenger_message_reply_fk
          FOREIGN KEY (tenant_id, conversation_id, reply_to_message_id)
          REFERENCES tenant_messenger_messages(tenant_id, conversation_id, id);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='tenant_messenger_events'::regclass
          AND conname='tenant_messenger_event_message_fk'
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (tenant_id, conversation_id, message_id)%'
      ) THEN
        ALTER TABLE tenant_messenger_events DROP CONSTRAINT IF EXISTS tenant_messenger_event_message_fk;
        ALTER TABLE tenant_messenger_events ADD CONSTRAINT tenant_messenger_event_message_fk
          FOREIGN KEY (tenant_id, conversation_id, message_id)
          REFERENCES tenant_messenger_messages(tenant_id, conversation_id, id);
      END IF;
    END $$;
  `));
}
