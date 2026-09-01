import { createHash } from 'node:crypto';
import twilio from 'twilio';

const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const API_KEY_SID = /^SK[0-9a-fA-F]{32}$/;
const NUMBER_SID = /^PN[0-9a-fA-F]{32}$/;
const E164 = /^\+[1-9][0-9]{6,14}$/;
const OPENAI_PROJECT_ID = /^proj_[A-Za-z0-9_-]{8,120}$/;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SEARCH_RESULTS = 50;

const ISO_COUNTRY_CODES = new Set(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '),
);

export type ProviderAccountStatus = 'active' | 'suspended' | 'closed' | 'unknown';
export type CallCommandNumberType = 'local' | 'toll_free';

export interface TwilioProviderCredentials {
  accountSid: string;
  authToken: string;
  /** Optional connector/API-key username. accountSid remains the resource owner. */
  apiKeySid?: string;
}

export interface SafePhoneCapabilities {
  voice: boolean;
  sms: boolean;
  mms: boolean;
  fax: boolean;
}

export interface SafeCostMetadata {
  pricingModel: 'provider_usage_based';
  currency: string | null;
  monthlyAmount: string | null;
  usageAmount: string | null;
  quoteRequired: boolean;
}

export interface SafeTenantProviderAccount {
  provider: 'twilio';
  providerAccountId: string;
  friendlyName: string;
  status: ProviderAccountStatus;
  reused: boolean;
  credentialState: 'persisted_on_create' | 'caller_managed_existing';
}

export interface SafeAvailablePhoneNumber {
  provider: 'twilio';
  phoneNumber: string;
  friendlyName: string;
  isoCountry: string;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  numberType: CallCommandNumberType;
  addressRequirement: 'none' | 'any' | 'local' | 'foreign' | 'unknown';
  capabilities: SafePhoneCapabilities;
  cost: SafeCostMetadata;
}

export interface SafeNumberRouting {
  voiceUrl: string | null;
  voiceMethod: 'POST' | 'GET' | 'unknown';
  statusCallbackUrl: string | null;
  statusCallbackMethod: 'POST' | 'GET' | 'unknown';
  voiceUrlAllowed: boolean;
  statusCallbackUrlAllowed: boolean;
}

export interface SafeProvisionedPhoneNumber {
  provider: 'twilio';
  providerAccountId: string;
  providerNumberId: string;
  phoneNumber: string;
  friendlyName: string;
  status: 'provisioned';
  capabilities: SafePhoneCapabilities;
  routing: SafeNumberRouting;
  cost: SafeCostMetadata;
}

export interface SafeNumberHealth extends SafeProvisionedPhoneNumber {
  accountStatus: ProviderAccountStatus;
  health: 'healthy' | 'degraded';
  healthReasons: Array<'account_not_active' | 'voice_not_capable' | 'voice_url_not_allowed' | 'status_url_not_allowed' | 'non_post_routing'>;
}

export interface SafeReleasedPhoneNumber {
  provider: 'twilio';
  providerAccountId: string;
  providerNumberId: string;
  phoneNumber: string;
  status: 'released';
  released: true;
}

interface WithCredentials<TCredentials> {
  credentials: TCredentials;
  timeoutMs?: number;
}

export interface EnsureTenantAccountInput<TCredentials, TCreatedCredential = never> extends WithCredentials<TCredentials> {
  friendlyName: string;
  existingProviderAccountId?: string | null;
  /**
   * Required only when creating a provider account. This is a one-way,
   * server-only persistence boundary; the credential is never returned by the
   * adapter. Reused provider accounts must already have a persisted credential.
   */
  persistCreatedCredential?: (credential: TCreatedCredential) => Promise<void>;
}

export interface SearchVoiceNumbersInput<TCredentials> extends WithCredentials<TCredentials> {
  providerAccountId: string;
  country: string;
  areaCode?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  contains?: string;
  numberType?: CallCommandNumberType;
  limit?: number;
}

export interface NumberRoutingInput {
  voiceUrl: string;
  statusCallbackUrl: string;
}

export interface ProvisionNumberInput<TCredentials> extends WithCredentials<TCredentials> {
  providerAccountId: string;
  selectedPhoneNumber: string;
  friendlyName: string;
  routing: NumberRoutingInput;
}

export interface InspectNumberInput<TCredentials> extends WithCredentials<TCredentials> {
  providerAccountId: string;
  providerNumberId: string;
}

export interface UpdateNumberRoutingInput<TCredentials> extends InspectNumberInput<TCredentials> {
  routing: NumberRoutingInput;
}

export interface ReleaseNumberInput<TCredentials> extends InspectNumberInput<TCredentials> {
  confirmation: {
    confirmed: true;
    expectedProviderNumberId: string;
    expectedPhoneNumber: string;
  };
}

/**
 * Provider-neutral number lifecycle. Credentials stay on inputs so callers can
 * obtain them from their server-side secret authority immediately before use.
 */
export interface CallCommandNumberProvider<TCredentials, TCreatedCredential = never> {
  ensureTenantAccount(input: EnsureTenantAccountInput<TCredentials, TCreatedCredential>): Promise<SafeTenantProviderAccount>;
  searchVoiceNumbers(input: SearchVoiceNumbersInput<TCredentials>): Promise<SafeAvailablePhoneNumber[]>;
  provisionNumber(input: ProvisionNumberInput<TCredentials>): Promise<SafeProvisionedPhoneNumber>;
  inspectNumber(input: InspectNumberInput<TCredentials>): Promise<SafeNumberHealth>;
  listNumbers(input: WithCredentials<TCredentials> & { providerAccountId: string; limit?: number }): Promise<SafeProvisionedPhoneNumber[]>;
  updateRouting(input: UpdateNumberRoutingInput<TCredentials>): Promise<SafeProvisionedPhoneNumber>;
  releaseNumber(input: ReleaseNumberInput<TCredentials>): Promise<SafeReleasedPhoneNumber>;
}

