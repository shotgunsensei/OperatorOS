import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PulseDeskMailboxProvider = 'google' | 'microsoft';
export const PULSEDESK_MAILBOX_PACKAGES = Object.freeze({ imapflow: '1.3.1', mailparser: '3.9.8' });
const PROVIDERS = {
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token', host: 'imap.gmail.com',
    scopes: ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email'],
  },
  microsoft: {
    authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', host: 'outlook.office365.com',
    scopes: ['https://outlook.office365.com/IMAP.AccessAsUser.All', 'openid', 'profile', 'email', 'offline_access'],
  },
} as const;

export class PulseDeskMailboxError extends Error {
  constructor(public readonly code: string) { super('Mailbox connection could not be confirmed.'); }
}
export function mailboxProvider(value: unknown): PulseDeskMailboxProvider {
  if (value !== 'google' && value !== 'microsoft') throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_PROVIDER_UNSUPPORTED');
  return value;
}
export function mailboxAddress(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || value !== value.trim() || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(value)) {
    throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_ADDRESS_INVALID');
  }
  return value.toLowerCase();
}
export interface MailboxApplication { clientId: string; clientSecret: string }
export interface MailboxCredentials { accessToken: string; refreshToken: string; expiresAt: number }
function opaque(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\x00-\x20\x7f]/u.test(value);
}
export function parseMailboxApplication(value: string): MailboxApplication {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_INVALID'); }
  if (!parsed || typeof parsed !== 'object' || !('clientId' in parsed) || !('clientSecret' in parsed)
    || !opaque(parsed.clientId, 256) || !opaque(parsed.clientSecret, 1_500)
    || Object.keys(parsed).some(key => !['clientId', 'clientSecret'].includes(key))) {
    throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_APPLICATION_INVALID');
  }
  return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
}
export function validateMailboxCredentials(value: unknown): MailboxCredentials {
  if (!value || typeof value !== 'object' || !('accessToken' in value) || !('refreshToken' in value) || !('expiresAt' in value)
    || !opaque(value.accessToken, 8_192) || !opaque(value.refreshToken, 8_192)
    || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) {
    throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CREDENTIALS_INVALID');
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt };
}

/** Provider login is separate from OperatorOS identity/SSO. Tokens never go to the UI. */
export function createMailboxOAuthRequest(input: {
  provider: PulseDeskMailboxProvider; clientId: string; mailbox: string; redirectUri: string;
}) {
  const provider = mailboxProvider(input.provider);
  const mailbox = mailboxAddress(input.mailbox);
  const redirect = new URL(input.redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search) {
    throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_REDIRECT_INVALID');
  }
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const parameters = new URLSearchParams({
    client_id: input.clientId, redirect_uri: redirect.href, response_type: 'code',
    scope: PROVIDERS[provider].scopes.join(' '), state, login_hint: mailbox,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : { response_mode: 'query', prompt: 'consent' }),
  });
  return { authorizationUrl: `${PROVIDERS[provider].authorization}?${parameters}`, state, verifier, redirectUri: redirect.href };
}

export interface ParsedMailboxMessage {
  messageId?: string; subject?: string;
  from?: { value?: Array<{ address?: string }> };
  attachments?: Array<unknown>;
}
export interface MaintainedMailboxClient {
  connect(): Promise<unknown>;
  getMailboxLock(folder: string): Promise<{ release(): void }>;
  status(folder: string, query: { uidNext: true; uidValidity: true }): Promise<{ uidNext?: number; uidValidity?: string | bigint | number }>;
  search(query: { seen: false; uid: string }, options: { uid: true }): Promise<number[] | false>;
  fetchOne(uid: number, query: { source?: true; size?: true }, options: { uid: true }): Promise<{ source?: Buffer; size?: number } | false>;
  messageFlagsAdd(uids: number[], flags: string[], options: { uid: true }): Promise<unknown>;
  logout(): Promise<unknown>;
  close(): void;
}
export interface MaintainedMailboxConfiguration {
  host: string; port: 993; secure: true; servername: string;
  auth: { user: string; accessToken: string }; logger: false;
  greetingTimeout: number; connectionTimeout: number; socketTimeout: number;
  tls: { rejectUnauthorized: true; minVersion: 'TLSv1.2' };
}
export interface PulseDeskMailboxDependencies {
  fetch: typeof globalThis.fetch;
  client(configuration: MaintainedMailboxConfiguration): MaintainedMailboxClient;
  parse(source: Buffer): Promise<ParsedMailboxMessage>;
  now?: () => number;
}
export interface MailboxCursor { uidValidity: string; lastUid: number }
export interface ImportedMailboxMessage {
  uid: number; messageId: string; from: string; subject: string; attachmentCount: number;
  attachmentsClean: boolean;
}

