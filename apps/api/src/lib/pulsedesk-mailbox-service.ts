import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { db } from '../db.js';
import {
  createMailboxOAuthRequest, mailboxAddress, mailboxProvider, parseMailboxApplication,
  PulseDeskMailboxError, validateMailboxCredentials,
  type MailboxCursor, type PulseDeskMailboxProvider, type createPulseDeskMailboxAdapter,
} from './pulsedesk-mailbox-adapter.js';
import {
  resolveMailboxSecret, revokeMailboxSecret, storeMailboxSecret,
  type PulseDeskMailboxVaultPort,
} from './pulsedesk-mailbox-vault.js';

type Executor = Pick<typeof db, 'execute'>;
type Database = Executor & Pick<typeof db, 'transaction'>;
type Adapter = ReturnType<typeof createPulseDeskMailboxAdapter>;
export interface PulseDeskMailboxContext { tenantId: string; actorUserId: string }
interface Connector {
  id: string; tenant_id: string; provider: PulseDeskMailboxProvider; mailbox_address: string;
  status: string; secret_reference_id: string | null; version: number;
  public_config: Record<string,unknown>; created_by_user_id: string;
  oauth_state_hash: string | null; oauth_state_expires_at: unknown;
}
interface Application {
  id: string; version: number; clientId: string; clientSecret: string;
}
interface ServiceDependencies {
  database: Database;
  vault(executor: Executor): PulseDeskMailboxVaultPort;
  resolveApplicationSecret(input: { tenantId: string; moduleId: string | null; purpose: string; id: string }, executor: Executor): Promise<string | null>;
  ready(): boolean;
  authorize(context: PulseDeskMailboxContext): Promise<void>;
  adapter(): Adapter;
  ingest(input: { connector: Connector; body: Record<string,unknown>; eventUserId: string | null }, executor: Executor): Promise<{ statusCode: number; payload: unknown }>;
  now?: () => number;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function config(value: unknown): Record<string,unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
export function publicMailboxConfiguration(value: unknown) {
  const source = config(value);
  return { operationsOnly: source.operationsOnly === true, sharedProviderConfigId: typeof source.sharedProviderConfigId === 'string' ? source.sharedProviderConfigId : null };
}
export function mailboxCallbackUri(origin: unknown): string {
  // Both are existing OperatorOS UI locations, never an arbitrary caller URL.
  if (origin === 'https://pulsedesk.operatoros.net') return origin + '/integrations';
  if (origin === 'https://operatoros.net') return origin + '/app/pulsedesk/integrations';
  throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_ORIGIN_INVALID');
}

export function createPulseDeskMailboxService(dependencies: ServiceDependencies) {
  const now = dependencies.now ?? Date.now;
  const database = dependencies.database;
  const requireReady = () => { if (!dependencies.ready()) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_DEPENDENCIES_UNAVAILABLE'); };
  async function load(context: PulseDeskMailboxContext, id: string, executor: Executor, lock = false): Promise<Connector> {
    if (!idPattern.test(id)) throw new PulseDeskMailboxError('PULSEDESK_CONNECTOR_NOT_FOUND');
    const rows = await executor.execute(sql`SELECT * FROM pulsedesk_mail_connectors
      WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL
        AND mode='live' AND provider IN ('google','microsoft') ${lock ? sql`FOR UPDATE` : sql``}`);
    const row = rows.rows[0] as unknown as Connector | undefined;
    if (!row) throw new PulseDeskMailboxError('PULSEDESK_CONNECTOR_NOT_FOUND');
    mailboxProvider(row.provider); mailboxAddress(row.mailbox_address);
    row.public_config = config(row.public_config);
    if (row.public_config.operationsOnly !== true) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_OPERATIONS_ACK_REQUIRED');
    return row;
  }
  async function application(context: PulseDeskMailboxContext, provider: PulseDeskMailboxProvider, executor: Executor, expectedId?: string): Promise<Application> {
    const rows = await executor.execute(sql`SELECT config.id,config.version,config.secret_reference_id,config.module_id,module.id AS mailbox_module_id
      FROM shared_provider_configs config JOIN modules module ON module.slug='pulsedesk'
      JOIN shared_secret_references secret
        ON secret.tenant_id=config.tenant_id AND secret.id=config.secret_reference_id
      WHERE config.tenant_id=${context.tenantId} AND config.provider_key=${`pulsedesk.${provider}`}
        AND config.provider_kind='oauth' AND config.mode='live' AND config.callback_ready=TRUE
        AND (config.module_id IS NULL OR config.module_id=module.id)
        AND secret.revoked_at IS NULL
        AND secret.purpose=${`provider:oauth:pulsedesk.${provider}`}
        AND secret.module_id IS NOT DISTINCT FROM config.module_id
        AND (${expectedId ?? null}::text IS NULL OR config.id=${expectedId ?? null}) LIMIT 1`);
    const row = rows.rows[0] as { id: string; version: number; secret_reference_id: string; module_id: string | null; mailbox_module_id: string } | undefined;
    if (!row || !idPattern.test(row.mailbox_module_id) || (row.module_id !== null && row.module_id !== row.mailbox_module_id)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_UNAVAILABLE');
    const secret = await dependencies.resolveApplicationSecret({ tenantId: context.tenantId, id: row.secret_reference_id, moduleId: row.module_id, purpose: `provider:oauth:pulsedesk.${provider}` }, executor);
    if (!secret) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_UNAVAILABLE');
    return { id: row.id, version: row.version, ...parseMailboxApplication(secret) };
  }
  async function event(context: PulseDeskMailboxContext, connectorId: string, type: string, executor: Executor, errorCode: string | null = null) {
    await executor.execute(sql`INSERT INTO pulsedesk_connector_events
      (tenant_id,connector_id,event_type,actor_user_id,safe_metadata,error_code)
      VALUES (${context.tenantId},${connectorId},${type},${context.actorUserId},${{ adapter: 'oauth-imap' }},${errorCode})`);
  }
  const scope = (context: PulseDeskMailboxContext, connector: Connector, kind: 'pending' | 'credentials') => ({ tenantId: context.tenantId, connectorId: connector.id, provider: connector.provider, kind });
  function leaseActive(connector: Connector) {
    const lease = config(connector.public_config.pollLease);
    return typeof lease.expiresAt === 'number' && lease.expiresAt > now();
  }
  async function currentLease(context: PulseDeskMailboxContext, id: string, leaseId: string, executor: Executor, lock = true) {
    const connector = await load(context, id, executor, lock);
    const lease = config(connector.public_config.pollLease);
    if (lease.id !== leaseId || typeof lease.expiresAt !== 'number' || lease.expiresAt <= now()) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_GENERATION_CHANGED');
    return connector;
  }
  async function fail(context: PulseDeskMailboxContext, id: string, code: string, version?: number, leaseId?: string) {
    await database.transaction(async executor => {
      let connector: Connector;
      try { connector = await load(context, id, executor, true); } catch { return; }
      if ((version !== undefined && connector.version !== version) || (leaseId && config(connector.public_config.pollLease).id !== leaseId)) return;
      const next = { ...connector.public_config }; delete next.pollLease;
      await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET status='degraded',public_config=${next},last_error_code=${code},consecutive_failures=consecutive_failures+1,updated_at=NOW(),version=version+1 WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
      await event(context, id, 'failed', executor, code);
    });
  }
  return {
    async validateConfiguration(context: PulseDeskMailboxContext, providerValue: unknown, address: unknown) {
      requireReady(); await dependencies.authorize(context); const provider = mailboxProvider(providerValue); const mailbox = mailboxAddress(address);
      const app = await application(context, provider, database);
      return { provider, mailbox, publicConfig: { operationsOnly: true, sharedProviderConfigId: app.id } };
    },
    async start(context: PulseDeskMailboxContext, id: string, origin: unknown) {
      requireReady(); const redirectUri = mailboxCallbackUri(origin);
      await dependencies.authorize(context);
      return database.transaction(async executor => {
        const connector = await load(context, id, executor, true);
        if (leaseActive(connector)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_POLL_BUSY');
        const app = await application(context, connector.provider, executor, String(connector.public_config.sharedProviderConfigId ?? ''));
        const oauth = createMailboxOAuthRequest({ provider: connector.provider, mailbox: connector.mailbox_address, clientId: app.clientId, redirectUri });
        const vault = dependencies.vault(executor);
        if (typeof connector.public_config.oauthPendingSecretReferenceId === 'string') await revokeMailboxSecret(vault, scope(context,connector,'pending'), connector.public_config.oauthPendingSecretReferenceId);
        const expiresAt = now() + 10 * 60_000;
        const referenceId = await storeMailboxSecret(vault, scope(context,connector,'pending'), context.actorUserId, {
          actorUserId: context.actorUserId, stateHash: digest(oauth.state), verifier: oauth.verifier, redirectUri,
          applicationId: app.id, applicationVersion: app.version, expiresAt,
        });
        const next: Record<string,unknown> = { ...connector.public_config, oauthPendingSecretReferenceId: referenceId };
        delete next.pollLease;
        await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET status='pending',public_config=${next},oauth_state_hash=${digest(oauth.state)},oauth_state_expires_at=${new Date(expiresAt)},updated_at=NOW(),version=version+1 WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
        await event(context,id,'oauth_started',executor);
        return { authorizationUrl: oauth.authorizationUrl, expiresAt: new Date(expiresAt).toISOString() };
      });
    },
    async complete(context: PulseDeskMailboxContext, id: string, input: { state: unknown; code: unknown }) {
      requireReady();
      if (typeof input.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(input.state) || typeof input.code !== 'string' || !input.code || input.code.length > 4_096) throw new PulseDeskMailboxError('PULSEDESK_OAUTH_STATE_INVALID');
      await dependencies.authorize(context);
      const claimed = await database.transaction(async executor => {
        const connector = await load(context,id,executor,true);
        const pendingId = connector.public_config.oauthPendingSecretReferenceId;
        const stateExpiry = connector.oauth_state_expires_at ? new Date(String(connector.oauth_state_expires_at)).getTime() : Number.NaN;
        if (connector.oauth_state_hash !== digest(input.state as string) || !Number.isFinite(stateExpiry) || stateExpiry <= now() || typeof pendingId !== 'string') throw new PulseDeskMailboxError('PULSEDESK_OAUTH_STATE_INVALID');
        const vault = dependencies.vault(executor);
        const pending = await resolveMailboxSecret(vault,scope(context,connector,'pending'),pendingId);
        if (pending.actorUserId !== context.actorUserId || pending.stateHash !== connector.oauth_state_hash || typeof pending.expiresAt !== 'number' || pending.expiresAt <= now() || typeof pending.verifier !== 'string' || typeof pending.redirectUri !== 'string' || typeof pending.applicationId !== 'string') throw new PulseDeskMailboxError('PULSEDESK_OAUTH_STATE_INVALID');
        const app = await application(context,connector.provider,executor,pending.applicationId);
        if (app.version !== pending.applicationVersion) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_CHANGED');
        await revokeMailboxSecret(vault,scope(context,connector,'pending'),pendingId);
        const next = { ...connector.public_config }; delete next.oauthPendingSecretReferenceId;
        await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET public_config=${next},oauth_state_hash=NULL,oauth_state_expires_at=NULL,version=version+1,updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
        return { connector, pending, app, version: connector.version + 1 };
      });
      try {
        await dependencies.authorize(context);
        const adapter = dependencies.adapter();
        const credentials = await adapter.exchange({ provider: claimed.connector.provider, application: claimed.app, code: input.code as string, verifier: claimed.pending.verifier as string, redirectUri: claimed.pending.redirectUri as string });
        await dependencies.authorize(context);
        const current = await load(context,id,database);
        if (current.version !== claimed.version || current.oauth_state_hash) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_GENERATION_CHANGED');
        await adapter.verify({ provider: claimed.connector.provider, mailbox: claimed.connector.mailbox_address, credentials });
        await dependencies.authorize(context);
        await database.transaction(async executor => {
          const connector = await load(context,id,executor,true);
          if (connector.version !== claimed.version || connector.oauth_state_hash) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_GENERATION_CHANGED');
          const currentApp = await application(context,connector.provider,executor,claimed.app.id);
          if(currentApp.version !== claimed.app.version || currentApp.clientId !== claimed.app.clientId) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_CHANGED');
          const vault = dependencies.vault(executor);
          const referenceId = await storeMailboxSecret(vault,scope(context,connector,'credentials'),context.actorUserId,{ ...credentials, applicationId: claimed.app.id, applicationClientId: claimed.app.clientId });
          if (connector.secret_reference_id) await revokeMailboxSecret(vault,scope(context,connector,'credentials'),connector.secret_reference_id);
          const next = { operationsOnly: true, sharedProviderConfigId: claimed.app.id };
          await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET status='active',public_config=${next},secret_reference_id=${referenceId},last_error_code=NULL,consecutive_failures=0,last_success_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
          await event(context,id,'oauth_completed',executor);
        });
        return { connected: true, provider: claimed.connector.provider };
      } catch (error) {
        const code = error instanceof PulseDeskMailboxError ? error.code : 'PULSEDESK_MAILBOX_CONNECTION_FAILED';
        await fail(context,id,code,claimed.version); throw new PulseDeskMailboxError(code);
      }
    },
    async poll(context: PulseDeskMailboxContext, id: string) {
      requireReady();
      await dependencies.authorize(context);
      const leaseId = randomBytes(24).toString('hex');
      const initial = await database.transaction(async executor => {
        const connector = await load(context,id,executor,true);
        if (!connector.secret_reference_id || !['active','degraded'].includes(connector.status)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_NOT_AUTHORIZED');
        if (leaseActive(connector)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_POLL_BUSY');
        const next = { ...connector.public_config, pollLease: { id: leaseId, expiresAt: now() + 120_000 } };
        await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET public_config=${next},last_polled_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
        return connector;
      });
      try {
        const app = await application(context,initial.provider,database,String(initial.public_config.sharedProviderConfigId ?? ''));
        const payload = await resolveMailboxSecret(dependencies.vault(database),scope(context,initial,'credentials'),initial.secret_reference_id!);
        if (payload.applicationId !== app.id || payload.applicationClientId !== app.clientId) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_CHANGED');
        await dependencies.authorize(context);
        const adapter = dependencies.adapter(); let credentials = validateMailboxCredentials(payload);
        if (credentials.expiresAt <= now() + 60_000) {
          credentials = await adapter.refresh({ provider: initial.provider, application: app, credentials });
          await dependencies.authorize(context);
          await database.transaction(async executor => {
            const connector = await currentLease(context,id,leaseId,executor);
            const referenceId = await storeMailboxSecret(dependencies.vault(executor),scope(context,connector,'credentials'),context.actorUserId,{ ...credentials, applicationId: app.id, applicationClientId: app.clientId });
            if (connector.secret_reference_id) await revokeMailboxSecret(dependencies.vault(executor),scope(context,connector,'credentials'),connector.secret_reference_id);
            await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET secret_reference_id=${referenceId},version=version+1,updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
          });
        }
        let connector = await currentLease(context,id,leaseId,database,false);
        const previousAcknowledgements = connector.public_config.pendingAcknowledgements;
        if (Array.isArray(previousAcknowledgements) && previousAcknowledgements.length) {
          if (previousAcknowledgements.some(value=>typeof value!=='number')) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CURSOR_INVALID');
          const previousCursor=config(connector.public_config.mailboxCursor);
          if(typeof previousCursor.uidValidity!=='string') throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CURSOR_INVALID');
          let resetCursor=false;
          await dependencies.authorize(context);
          try { await adapter.acknowledge({ provider:connector.provider,mailbox:connector.mailbox_address,credentials,uids:previousAcknowledgements as number[],uidValidity:previousCursor.uidValidity }); }
          catch(error) { if(!(error instanceof PulseDeskMailboxError)||error.code!=='PULSEDESK_MAILBOX_UIDVALIDITY_CHANGED')throw error;resetCursor=true; }
          await dependencies.authorize(context);
          await database.transaction(async executor=>{ const current=await currentLease(context,id,leaseId,executor); const next={...current.public_config};delete next.pendingAcknowledgements;
            if(resetCursor)delete next.mailboxCursor;
            await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET public_config=${next},updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
          });
        }
        connector = await currentLease(context,id,leaseId,database,false);
        await dependencies.authorize(context);
        const cursor = config(connector.public_config.mailboxCursor);
        const batch = await adapter.read({ provider:connector.provider,mailbox:connector.mailbox_address,credentials,connectorId:id,
          cursor: typeof cursor.uidValidity==='string' && typeof cursor.lastUid==='number' ? cursor as unknown as MailboxCursor : null });
        const acknowledgements: number[] = [];
        await dependencies.authorize(context);
        await database.transaction(async executor => {
          const current = await currentLease(context,id,leaseId,executor);
          for (const message of batch.messages) {
            const result = await dependencies.ingest({connector:current,body:{...message},eventUserId:context.actorUserId},executor);
            const payload=config(result.payload);
            if (result.statusCode===201 || (result.statusCode===200 && payload.status==='processed' && typeof payload.ticketId==='string')) acknowledgements.push(message.uid);
          }
          const next = { ...current.public_config,mailboxCursor:batch.cursor,pendingAcknowledgements:acknowledgements };
          await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET public_config=${next},updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
        });
        await currentLease(context,id,leaseId,database,false);
        await dependencies.authorize(context);
        await adapter.acknowledge({provider:connector.provider,mailbox:connector.mailbox_address,credentials,uids:acknowledgements,uidValidity:batch.cursor.uidValidity});
        await dependencies.authorize(context);
        await database.transaction(async executor => {
          const current = await currentLease(context,id,leaseId,executor); const next={...current.public_config};delete next.pollLease;delete next.pendingAcknowledgements;
          await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET status='active',public_config=${next},last_error_code=NULL,consecutive_failures=0,last_success_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
        });
        return { imported:acknowledgements.length };
      } catch (error) {
        const code = error instanceof PulseDeskMailboxError ? error.code : 'PULSEDESK_MAILBOX_IMPORT_FAILED';
        await fail(context,id,code,undefined,leaseId); throw new PulseDeskMailboxError(code);
      }
    },
    async disconnect(context: PulseDeskMailboxContext,id: string) {
      await dependencies.authorize(context);
      return database.transaction(async executor=>{
        const connector=await load(context,id,executor,true);const vault=dependencies.vault(executor);
        if(connector.secret_reference_id) await revokeMailboxSecret(vault,scope(context,connector,'credentials'),connector.secret_reference_id);
        if(typeof connector.public_config.oauthPendingSecretReferenceId==='string') await revokeMailboxSecret(vault,scope(context,connector,'pending'),connector.public_config.oauthPendingSecretReferenceId);
        await executor.execute(sql`UPDATE pulsedesk_mail_connectors SET status='revoked',revoked_at=NOW(),secret_reference_id=NULL,oauth_state_hash=NULL,oauth_state_expires_at=NULL,public_config=${publicMailboxConfiguration(connector.public_config)},version=version+1,updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${id} AND revoked_at IS NULL`);
        await event(context,id,'revoked',executor);
      });
    },
  };
}