export type CallCommandNumberProviderErrorCode =
  | 'INVALID_INPUT'
  | 'UNSAFE_WEBHOOK_URL'
  | 'PROVIDER_ACCOUNT_FAILED'
  | 'PROVIDER_SEARCH_FAILED'
  | 'PROVIDER_PROVISION_FAILED'
  | 'PROVIDER_NUMBER_UNAVAILABLE'
  | 'PROVIDER_COMPLIANCE_REQUIRED'
  | 'PROVIDER_INSPECT_FAILED'
  | 'PROVIDER_UPDATE_FAILED'
  | 'PROVIDER_RELEASE_FAILED'
  | 'RELEASE_NOT_CONFIRMED';

export class CallCommandNumberProviderError extends Error {
  constructor(
    public readonly code: CallCommandNumberProviderErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'CallCommandNumberProviderError';
  }

  toJSON(): { name: string; code: CallCommandNumberProviderErrorCode; message: string; retryable: boolean } {
    return { name: this.name, code: this.code, message: this.message, retryable: this.retryable };
  }
}

export interface TwilioRawAccount {
  sid?: unknown;
  friendlyName?: unknown;
  status?: unknown;
  // Twilio returns authToken on account creation. The adapter intentionally
  // does not read or expose it.
  [key: string]: unknown;
}

/**
 * Available only to the one-way creation sink. Never include this shape in an
 * API response, log entry, audit payload, or provider adapter return value.
 */
export interface TwilioCreatedSubaccountCredential {
  provider: 'twilio';
  providerAccountId: string;
  authToken: string;
}

export interface TwilioRawAvailableNumber {
  phoneNumber?: unknown;
  friendlyName?: unknown;
  isoCountry?: unknown;
  locality?: unknown;
  region?: unknown;
  postalCode?: unknown;
  addressRequirements?: unknown;
  capabilities?: unknown;
  [key: string]: unknown;
}

export interface TwilioRawIncomingNumber {
  accountSid?: unknown;
  sid?: unknown;
  phoneNumber?: unknown;
  friendlyName?: unknown;
  capabilities?: unknown;
  voiceUrl?: unknown;
  voiceMethod?: unknown;
  statusCallback?: unknown;
  statusCallbackMethod?: unknown;
  [key: string]: unknown;
}

export interface TwilioSearchRequest {
  voiceEnabled: true;
  excludeAllAddressRequired: true;
  limit: number;
  areaCode?: number;
  inLocality?: string;
  inRegion?: string;
  inPostalCode?: string;
  contains?: string;
}

export interface TwilioProvisionRequest {
  phoneNumber: string;
  friendlyName: string;
  voiceUrl: string;
  voiceMethod: 'POST';
  statusCallback: string;
  statusCallbackMethod: 'POST';
}

export interface TwilioRoutingUpdateRequest {
  voiceUrl: string;
  voiceMethod: 'POST';
  statusCallback: string;
  statusCallbackMethod: 'POST';
}

/** Narrow SDK seam used by the production wrapper and pure test fakes. */
export interface TwilioNumberApi {
  createSubaccount(input: { friendlyName: string }): Promise<TwilioRawAccount>;
  fetchSubaccount(accountSid: string): Promise<TwilioRawAccount>;
  searchLocalNumbers(accountSid: string, country: string, input: TwilioSearchRequest): Promise<TwilioRawAvailableNumber[]>;
  searchTollFreeNumbers(accountSid: string, country: string, input: TwilioSearchRequest): Promise<TwilioRawAvailableNumber[]>;
  provisionNumber(accountSid: string, input: TwilioProvisionRequest): Promise<TwilioRawIncomingNumber>;
  listNumbers(accountSid: string, limit: number): Promise<TwilioRawIncomingNumber[]>;
  fetchNumber(accountSid: string, numberSid: string): Promise<TwilioRawIncomingNumber>;
  updateNumber(accountSid: string, numberSid: string, input: TwilioRoutingUpdateRequest): Promise<TwilioRawIncomingNumber>;
  releaseNumber(accountSid: string, numberSid: string): Promise<boolean>;
}

export type TwilioNumberApiFactory = (input: {
  parentAccountSid: string;
  apiKeySid?: string;
  authToken: string;
  timeoutMs: number;
}) => TwilioNumberApi;

export interface TwilioNumberProviderOptions {
  allowedWebhookOrigins: readonly string[];
  apiFactory?: TwilioNumberApiFactory;
}

function invalid(message: string): never {
  throw new CallCommandNumberProviderError('INVALID_INPUT', message);
}

function validateCredentials(value: TwilioProviderCredentials): TwilioProviderCredentials {
  if (!value || !ACCOUNT_SID.test(value.accountSid)) invalid('Twilio parent account SID is invalid');
  if (value.apiKeySid !== undefined && !API_KEY_SID.test(value.apiKeySid)) invalid('Twilio API key SID is invalid');
  if (!isValidAuthToken(value.authToken)) {
    invalid('Twilio credential is invalid');
  }
  return value;
}

function isValidAuthToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{20,256}$/.test(value);
}

function validateAccountSid(value: string): string {
  if (!ACCOUNT_SID.test(value)) invalid('Provider account SID is invalid');
  return value;
}

function validateNumberSid(value: string): string {
  if (!NUMBER_SID.test(value)) invalid('Provider number SID is invalid');
  return value;
}

function validateE164(value: string): string {
  if (!E164.test(value)) invalid('Phone number must be valid E.164');
  return value;
}

function boundedTimeout(value?: number): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000 || value > 30_000) invalid('Provider timeout must be between 1000 and 30000 milliseconds');
  return value;
}