export function createPulseDeskMailboxAdapter(dependencies: PulseDeskMailboxDependencies) {
  const now = dependencies.now ?? Date.now;
  async function token(provider: PulseDeskMailboxProvider, application: MailboxApplication, form: Record<string, string>, previousRefresh?: string): Promise<MailboxCredentials> {
    try {
      const response = await dependencies.fetch(PROVIDERS[mailboxProvider(provider)].token, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: application.clientId, client_secret: application.clientSecret, ...form }),
      });
      if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > 65_536) throw new Error('invalid token response');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          length += part.value.byteLength;
          if (length > 65_536) throw new Error('token response limit');
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || !('access_token' in body) || !('expires_in' in body)
        || !Number.isInteger(body.expires_in) || Number(body.expires_in) < 60 || Number(body.expires_in) > 86_400) throw new Error('token lifetime invalid');
      const credentials = validateMailboxCredentials({
        accessToken: body.access_token,
        refreshToken: 'refresh_token' in body ? body.refresh_token : previousRefresh,
        expiresAt: now() + Number(body.expires_in) * 1000,
      });
      // An explicit reduced scope must not turn into an active connection.
      if ('scope' in body && (typeof body.scope !== 'string' || !body.scope.split(/\s+/u).includes(PROVIDERS[provider].scopes[0]))) throw new Error('mail scope missing');
      return credentials;
    } catch { throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_TOKEN_FAILED'); }
  }
  async function withClient<T>(input: { provider: PulseDeskMailboxProvider; mailbox: string; credentials: MailboxCredentials }, work: (client: MaintainedMailboxClient, expired: () => boolean) => Promise<T>): Promise<T> {
    const provider = mailboxProvider(input.provider); const address = mailboxAddress(input.mailbox);
    const credentials = validateMailboxCredentials(input.credentials);
    if (credentials.expiresAt <= now() + 30_000) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_TOKEN_EXPIRED');
    const client = dependencies.client({
      host: PROVIDERS[provider].host, port: 993, secure: true, servername: PROVIDERS[provider].host,
      auth: { user: address, accessToken: credentials.accessToken }, logger: false,
      greetingTimeout: 10_000, connectionTimeout: 10_000, socketTimeout: 10_000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    });
    let timedOut = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      timedOut = true; try { client.close(); } catch { /* Preserve the safe deadline result. */ }
      reject(new PulseDeskMailboxError('PULSEDESK_MAILBOX_DEADLINE'));
    }, 30_000); });
    try {
      return await Promise.race([Promise.resolve().then(async () => {
        await client.connect(); if (timedOut) throw new Error('deadline');
        return work(client, () => timedOut);
      }), deadline]);
    } catch (error) {
      if (error instanceof PulseDeskMailboxError) throw error;
      throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CONNECTION_FAILED');
    } finally {
      if (timer) clearTimeout(timer);
      // Close the owned connection immediately; do not leave logout promises or
      // timers alive after returning. No broad process or host action is used.
      try { client.close(); } catch { /* Cleanup must not expose transport errors. */ }
    }
  }
  return {
    exchange(input: { provider: PulseDeskMailboxProvider; application: MailboxApplication; code: string; verifier: string; redirectUri: string }) {
      if (!opaque(input.code, 4_096) || !/^[A-Za-z0-9_-]{64}$/u.test(input.verifier)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CODE_INVALID');
      return token(input.provider, input.application, { code: input.code, code_verifier: input.verifier, redirect_uri: input.redirectUri, grant_type: 'authorization_code' });
    },
    refresh(input: { provider: PulseDeskMailboxProvider; application: MailboxApplication; credentials: MailboxCredentials }) {
      const credentials = validateMailboxCredentials(input.credentials);
      return token(input.provider, input.application, { refresh_token: credentials.refreshToken, grant_type: 'refresh_token', ...(input.provider === 'microsoft' ? { scope: PROVIDERS.microsoft.scopes.join(' ') } : {}) }, credentials.refreshToken);
    },
    async verify(input: { provider: PulseDeskMailboxProvider; mailbox: string; credentials: MailboxCredentials }) {
      return withClient(input, async client => {
        const lock = await client.getMailboxLock('INBOX');
        try { await client.status('INBOX', { uidNext: true, uidValidity: true }); return { verified: true as const }; }
        finally { lock.release(); }
      });
    },
    async read(input: { provider: PulseDeskMailboxProvider; mailbox: string; credentials: MailboxCredentials; connectorId: string; cursor?: MailboxCursor | null }) {
      return withClient(input, async (client, expired) => {
        const lock = await client.getMailboxLock('INBOX');
        try {
          const status = await client.status('INBOX', { uidNext: true, uidValidity: true });
          if (!status.uidValidity || !Number.isSafeInteger(status.uidNext) || Number(status.uidNext) < 1) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CURSOR_INVALID');
          const uidValidity = String(status.uidValidity);
          const lastUid = input.cursor?.uidValidity === uidValidity && Number.isSafeInteger(input.cursor.lastUid) && input.cursor.lastUid >= 0 ? input.cursor.lastUid : 0;
          const first = lastUid + 1; const end = Math.min(Number(status.uidNext) - 1, first + 99);
          if (first > end) return { messages: [] as ImportedMailboxMessage[], cursor: { uidValidity, lastUid } };
          const found = await client.search({ seen: false, uid: `${first}:${end}` }, { uid: true });
          const uids = (found || []).filter(uid => Number.isSafeInteger(uid) && uid >= first && uid <= end).sort((a,b) => a-b);
          const messages: ImportedMailboxMessage[] = [];
          for (const uid of [...new Set(uids)].slice(0, 20)) {
            if (expired()) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_DEADLINE');
            const metadata = await client.fetchOne(uid, { size: true }, { uid: true });
            if (!metadata || !Number.isSafeInteger(metadata.size) || Number(metadata.size) < 0 || Number(metadata.size) > 2_097_152) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_MESSAGE_TOO_LARGE');
            const fetched = await client.fetchOne(uid, { source: true }, { uid: true });
            if (!fetched || !Buffer.isBuffer(fetched.source) || fetched.source.length > 2_097_152) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_MESSAGE_TOO_LARGE');
            const parsed = await dependencies.parse(fetched.source);
            const attachments = parsed.attachments?.length ?? 0;
            messages.push({ uid, messageId: createHash('sha256').update(`${input.connectorId}:${uidValidity}:${uid}`).digest('hex'),
              from: parsed.from?.value?.[0]?.address ?? 'unknown', subject: parsed.subject ?? '',
              attachmentCount: Math.min(20, attachments), attachmentsClean: attachments === 0 });
            // Do not persist raw MIME, bodies, attachments, or provider headers.
          }
          if (expired()) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_DEADLINE');
          return { messages, cursor: { uidValidity, lastUid: uids.length > 20 ? messages.at(-1)!.uid : end } };
        } finally { lock.release(); }
      });
    },
    async acknowledge(input: { provider: PulseDeskMailboxProvider; mailbox: string; credentials: MailboxCredentials; uids: number[]; uidValidity: string }) {
      if (!input.uids.length) return;
      if (!/^[1-9][0-9]*$/u.test(input.uidValidity) || input.uids.length > 20 || input.uids.some(uid => !Number.isSafeInteger(uid) || uid < 1)) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_CURSOR_INVALID');
      await withClient(input, async client => { const lock = await client.getMailboxLock('INBOX');
        try {
          const status=await client.status('INBOX',{uidNext:true,uidValidity:true});
          if(String(status.uidValidity)!==input.uidValidity) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_UIDVALIDITY_CHANGED');
          await client.messageFlagsAdd(input.uids, ['\\Seen'], { uid: true });
        } finally { lock.release(); }
      });
    },
  };
}