function boundedText(value: string, field: string, maxLength: number): string {
  if (typeof value !== 'string') invalid(`${field} is required`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || CONTROL_CHARACTERS.test(trimmed)) invalid(`${field} is invalid`);
  return trimmed;
}

function boundedMultilineText(value: string, field: string, maxLength: number): string {
  if (typeof value !== 'string') invalid(`${field} is required`);
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (!trimmed || trimmed.length > maxLength
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) {
    invalid(`${field} is invalid`);
  }
  return trimmed;
}

function safeProviderText(value: unknown, maxLength = 128): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
  return clean || null;
}

function normalizeCountry(value: string): string {
  if (typeof value !== 'string') invalid('Country must be an ISO 3166-1 alpha-2 code');
  const country = value.trim().toUpperCase();
  if (!ISO_COUNTRY_CODES.has(country)) invalid('Country must be an ISO 3166-1 alpha-2 code');
  return country;
}

function normalizeSearch(input: SearchVoiceNumbersInput<TwilioProviderCredentials>): {
  country: string;
  numberType: CallCommandNumberType;
  request: TwilioSearchRequest;
} {
  const country = normalizeCountry(input.country);
  const numberType = input.numberType ?? 'local';
  if (numberType !== 'local' && numberType !== 'toll_free') invalid('Number type must be local or toll_free');
  if (country !== 'US') invalid('Managed CallCommand number search is currently limited to the United States');
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULTS) invalid(`Search limit must be between 1 and ${MAX_SEARCH_RESULTS}`);
  const request: TwilioSearchRequest = { voiceEnabled: true, excludeAllAddressRequired: true, limit };
  if (input.areaCode !== undefined) {
    if (!/^[0-9]{3}$/.test(input.areaCode) || !['US', 'CA'].includes(country)) invalid('Area code is valid only as three digits for US or CA searches');
    request.areaCode = Number(input.areaCode);
  }
  if (input.locality !== undefined) request.inLocality = boundedText(input.locality, 'Locality', 64);
  if (input.region !== undefined) {
    const region = boundedText(input.region, 'Region', 32).toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) invalid('Region must be a two-letter US state code');
    request.inRegion = region;
  }
  if (input.postalCode !== undefined) {
    const postal = boundedText(input.postalCode, 'Postal code', 16);
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(postal)) invalid('Postal code is invalid');
    request.inPostalCode = postal;
  }
  if (input.contains !== undefined) {
    const contains = boundedText(input.contains, 'Contains', 16);
    if (contains.length < 2 || !/^[A-Za-z0-9*%+$]+$/.test(contains)) invalid('Contains must be a supported two-to-sixteen character number pattern');
    request.contains = contains;
  }
  return { country, numberType, request };
}

function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CallCommandNumberProviderError('UNSAFE_WEBHOOK_URL', 'Webhook origin is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname !== '/' || url.search) {
    throw new CallCommandNumberProviderError('UNSAFE_WEBHOOK_URL', 'Webhook origin must be a bare HTTPS origin');
  }
  return url.origin;
}

function validateWebhookUrl(value: string, allowedOrigins: ReadonlySet<string>): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CallCommandNumberProviderError('UNSAFE_WEBHOOK_URL', 'Webhook URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !allowedOrigins.has(url.origin)) {
    throw new CallCommandNumberProviderError('UNSAFE_WEBHOOK_URL', 'Webhook URL is not on an allowed HTTPS origin');
  }
  for (const key of url.searchParams.keys()) {
    if (/token|secret|signature|password|auth|key/i.test(key)) {
      throw new CallCommandNumberProviderError('UNSAFE_WEBHOOK_URL', 'Webhook URL query cannot contain credential-like parameters');
    }
  }
  return url.toString();
}

function allowedRoutingUrl(value: unknown, allowedOrigins: ReadonlySet<string>): { value: string | null; allowed: boolean } {
  if (typeof value !== 'string' || !value) return { value: null, allowed: false };
  try {
    return { value: validateWebhookUrl(value, allowedOrigins), allowed: true };
  } catch {
    return { value: null, allowed: false };
  }
}

function normalizeCapabilities(value: unknown): SafePhoneCapabilities {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { voice: raw.voice === true, sms: raw.sms === true, mms: raw.mms === true, fax: raw.fax === true };
}

function normalizeAccountStatus(value: unknown): ProviderAccountStatus {
  return value === 'active' || value === 'suspended' || value === 'closed' ? value : 'unknown';
}

function normalizeAddressRequirement(value: unknown): SafeAvailablePhoneNumber['addressRequirement'] {
  return value === 'none' || value === 'any' || value === 'local' || value === 'foreign' ? value : 'unknown';
}

function costMetadata(): SafeCostMetadata {
  return {
    pricingModel: 'provider_usage_based',
    currency: null,
    monthlyAmount: null,
    usageAmount: null,
    quoteRequired: true,
  };
}

function normalizeRouting(raw: TwilioRawIncomingNumber, allowedOrigins: ReadonlySet<string>): SafeNumberRouting {
  const voice = allowedRoutingUrl(raw.voiceUrl, allowedOrigins);
  const status = allowedRoutingUrl(raw.statusCallback, allowedOrigins);
  return {
    voiceUrl: voice.value,
    voiceMethod: raw.voiceMethod === 'POST' || raw.voiceMethod === 'GET' ? raw.voiceMethod : 'unknown',
    statusCallbackUrl: status.value,
    statusCallbackMethod: raw.statusCallbackMethod === 'POST' || raw.statusCallbackMethod === 'GET' ? raw.statusCallbackMethod : 'unknown',
    voiceUrlAllowed: voice.allowed,
    statusCallbackUrlAllowed: status.allowed,
  };
}

function normalizeProvisioned(raw: TwilioRawIncomingNumber, expectedAccountSid: string, allowedOrigins: ReadonlySet<string>): SafeProvisionedPhoneNumber {
  const providerAccountId = validateAccountSid(String(raw.accountSid ?? expectedAccountSid));
  if (providerAccountId !== expectedAccountSid) throw new CallCommandNumberProviderError('PROVIDER_INSPECT_FAILED', 'Provider returned a resource from the wrong account');
  return {
    provider: 'twilio',
    providerAccountId,
    providerNumberId: validateNumberSid(String(raw.sid ?? '')),
    phoneNumber: validateE164(String(raw.phoneNumber ?? '')),
    friendlyName: safeProviderText(raw.friendlyName, 64) ?? 'Twilio phone number',
    status: 'provisioned',
    capabilities: normalizeCapabilities(raw.capabilities),
    routing: normalizeRouting(raw, allowedOrigins),
    cost: costMetadata(),
  };
}

function productionTwilioApiFactory(input: { parentAccountSid: string; apiKeySid?: string; authToken: string; timeoutMs: number }): TwilioNumberApi {
  const client = twilio(input.apiKeySid ?? input.parentAccountSid, input.authToken, {
    accountSid: input.parentAccountSid,
    timeout: input.timeoutMs,
    autoRetry: false,
    lazyLoading: true,
  });
  const api = client.api.v2010;
  return {
    createSubaccount: values => api.accounts.create(values) as unknown as Promise<TwilioRawAccount>,
    fetchSubaccount: accountSid => api.accounts(accountSid).fetch() as unknown as Promise<TwilioRawAccount>,
    searchLocalNumbers: (accountSid, country, values) => api.accounts(accountSid).availablePhoneNumbers(country).local.list(values) as unknown as Promise<TwilioRawAvailableNumber[]>,
    searchTollFreeNumbers: (accountSid, country, values) => api.accounts(accountSid).availablePhoneNumbers(country).tollFree.list(values) as unknown as Promise<TwilioRawAvailableNumber[]>,
    provisionNumber: (accountSid, values) => api.accounts(accountSid).incomingPhoneNumbers.create(values) as unknown as Promise<TwilioRawIncomingNumber>,
    listNumbers: (accountSid, limit) => api.accounts(accountSid).incomingPhoneNumbers.list({ limit }) as unknown as Promise<TwilioRawIncomingNumber[]>,
    fetchNumber: (accountSid, numberSid) => api.accounts(accountSid).incomingPhoneNumbers(numberSid).fetch() as unknown as Promise<TwilioRawIncomingNumber>,
    updateNumber: (accountSid, numberSid, values) => api.accounts(accountSid).incomingPhoneNumbers(numberSid).update(values) as unknown as Promise<TwilioRawIncomingNumber>,
    releaseNumber: (accountSid, numberSid) => api.accounts(accountSid).incomingPhoneNumbers(numberSid).remove(),
  };
}

async function providerOperation<T>(
  code: Exclude<CallCommandNumberProviderErrorCode, 'INVALID_INPUT' | 'UNSAFE_WEBHOOK_URL' | 'RELEASE_NOT_CONFIRMED'>,
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof CallCommandNumberProviderError) throw error;
    const providerCode = Number((error as { code?: unknown })?.code);
    const httpStatus = Number((error as { status?: unknown })?.status);
    if (code === 'PROVIDER_PROVISION_FAILED' && providerCode === 21422) {
      throw new CallCommandNumberProviderError('PROVIDER_NUMBER_UNAVAILABLE', 'The selected phone number is no longer available');
    }
    if (code === 'PROVIDER_PROVISION_FAILED' && [18063, 21404, 21631].includes(providerCode)) {
      throw new CallCommandNumberProviderError('PROVIDER_COMPLIANCE_REQUIRED', 'Provider approval or regulatory information is required');
    }
    const retryable = httpStatus === 408 || httpStatus === 409 || httpStatus === 429 || httpStatus >= 500 || !Number.isFinite(httpStatus);
    throw new CallCommandNumberProviderError(code, message, retryable);
  }
}

export class TwilioCallCommandNumberProvider implements CallCommandNumberProvider<TwilioProviderCredentials, TwilioCreatedSubaccountCredential> {
  private readonly allowedWebhookOrigins: ReadonlySet<string>;
  private readonly apiFactory: TwilioNumberApiFactory;

  constructor(options: TwilioNumberProviderOptions) {
    if (!options?.allowedWebhookOrigins?.length || options.allowedWebhookOrigins.length > 16) {
      invalid('One to sixteen allowed webhook origins are required');
    }
    this.allowedWebhookOrigins = new Set(options.allowedWebhookOrigins.map(normalizeOrigin));
    this.apiFactory = options.apiFactory ?? productionTwilioApiFactory;
  }

  private api(credentials: TwilioProviderCredentials, timeoutMs?: number): TwilioNumberApi {
    const safe = validateCredentials(credentials);
    return this.apiFactory({
      parentAccountSid: safe.accountSid,
      ...(safe.apiKeySid ? { apiKeySid: safe.apiKeySid } : {}),
      authToken: safe.authToken,
      timeoutMs: boundedTimeout(timeoutMs),
    });
  }