const localRequire = createRequire(import.meta.url);
export function inspectPulseDeskMailboxRuntime(declarations: Record<string,string> | undefined, load: (name: string) => unknown) {
  const missingPackages: string[]=[];
  for(const [name,version]of Object.entries(PULSEDESK_MAILBOX_PACKAGES)) {
    try {
      if(declarations?.[name]!==version)throw new Error('not pinned by API');
      const installed=load(`${name}/package.json`) as {version?:string};
      if(installed.version!==version)throw new Error('version differs');
      // Resolve and evaluate the maintained export so a missing transitive
      // dependency cannot be advertised as a usable runtime capability.
      const exports=load(name) as {ImapFlow?:unknown;simpleParser?:unknown};
      if(typeof (name==='imapflow'?exports.ImapFlow:exports.simpleParser)!=='function')throw new Error('maintained export missing');
    } catch {missingPackages.push(`${name}@${version}`);}
  }
  return {available:missingPackages.length===0,providers:['google','microsoft'] as const,missingPackages};
}
export function pulseDeskMailboxRuntimeStatus() {
  let location = dirname(fileURLToPath(import.meta.url));
  let apiManifest: { name?: string; dependencies?: Record<string,string> } | null = null;
  // The compiler preserves apps/api/src below dist; locate the same API-owned
  // manifest in either source or compiled layout, never a child-source install.
  for (let level=0;level<9;level++) {
    try {
      const candidate=JSON.parse(readFileSync(join(location,'package.json'),'utf8')) as {name?:string;dependencies?:Record<string,string>};
      if(candidate.name==='@operatoros/api') { apiManifest=candidate;break; }
    } catch { /* The next parent may own the API manifest. */ }
    const parent=dirname(location);if(parent===location)break;location=parent;
  }
  return inspectPulseDeskMailboxRuntime(apiManifest?.dependencies,localRequire);
}
export function loadPulseDeskMailboxAdapter() {
  if (!pulseDeskMailboxRuntimeStatus().available) throw new PulseDeskMailboxError('PULSEDESK_MAILBOX_DEPENDENCIES_UNAVAILABLE');
  const imap = localRequire('imapflow') as { ImapFlow: new (configuration: MaintainedMailboxConfiguration) => MaintainedMailboxClient };
  const mime = localRequire('mailparser') as { simpleParser: (source: Buffer, options: Record<string,boolean>) => Promise<ParsedMailboxMessage> };
  return createPulseDeskMailboxAdapter({ fetch: globalThis.fetch,
    client: configuration => new imap.ImapFlow(configuration),
    parse: source => mime.simpleParser(source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true }),
  });
}