  async ensureTenantAccount(input: EnsureTenantAccountInput<TwilioProviderCredentials, TwilioCreatedSubaccountCredential>): Promise<SafeTenantProviderAccount> {
    const friendlyName = boundedText(input.friendlyName, 'Tenant provider account name', 64);
    const api = this.api(input.credentials, input.timeoutMs);
    const reused = Boolean(input.existingProviderAccountId);
    if (!reused && typeof input.persistCreatedCredential !== 'function') {
      invalid('A server credential sink is required when creating a Twilio tenant account');
    }
    const raw = await providerOperation('PROVIDER_ACCOUNT_FAILED', 'Twilio tenant account operation failed', () => (
      reused
        ? api.fetchSubaccount(validateAccountSid(input.existingProviderAccountId!))
        : api.createSubaccount({ friendlyName })
    ));
    const providerAccountId = validateAccountSid(String(raw.sid ?? ''));
    if (!reused) {
      if (!isValidAuthToken(raw.authToken)) {
        throw new CallCommandNumberProviderError('PROVIDER_ACCOUNT_FAILED', 'Twilio tenant account response omitted a valid credential');
      }
      try {
        await input.persistCreatedCredential!({
          provider: 'twilio',
          providerAccountId,
          authToken: raw.authToken,
        });
      } catch {
        // The raw sink error is intentionally discarded because it may contain
        // the credential or details about the server-side secret authority.
        throw new CallCommandNumberProviderError('PROVIDER_ACCOUNT_FAILED', 'Twilio tenant account credential persistence failed', true);
      }
    }
    return {
      provider: 'twilio',
      providerAccountId,
      friendlyName: safeProviderText(raw.friendlyName, 64) ?? friendlyName,
      status: normalizeAccountStatus(raw.status),
      reused,
      credentialState: reused ? 'caller_managed_existing' : 'persisted_on_create',
    };
  }

  async searchVoiceNumbers(input: SearchVoiceNumbersInput<TwilioProviderCredentials>): Promise<SafeAvailablePhoneNumber[]> {
    const accountSid = validateAccountSid(input.providerAccountId);
    const normalized = normalizeSearch(input);
    const api = this.api(input.credentials, input.timeoutMs);
    const raw = await providerOperation('PROVIDER_SEARCH_FAILED', 'Twilio phone number search failed', () => (
      normalized.numberType === 'toll_free'
        ? api.searchTollFreeNumbers(accountSid, normalized.country, normalized.request)
        : api.searchLocalNumbers(accountSid, normalized.country, normalized.request)
    ));
    const safe: SafeAvailablePhoneNumber[] = [];
    for (const candidate of raw.slice(0, normalized.request.limit)) {
      const capabilities = normalizeCapabilities(candidate.capabilities);
      const country = safeProviderText(candidate.isoCountry, 2)?.toUpperCase();
      if (!capabilities.voice || country !== normalized.country || !E164.test(String(candidate.phoneNumber ?? ''))) continue;
      safe.push({
        provider: 'twilio',
        phoneNumber: String(candidate.phoneNumber),
        friendlyName: safeProviderText(candidate.friendlyName, 64) ?? String(candidate.phoneNumber),
        isoCountry: country,
        locality: safeProviderText(candidate.locality, 64),
        region: safeProviderText(candidate.region, 64),
        postalCode: safeProviderText(candidate.postalCode, 16),
        numberType: normalized.numberType,
        addressRequirement: normalizeAddressRequirement(candidate.addressRequirements),
        capabilities,
        cost: costMetadata(),
      });
    }
    return safe;
  }

  async provisionNumber(input: ProvisionNumberInput<TwilioProviderCredentials>): Promise<SafeProvisionedPhoneNumber> {
    const accountSid = validateAccountSid(input.providerAccountId);
    const values: TwilioProvisionRequest = {
      phoneNumber: validateE164(input.selectedPhoneNumber),
      friendlyName: boundedText(input.friendlyName, 'Phone number name', 64),
      voiceUrl: validateWebhookUrl(input.routing.voiceUrl, this.allowedWebhookOrigins),
      voiceMethod: 'POST',
      statusCallback: validateWebhookUrl(input.routing.statusCallbackUrl, this.allowedWebhookOrigins),
      statusCallbackMethod: 'POST',
    };
    const raw = await providerOperation('PROVIDER_PROVISION_FAILED', 'Twilio phone number provisioning failed', () => (
      this.api(input.credentials, input.timeoutMs).provisionNumber(accountSid, values)
    ));
    return normalizeProvisioned(raw, accountSid, this.allowedWebhookOrigins);
  }

  async inspectNumber(input: InspectNumberInput<TwilioProviderCredentials>): Promise<SafeNumberHealth> {
    const accountSid = validateAccountSid(input.providerAccountId);
    const numberSid = validateNumberSid(input.providerNumberId);
    const api = this.api(input.credentials, input.timeoutMs);
    const [account, raw] = await providerOperation('PROVIDER_INSPECT_FAILED', 'Twilio phone number inspection failed', () => (
      Promise.all([api.fetchSubaccount(accountSid), api.fetchNumber(accountSid, numberSid)])
    ));
    const number = normalizeProvisioned(raw, accountSid, this.allowedWebhookOrigins);
    const accountStatus = normalizeAccountStatus(account.status);
    const healthReasons: SafeNumberHealth['healthReasons'] = [];
    if (accountStatus !== 'active') healthReasons.push('account_not_active');
    if (!number.capabilities.voice) healthReasons.push('voice_not_capable');
    if (!number.routing.voiceUrlAllowed) healthReasons.push('voice_url_not_allowed');
    if (!number.routing.statusCallbackUrlAllowed) healthReasons.push('status_url_not_allowed');
    if (number.routing.voiceMethod !== 'POST' || number.routing.statusCallbackMethod !== 'POST') healthReasons.push('non_post_routing');
    return { ...number, accountStatus, health: healthReasons.length ? 'degraded' : 'healthy', healthReasons };
  }

  async listNumbers(input: WithCredentials<TwilioProviderCredentials> & { providerAccountId: string; limit?: number }): Promise<SafeProvisionedPhoneNumber[]> {
    const accountSid = validateAccountSid(input.providerAccountId);
    const limit = input.limit ?? 1_000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) invalid('Provider inventory limit must be between 1 and 1000');
    const raw = await providerOperation('PROVIDER_INSPECT_FAILED', 'Twilio phone number inventory failed', () => (
      this.api(input.credentials, input.timeoutMs).listNumbers(accountSid, limit)
    ));
    return raw.map(number => normalizeProvisioned(number, accountSid, this.allowedWebhookOrigins));
  }

  async updateRouting(input: UpdateNumberRoutingInput<TwilioProviderCredentials>): Promise<SafeProvisionedPhoneNumber> {
    const accountSid = validateAccountSid(input.providerAccountId);
    const numberSid = validateNumberSid(input.providerNumberId);
    const values: TwilioRoutingUpdateRequest = {
      voiceUrl: validateWebhookUrl(input.routing.voiceUrl, this.allowedWebhookOrigins),
      voiceMethod: 'POST',
      statusCallback: validateWebhookUrl(input.routing.statusCallbackUrl, this.allowedWebhookOrigins),
      statusCallbackMethod: 'POST',
    };
    const raw = await providerOperation('PROVIDER_UPDATE_FAILED', 'Twilio phone number routing update failed', () => (
      this.api(input.credentials, input.timeoutMs).updateNumber(accountSid, numberSid, values)
    ));
    return normalizeProvisioned(raw, accountSid, this.allowedWebhookOrigins);
  }

  async releaseNumber(input: ReleaseNumberInput<TwilioProviderCredentials>): Promise<SafeReleasedPhoneNumber> {
    const accountSid = validateAccountSid(input.providerAccountId);
    const numberSid = validateNumberSid(input.providerNumberId);
    if (!input.confirmation?.confirmed
      || input.confirmation.expectedProviderNumberId !== numberSid
      || !E164.test(input.confirmation.expectedPhoneNumber)) {
      throw new CallCommandNumberProviderError('RELEASE_NOT_CONFIRMED', 'Phone number release requires matching explicit confirmation');
    }
    const api = this.api(input.credentials, input.timeoutMs);
    const current = await providerOperation('PROVIDER_INSPECT_FAILED', 'Twilio phone number inspection failed', () => api.fetchNumber(accountSid, numberSid));
    const phoneNumber = validateE164(String(current.phoneNumber ?? ''));
    if (phoneNumber !== input.confirmation.expectedPhoneNumber) {
      throw new CallCommandNumberProviderError('RELEASE_NOT_CONFIRMED', 'Phone number release confirmation does not match the current resource');
    }
    const released = await providerOperation('PROVIDER_RELEASE_FAILED', 'Twilio phone number release failed', () => api.releaseNumber(accountSid, numberSid));
    if (released !== true) throw new CallCommandNumberProviderError('PROVIDER_RELEASE_FAILED', 'Twilio did not confirm phone number release', true);
    return { provider: 'twilio', providerAccountId: accountSid, providerNumberId: numberSid, phoneNumber, status: 'released', released: true };
  }
}

/**
 * Explicit no-network adapter for unit/integration tests. It models inventory
 * races, tenant subaccounts, routing drift, and release without ever reaching
 * Twilio or creating a billable resource.
 */
export class MockCallCommandNumberProvider implements CallCommandNumberProvider<TwilioProviderCredentials, TwilioCreatedSubaccountCredential> {
  private readonly accounts = new Map<string, SafeTenantProviderAccount>();
  private readonly inventory = new Map<string, SafeAvailablePhoneNumber>();
  private readonly numbers = new Map<string, SafeProvisionedPhoneNumber>();
  private sequence = 1;

  constructor(fixtures: SafeAvailablePhoneNumber[] = []) {
    for (const fixture of fixtures) this.inventory.set(fixture.phoneNumber, structuredClone(fixture));
  }

  private sid(prefix: 'AC' | 'PN', value: string): string {
    return `${prefix}${createHash('sha256').update(`${value}:${this.sequence++}`).digest('hex').slice(0, 32)}`;
  }

  async ensureTenantAccount(input: EnsureTenantAccountInput<TwilioProviderCredentials, TwilioCreatedSubaccountCredential>): Promise<SafeTenantProviderAccount> {
    const existingId = input.existingProviderAccountId ?? null;
    if (existingId) {
      const existing = this.accounts.get(existingId);
      if (!existing) throw new CallCommandNumberProviderError('PROVIDER_ACCOUNT_FAILED', 'Mock tenant account was not found');
      return { ...existing, reused: true, credentialState: 'caller_managed_existing' };
    }
    if (!input.persistCreatedCredential) invalid('A server credential sink is required when creating a tenant account');
    const providerAccountId = this.sid('AC', input.friendlyName);
    await input.persistCreatedCredential({ provider: 'twilio', providerAccountId, authToken: createHash('sha256').update(providerAccountId).digest('hex') });
    const account: SafeTenantProviderAccount = {
      provider: 'twilio', providerAccountId, friendlyName: input.friendlyName,
      status: 'active', reused: false, credentialState: 'persisted_on_create',
    };
    this.accounts.set(providerAccountId, account);
    return structuredClone(account);
  }

  async searchVoiceNumbers(input: SearchVoiceNumbersInput<TwilioProviderCredentials>): Promise<SafeAvailablePhoneNumber[]> {
    const type = input.numberType ?? 'local';
    return [...this.inventory.values()].filter(number => number.numberType === type && number.isoCountry === input.country.toUpperCase())
      .slice(0, input.limit ?? 20).map(number => structuredClone(number));
  }

  async provisionNumber(input: ProvisionNumberInput<TwilioProviderCredentials>): Promise<SafeProvisionedPhoneNumber> {
    const fixture = this.inventory.get(input.selectedPhoneNumber);
    if (!fixture) throw new CallCommandNumberProviderError('PROVIDER_NUMBER_UNAVAILABLE', 'The selected phone number is no longer available');
    this.inventory.delete(input.selectedPhoneNumber);
    const number: SafeProvisionedPhoneNumber = {
      provider: 'twilio', providerAccountId: input.providerAccountId,
      providerNumberId: this.sid('PN', input.selectedPhoneNumber), phoneNumber: input.selectedPhoneNumber,
      friendlyName: input.friendlyName, status: 'provisioned', capabilities: fixture.capabilities,
      routing: { voiceUrl: input.routing.voiceUrl, voiceMethod: 'POST', statusCallbackUrl: input.routing.statusCallbackUrl, statusCallbackMethod: 'POST', voiceUrlAllowed: true, statusCallbackUrlAllowed: true },
      cost: fixture.cost,
    };
    this.numbers.set(number.providerNumberId, number);
    return structuredClone(number);
  }

  async inspectNumber(input: InspectNumberInput<TwilioProviderCredentials>): Promise<SafeNumberHealth> {
    const number = this.numbers.get(input.providerNumberId);
    if (!number || number.providerAccountId !== input.providerAccountId) throw new CallCommandNumberProviderError('PROVIDER_INSPECT_FAILED', 'Mock phone number was not found');
    const reasons: SafeNumberHealth['healthReasons'] = [];
    if (!number.capabilities.voice) reasons.push('voice_not_capable');
    if (!number.routing.voiceUrlAllowed) reasons.push('voice_url_not_allowed');
    if (!number.routing.statusCallbackUrlAllowed) reasons.push('status_url_not_allowed');
    return { ...structuredClone(number), accountStatus: 'active', health: reasons.length ? 'degraded' : 'healthy', healthReasons: reasons };
  }

  async listNumbers(input: WithCredentials<TwilioProviderCredentials> & { providerAccountId: string; limit?: number }): Promise<SafeProvisionedPhoneNumber[]> {
    return [...this.numbers.values()].filter(number => number.providerAccountId === input.providerAccountId)
      .slice(0, input.limit ?? 1_000).map(number => structuredClone(number));
  }

  async updateRouting(input: UpdateNumberRoutingInput<TwilioProviderCredentials>): Promise<SafeProvisionedPhoneNumber> {
    const number = this.numbers.get(input.providerNumberId);
    if (!number || number.providerAccountId !== input.providerAccountId) throw new CallCommandNumberProviderError('PROVIDER_UPDATE_FAILED', 'Mock phone number was not found');
    const updated: SafeProvisionedPhoneNumber = { ...number, routing: { voiceUrl: input.routing.voiceUrl, voiceMethod: 'POST', statusCallbackUrl: input.routing.statusCallbackUrl, statusCallbackMethod: 'POST', voiceUrlAllowed: true, statusCallbackUrlAllowed: true } };
    this.numbers.set(input.providerNumberId, updated);
    return structuredClone(updated);
  }

  async releaseNumber(input: ReleaseNumberInput<TwilioProviderCredentials>): Promise<SafeReleasedPhoneNumber> {
    const number = this.numbers.get(input.providerNumberId);
    if (!number || number.providerAccountId !== input.providerAccountId) throw new CallCommandNumberProviderError('PROVIDER_RELEASE_FAILED', 'Mock phone number was not found');
    if (!input.confirmation?.confirmed || input.confirmation.expectedPhoneNumber !== number.phoneNumber || input.confirmation.expectedProviderNumberId !== number.providerNumberId) {
      throw new CallCommandNumberProviderError('RELEASE_NOT_CONFIRMED', 'Phone number release requires matching explicit confirmation');
    }
    this.numbers.delete(input.providerNumberId);
    return { provider: 'twilio', providerAccountId: input.providerAccountId, providerNumberId: number.providerNumberId, phoneNumber: number.phoneNumber, status: 'released', released: true };
  }
}

export function escapeTwiml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface OpenAiSipDialTwimlInput {
  openAiProjectId: string;
  timeoutSeconds?: number;
  statusCallbackUrl?: string;
  allowedWebhookOrigins?: readonly string[];
  callId?: string;
  routeToken?: string;
}

/** Creates only the fixed OpenAI SIP host; callers cannot supply a SIP URI. */
export function buildOpenAiSipDialTwiml(input: OpenAiSipDialTwimlInput): string {
  if (!OPENAI_PROJECT_ID.test(input.openAiProjectId)) invalid('OpenAI project ID is invalid');
  const timeout = input.timeoutSeconds ?? 30;
  if (!Number.isInteger(timeout) || timeout < 5 || timeout > 120) invalid('SIP dial timeout must be between 5 and 120 seconds');
  let callbackAttributes = '';
  if (input.statusCallbackUrl !== undefined) {
    if (!input.allowedWebhookOrigins?.length) invalid('Allowed webhook origins are required for a SIP status callback');
    const origins = new Set(input.allowedWebhookOrigins.map(normalizeOrigin));
    const callback = validateWebhookUrl(input.statusCallbackUrl, origins);
    callbackAttributes = ` statusCallback="${escapeTwiml(callback)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;
  }
  if ((input.callId === undefined) !== (input.routeToken === undefined)) {
    invalid('Call ID and SIP route token must be provided together');
  }
  let routeHeaders = '';
  if (input.callId !== undefined && input.routeToken !== undefined) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.callId)) invalid('Call ID is invalid');
    if (!/^[0-9a-f]{64}$/.test(input.routeToken)) invalid('SIP route token is invalid');
    routeHeaders = `?x-callcommand-call-id=${encodeURIComponent(input.callId)}&x-callcommand-route-token=${input.routeToken}`;
  }
  const sipUri = `sip:${input.openAiProjectId}@sip.api.openai.com;transport=tls${routeHeaders}`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" timeout="${timeout}"><Sip${callbackAttributes}>${escapeTwiml(sipUri)}</Sip></Dial></Response>`;
}

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AllowlistedRealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: { [key: string]: JsonValue };
}

export type SupportedRealtimeModel = 'gpt-realtime-2.1-mini' | 'gpt-realtime-2.1';
export type SupportedRealtimeVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar';

export interface BuildRealtimeAcceptConfigInput {
  model: SupportedRealtimeModel;
  voice: SupportedRealtimeVoice;
  serverCompiledInstructions: string;
  allowlistedTools: readonly AllowlistedRealtimeTool[];
  enabledToolNames?: readonly string[];
  maxOutputTokens?: number;
}

export interface OpenAiRealtimeAcceptConfig {
  type: 'realtime';
  model: SupportedRealtimeModel;
  instructions: string;
  max_output_tokens: number;
  tool_choice: 'auto';
  tools: AllowlistedRealtimeTool[];
  audio: {
    input: {
      turn_detection: {
        type: 'server_vad';
        threshold: 0.5;
        prefix_padding_ms: 300;
        silence_duration_ms: 700;
      };
    };
    output: { voice: SupportedRealtimeVoice };
  };
}

function cloneBoundedJson(value: unknown, state: { nodes: number }, depth = 0): JsonValue {
  state.nodes += 1;
  if (state.nodes > 512 || depth > 10) invalid('Tool schema exceeds structural limits');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('Tool schema contains a non-finite number');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 4_096 || CONTROL_CHARACTERS.test(value)) invalid('Tool schema string is invalid');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) invalid('Tool schema array is too large');
    return value.map(item => cloneBoundedJson(item, state, depth + 1));
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) invalid('Tool schema must be plain JSON');
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 128) invalid('Tool schema object is too large');
  for (const [key, child] of entries) {
    if (!key || key.length > 128 || ['__proto__', 'prototype', 'constructor'].includes(key) || CONTROL_CHARACTERS.test(key)) {
      invalid('Tool schema key is invalid');
    }
    if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#/'))) invalid('External tool schema references are not allowed');
    result[key] = cloneBoundedJson(child, state, depth + 1);
  }
  return result;
}

function normalizeTool(tool: AllowlistedRealtimeTool): AllowlistedRealtimeTool {
  if (tool?.type !== 'function' || !TOOL_NAME.test(tool.name)) invalid('Allowlisted tool name is invalid');
  const description = boundedText(tool.description, 'Allowlisted tool description', 512);
  const parameters = cloneBoundedJson(tool.parameters, { nodes: 0 });
  if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object') invalid('Tool parameters must be an object schema');
  const objectSchema = parameters as Record<string, JsonValue>;
  if (objectSchema.type !== 'object' || objectSchema.additionalProperties !== false) {
    invalid('Tool parameters must be a closed object schema');
  }
  if (JSON.stringify(objectSchema).length > 24_000) invalid('Tool schema is too large');
  return { type: 'function', name: tool.name, description, parameters: objectSchema };
}

export function buildOpenAiRealtimeAcceptConfig(input: BuildRealtimeAcceptConfigInput): OpenAiRealtimeAcceptConfig {
  if (!['gpt-realtime-2.1-mini', 'gpt-realtime-2.1'].includes(input.model)) invalid('Realtime model is not allowed');
  if (!['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'].includes(input.voice)) invalid('Realtime voice is not allowed');
  const instructions = boundedMultilineText(input.serverCompiledInstructions, 'Server-compiled instructions', 12_000);
  if (!Array.isArray(input.allowlistedTools) || input.allowlistedTools.length > 16) invalid('At most sixteen allowlisted tools are supported');
  const normalized = input.allowlistedTools.map(normalizeTool);
  const byName = new Map<string, AllowlistedRealtimeTool>();
  for (const tool of normalized) {
    if (byName.has(tool.name)) invalid('Allowlisted tool names must be unique');
    byName.set(tool.name, tool);
  }
  const names = input.enabledToolNames ?? normalized.map(tool => tool.name);
  if (names.length > 16 || new Set(names).size !== names.length) invalid('Enabled tool names are invalid');
  const tools = names.map(name => {
    if (!TOOL_NAME.test(name) || !byName.has(name)) invalid('Enabled tool is not on the server allowlist');
    return byName.get(name)!;
  });
  const maxOutputTokens = input.maxOutputTokens ?? 1_024;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 4_096) invalid('Realtime output token limit must be between 128 and 4096');
  return {
    type: 'realtime',
    model: input.model,
    instructions,
    max_output_tokens: maxOutputTokens,
    tool_choice: 'auto',
    tools,
    audio: {
      input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 } },
      output: { voice: input.voice },
    },
  };
}

export interface SafeTransferTarget {
  kind: 'telephone' | 'sip';
  uri: string;
}

function validDnsHost(host: string): boolean {
  if (host.length > 253 || !host.includes('.')) return false;
  return host.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

function canonicalTransferTarget(value: string): SafeTransferTarget {
  if (typeof value !== 'string' || value.length > 320 || CONTROL_CHARACTERS.test(value)) invalid('Transfer target is invalid');
  const trimmed = value.trim();
  const number = trimmed.startsWith('tel:') ? trimmed.slice(4) : trimmed;
  if (E164.test(number)) return { kind: 'telephone', uri: `tel:${number}` };
  const sip = /^sip:([A-Za-z0-9_.+~-]{1,64})@([A-Za-z0-9.-]{1,253});transport=tls$/i.exec(trimmed);
  if (!sip || !validDnsHost(sip[2])) invalid('Transfer target is invalid');
  return { kind: 'sip', uri: `sip:${sip[1]}@${sip[2].toLowerCase()};transport=tls` };
}

/** Returns a canonical target only when it exactly matches the server allowlist. */
export function validateTransferTarget(target: string, serverAllowlist: readonly string[]): SafeTransferTarget {
  if (!Array.isArray(serverAllowlist) || serverAllowlist.length < 1 || serverAllowlist.length > 100) invalid('Transfer allowlist must contain between one and one hundred targets');
  const requested = canonicalTransferTarget(target);
  const allowed = new Set(serverAllowlist.map(value => canonicalTransferTarget(value).uri));
  if (!allowed.has(requested.uri)) invalid('Transfer target is not allowlisted');
  return requested;
}
