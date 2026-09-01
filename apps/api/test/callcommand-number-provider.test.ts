import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpenAiRealtimeAcceptConfig,
  buildOpenAiSipDialTwiml,
  CallCommandNumberProviderError,
  escapeTwiml,
  TwilioCallCommandNumberProvider,
  type TwilioNumberApi,
  type TwilioNumberApiFactory,
  type TwilioProvisionRequest,
  type TwilioRawIncomingNumber,
  type TwilioRoutingUpdateRequest,
  type TwilioSearchRequest,
  validateTransferTarget,
} from '../src/lib/callcommand-number-provider.js';

const PARENT_SID = `AC${'1'.repeat(32)}`;
const API_KEY_SID = `SK${'4'.repeat(32)}`;
const TENANT_SID = `AC${'2'.repeat(32)}`;
const NUMBER_SID = `PN${'3'.repeat(32)}`;
const AUTH_TOKEN = 'sensitiveTwilioCredential1234567';
const API_KEY_SECRET = 'apiKeySecretCredential765432109';
const SUBACCOUNT_AUTH_TOKEN = 'subaccountCredential9876543210';
const PHONE = '+15551234567';
const ORIGIN = 'https://callcommand-ai.operatoros.net';

class FakeTwilioApi implements TwilioNumberApi {
  createCalls: Array<{ friendlyName: string }> = [];
  fetchedAccounts: string[] = [];
  searchCalls: Array<{ accountSid: string; country: string; input: TwilioSearchRequest }> = [];
  tollFreeSearchCalls: Array<{ accountSid: string; country: string; input: TwilioSearchRequest }> = [];
  listNumberCalls: Array<{ accountSid: string; limit: number }> = [];
  provisionCalls: Array<{ accountSid: string; input: TwilioProvisionRequest }> = [];
  fetchNumberCalls: Array<{ accountSid: string; numberSid: string }> = [];
  updateCalls: Array<{ accountSid: string; numberSid: string; input: TwilioRoutingUpdateRequest }> = [];
  releaseCalls: Array<{ accountSid: string; numberSid: string }> = [];
  failSearch = false;
  searchFailureMessage = `provider leaked ${AUTH_TOKEN}`;

  currentNumber: TwilioRawIncomingNumber = {
    accountSid: TENANT_SID,
    sid: NUMBER_SID,
    phoneNumber: PHONE,
    friendlyName: 'Customer support',
    capabilities: { voice: true, sms: true, mms: false, fax: false },
    voiceUrl: `${ORIGIN}/v1/callcommand/voice`,
    voiceMethod: 'POST',
    statusCallback: `${ORIGIN}/v1/callcommand/status`,
    statusCallbackMethod: 'POST',
    authToken: AUTH_TOKEN,
  };

  async createSubaccount(input: { friendlyName: string }) {
    this.createCalls.push(input);
    return { sid: TENANT_SID, friendlyName: input.friendlyName, status: 'active', authToken: SUBACCOUNT_AUTH_TOKEN };
  }

  async fetchSubaccount(accountSid: string) {
    this.fetchedAccounts.push(accountSid);
    return { sid: accountSid, friendlyName: 'Tenant account', status: 'active', authToken: AUTH_TOKEN };
  }

  async searchLocalNumbers(accountSid: string, country: string, input: TwilioSearchRequest) {
    this.searchCalls.push({ accountSid, country, input });
    if (this.failSearch) throw new Error(this.searchFailureMessage);
    return [
      {
        phoneNumber: PHONE,
        friendlyName: '(555) 123-4567',
        isoCountry: 'US',
        locality: 'Atlanta',
        region: 'GA',
        postalCode: '30301',
        addressRequirements: 'none',
        capabilities: { voice: true, sms: true, mms: false, fax: false },
        authToken: AUTH_TOKEN,
      },
      {
        phoneNumber: '+15557654321',
        friendlyName: 'Not voice capable',
        isoCountry: 'US',
        capabilities: { voice: false, sms: true },
      },
      {
        phoneNumber: '+442071838750',
        friendlyName: 'Wrong country',
        isoCountry: 'GB',
        capabilities: { voice: true },
      },
    ];
  }

  async searchTollFreeNumbers(accountSid: string, country: string, input: TwilioSearchRequest) {
    this.tollFreeSearchCalls.push({ accountSid, country, input });
    return [{
      phoneNumber: '+18005550199',
      friendlyName: '(800) 555-0199',
      isoCountry: 'US',
      locality: null,
      region: null,
      postalCode: null,
      addressRequirements: 'none',
      capabilities: { voice: true, sms: true, mms: true, fax: false },
    }];
  }

  async provisionNumber(accountSid: string, input: TwilioProvisionRequest) {
    this.provisionCalls.push({ accountSid, input });
    this.currentNumber = {
      ...this.currentNumber,
      accountSid,
      phoneNumber: input.phoneNumber,
      friendlyName: input.friendlyName,
      voiceUrl: input.voiceUrl,
      voiceMethod: input.voiceMethod,
      statusCallback: input.statusCallback,
      statusCallbackMethod: input.statusCallbackMethod,
    };
    return this.currentNumber;
  }

  async fetchNumber(accountSid: string, numberSid: string) {
    this.fetchNumberCalls.push({ accountSid, numberSid });
    return this.currentNumber;
  }

  async listNumbers(accountSid: string, limit: number) {
    this.listNumberCalls.push({ accountSid, limit });
    return [this.currentNumber];
  }

  async updateNumber(accountSid: string, numberSid: string, input: TwilioRoutingUpdateRequest) {
    this.updateCalls.push({ accountSid, numberSid, input });
    this.currentNumber = { ...this.currentNumber, ...input };
    return this.currentNumber;
  }

  async releaseNumber(accountSid: string, numberSid: string) {
    this.releaseCalls.push({ accountSid, numberSid });
    return true;
  }
}

function fixture() {
  const api = new FakeTwilioApi();
  const factoryCalls: Parameters<TwilioNumberApiFactory>[0][] = [];
  const factory: TwilioNumberApiFactory = input => {
    factoryCalls.push(input);
    return api;
  };
  const provider = new TwilioCallCommandNumberProvider({ allowedWebhookOrigins: [ORIGIN], apiFactory: factory });
  const credentials = { accountSid: PARENT_SID, authToken: AUTH_TOKEN };
  return { api, factoryCalls, provider, credentials };
}

test('tenant subaccount creation and reuse return only sanitized account metadata', async () => {
  const { api, factoryCalls, provider, credentials } = fixture();
  const persistedCredentials: unknown[] = [];
  const created = await provider.ensureTenantAccount({
    credentials,
    friendlyName: 'Acme tenant',
    timeoutMs: 4_000,
    persistCreatedCredential: async credential => { persistedCredentials.push(credential); },
  });
  assert.deepEqual(created, {
    provider: 'twilio',
    providerAccountId: TENANT_SID,
    friendlyName: 'Acme tenant',
    status: 'active',
    reused: false,
    credentialState: 'persisted_on_create',
  });
  assert.deepEqual(api.createCalls, [{ friendlyName: 'Acme tenant' }]);
  assert.deepEqual(persistedCredentials, [{ provider: 'twilio', providerAccountId: TENANT_SID, authToken: SUBACCOUNT_AUTH_TOKEN }]);
  assert.equal(factoryCalls[0].timeoutMs, 4_000);
  assert.doesNotMatch(JSON.stringify(created), /authToken|Credential9876543210|sensitiveTwilioCredential/);

  const reused = await provider.ensureTenantAccount({ credentials, friendlyName: 'Ignored on reuse', existingProviderAccountId: TENANT_SID });
  assert.equal(reused.reused, true);
  assert.equal(reused.credentialState, 'caller_managed_existing');
  assert.equal(reused.providerAccountId, TENANT_SID);
  assert.deepEqual(api.fetchedAccounts, [TENANT_SID]);
  assert.equal(api.createCalls.length, 1);
});

test('new subaccounts cannot succeed without durable credential persistence', async () => {
  const { api, provider, credentials } = fixture();
  await assert.rejects(
    () => provider.ensureTenantAccount({ credentials, friendlyName: 'Missing credential sink' }),
    error => error instanceof CallCommandNumberProviderError && error.code === 'INVALID_INPUT',
  );
  assert.equal(api.createCalls.length, 0, 'the provider must not be mutated before a credential sink is present');

  await assert.rejects(
    () => provider.ensureTenantAccount({
      credentials,
      friendlyName: 'Failing credential sink',
      persistCreatedCredential: async () => { throw new Error(`secret persistence failed for ${SUBACCOUNT_AUTH_TOKEN}`); },
    }),
    error => {
      assert.ok(error instanceof CallCommandNumberProviderError);
      assert.equal(error.code, 'PROVIDER_ACCOUNT_FAILED');
      assert.equal(error.message, 'Twilio tenant account credential persistence failed');
      assert.doesNotMatch(JSON.stringify(error), new RegExp(SUBACCOUNT_AUTH_TOKEN));
      assert.doesNotMatch(error.message, new RegExp(SUBACCOUNT_AUTH_TOKEN));
      return true;
    },
  );
  assert.equal(api.createCalls.length, 1);
});

test('voice number search validates and forwards only bounded official filters', async () => {
  const { api, provider, credentials } = fixture();
  const results = await provider.searchVoiceNumbers({
    credentials,
    providerAccountId: TENANT_SID,
    country: 'us',
    areaCode: '404',
    locality: 'Atlanta',
    postalCode: '30301',
    limit: 7,
  });
  assert.deepEqual(api.searchCalls, [{
    accountSid: TENANT_SID,
    country: 'US',
    input: { voiceEnabled: true, excludeAllAddressRequired: true, limit: 7, areaCode: 404, inLocality: 'Atlanta', inPostalCode: '30301' },
  }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].phoneNumber, PHONE);
  assert.equal(results[0].numberType, 'local');
  assert.equal(results[0].capabilities.voice, true);
  assert.equal(results[0].cost.quoteRequired, true);
  assert.doesNotMatch(JSON.stringify(results), /authToken|sensitiveTwilioCredential/);

  await assert.rejects(() => provider.searchVoiceNumbers({ credentials, providerAccountId: TENANT_SID, country: 'ZZ' }));
  await assert.rejects(() => provider.searchVoiceNumbers({ credentials, providerAccountId: TENANT_SID, country: 'GB', areaCode: '404' }));
  await assert.rejects(() => provider.searchVoiceNumbers({ credentials, providerAccountId: TENANT_SID, country: 'US', limit: 51 }));
  await assert.rejects(() => provider.searchVoiceNumbers({ credentials, providerAccountId: TENANT_SID, country: 'US', locality: 'Atlanta\r\nInjected' }));
  assert.equal(api.searchCalls.length, 1);
});

test('toll-free search, vanity filters, and provider inventory remain account-scoped', async () => {
  const { api, provider, credentials } = fixture();
  const results = await provider.searchVoiceNumbers({
    credentials,
    providerAccountId: TENANT_SID,
    country: 'US',
    numberType: 'toll_free',
    contains: '555',
    limit: 5,
  });
  assert.equal(api.searchCalls.length, 0);
  assert.deepEqual(api.tollFreeSearchCalls, [{
    accountSid: TENANT_SID,
    country: 'US',
    input: { voiceEnabled: true, excludeAllAddressRequired: true, contains: '555', limit: 5 },
  }]);
  assert.equal(results[0].numberType, 'toll_free');
  assert.equal(results[0].phoneNumber, '+18005550199');

  const inventory = await provider.listNumbers({ credentials, providerAccountId: TENANT_SID, limit: 25 });
  assert.deepEqual(api.listNumberCalls, [{ accountSid: TENANT_SID, limit: 25 }]);
  assert.equal(inventory[0].providerAccountId, TENANT_SID);
  assert.equal(inventory[0].providerNumberId, NUMBER_SID);
  await assert.rejects(() => provider.listNumbers({ credentials, providerAccountId: PARENT_SID, limit: 1001 }));
});

test('provider errors are generic and never serialize provider credential text', async () => {
  const { api, provider, credentials } = fixture();
  api.failSearch = true;
  await assert.rejects(
    () => provider.searchVoiceNumbers({ credentials, providerAccountId: TENANT_SID, country: 'US' }),
    error => {
      assert.ok(error instanceof CallCommandNumberProviderError);
      assert.equal(error.code, 'PROVIDER_SEARCH_FAILED');
      assert.doesNotMatch(JSON.stringify(error), new RegExp(AUTH_TOKEN));
      assert.doesNotMatch(error.message, new RegExp(AUTH_TOKEN));
      return true;
    },
  );
});

test('connector API-key credentials keep the parent account as resource authority without exposing key material', async () => {
  const { api, factoryCalls, provider } = fixture();
  const credentials = { accountSid: PARENT_SID, apiKeySid: API_KEY_SID, authToken: API_KEY_SECRET };
  const reused = await provider.ensureTenantAccount({
    credentials,
    friendlyName: 'API key tenant',
    existingProviderAccountId: TENANT_SID,
  });
  assert.deepEqual(factoryCalls[0], {
    parentAccountSid: PARENT_SID,
    apiKeySid: API_KEY_SID,
    authToken: API_KEY_SECRET,
    timeoutMs: 10_000,
  });
  assert.equal(reused.providerAccountId, TENANT_SID);
  assert.equal(reused.credentialState, 'caller_managed_existing');
  assert.doesNotMatch(JSON.stringify(reused), new RegExp(`${API_KEY_SID}|${API_KEY_SECRET}`));

  api.failSearch = true;
  api.searchFailureMessage = `provider leaked ${API_KEY_SID} and ${API_KEY_SECRET}`;
  await assert.rejects(
    () => provider.searchVoiceNumbers({ credentials, providerAccountId: TENANT_SID, country: 'US' }),
    error => {
      assert.ok(error instanceof CallCommandNumberProviderError);
      const serialized = JSON.stringify(error);
      assert.doesNotMatch(serialized, new RegExp(API_KEY_SID));
      assert.doesNotMatch(serialized, new RegExp(API_KEY_SECRET));
      return true;
    },
  );

  await assert.rejects(() => provider.ensureTenantAccount({
    credentials: { accountSid: PARENT_SID, apiKeySid: `SK${'z'.repeat(32)}`, authToken: API_KEY_SECRET },
    friendlyName: 'Invalid API key SID',
    existingProviderAccountId: TENANT_SID,
  }));
});

test('provisioning sends fixed POST routing to allowed HTTPS endpoints only', async () => {
  const { api, provider, credentials } = fixture();
  const provisioned = await provider.provisionNumber({
    credentials,
    providerAccountId: TENANT_SID,
    selectedPhoneNumber: PHONE,
    friendlyName: 'Acme support',
    routing: {
      voiceUrl: `${ORIGIN}/v1/callcommand/voice?tenant=acme&mode=ai`,
      statusCallbackUrl: `${ORIGIN}/v1/callcommand/status`,
    },
  });
  assert.deepEqual(api.provisionCalls, [{
    accountSid: TENANT_SID,
    input: {
      phoneNumber: PHONE,
      friendlyName: 'Acme support',
      voiceUrl: `${ORIGIN}/v1/callcommand/voice?tenant=acme&mode=ai`,
      voiceMethod: 'POST',
      statusCallback: `${ORIGIN}/v1/callcommand/status`,
      statusCallbackMethod: 'POST',
    },
  }]);
  assert.equal(provisioned.routing.voiceMethod, 'POST');
  assert.equal(provisioned.routing.voiceUrlAllowed, true);
  assert.doesNotMatch(JSON.stringify(provisioned), /authToken|sensitiveTwilioCredential/);

  for (const voiceUrl of [
    'http://callcommand-ai.operatoros.net/voice',
    'https://evil.example/voice',
    `${ORIGIN}/voice?auth_token=secret`,
    `https://user:pass@callcommand-ai.operatoros.net/voice`,
  ]) {
    await assert.rejects(() => provider.provisionNumber({
      credentials,
      providerAccountId: TENANT_SID,
      selectedPhoneNumber: PHONE,
      friendlyName: 'Unsafe',
      routing: { voiceUrl, statusCallbackUrl: `${ORIGIN}/status` },
    }));
  }
  await assert.rejects(() => provider.provisionNumber({
    credentials,
    providerAccountId: TENANT_SID,
    selectedPhoneNumber: '555-123-4567',
    friendlyName: 'Bad number',
    routing: { voiceUrl: `${ORIGIN}/voice`, statusCallbackUrl: `${ORIGIN}/status` },
  }));
  assert.equal(api.provisionCalls.length, 1);
});

test('health, routing update, and destructive release are fail-closed', async () => {
  const { api, provider, credentials } = fixture();
  const health = await provider.inspectNumber({ credentials, providerAccountId: TENANT_SID, providerNumberId: NUMBER_SID });
  assert.equal(health.health, 'healthy');
  assert.deepEqual(health.healthReasons, []);

  const updated = await provider.updateRouting({
    credentials,
    providerAccountId: TENANT_SID,
    providerNumberId: NUMBER_SID,
    routing: { voiceUrl: `${ORIGIN}/v2/voice`, statusCallbackUrl: `${ORIGIN}/v2/status` },
  });
  assert.equal(updated.routing.voiceUrl, `${ORIGIN}/v2/voice`);
  assert.deepEqual(api.updateCalls[0].input, {
    voiceUrl: `${ORIGIN}/v2/voice`, voiceMethod: 'POST', statusCallback: `${ORIGIN}/v2/status`, statusCallbackMethod: 'POST',
  });

  await assert.rejects(() => provider.releaseNumber({
    credentials,
    providerAccountId: TENANT_SID,
    providerNumberId: NUMBER_SID,
    confirmation: { confirmed: false as true, expectedProviderNumberId: NUMBER_SID, expectedPhoneNumber: PHONE },
  }), (error: unknown) => error instanceof CallCommandNumberProviderError && error.code === 'RELEASE_NOT_CONFIRMED');
  await assert.rejects(() => provider.releaseNumber({
    credentials,
    providerAccountId: TENANT_SID,
    providerNumberId: NUMBER_SID,
    confirmation: { confirmed: true, expectedProviderNumberId: NUMBER_SID, expectedPhoneNumber: '+15550000000' },
  }));
  assert.equal(api.releaseCalls.length, 0);

  const released = await provider.releaseNumber({
    credentials,
    providerAccountId: TENANT_SID,
    providerNumberId: NUMBER_SID,
    confirmation: { confirmed: true, expectedProviderNumberId: NUMBER_SID, expectedPhoneNumber: PHONE },
  });
  assert.equal(released.released, true);
  assert.equal(released.status, 'released');
  assert.deepEqual(api.releaseCalls, [{ accountSid: TENANT_SID, numberSid: NUMBER_SID }]);
});

test('OpenAI SIP TwiML uses the fixed TLS host and XML-escapes callback attributes', () => {
  const xml = buildOpenAiSipDialTwiml({
    openAiProjectId: 'proj_OperatorOS1234',
    statusCallbackUrl: `${ORIGIN}/sip/status?a=1&b=2`,
    allowedWebhookOrigins: [ORIGIN],
  });
  assert.match(xml, /sip:proj_OperatorOS1234@sip\.api\.openai\.com;transport=tls/);
  assert.match(xml, /statusCallback="https:\/\/callcommand-ai\.operatoros\.net\/sip\/status\?a=1&amp;b=2"/);
  assert.doesNotMatch(xml, /<Stream|WebSocket|media/i);
  assert.equal(escapeTwiml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
  assert.throws(() => buildOpenAiSipDialTwiml({ openAiProjectId: 'proj_good"><Sip>sip:evil.example' }));
  assert.throws(() => buildOpenAiSipDialTwiml({
    openAiProjectId: 'proj_OperatorOS1234',
    statusCallbackUrl: 'https://evil.example/status',
    allowedWebhookOrigins: [ORIGIN],
  }));
});

test('Realtime accept config is bounded and selects only server-allowlisted closed tool schemas', () => {
  const config = buildOpenAiRealtimeAcceptConfig({
    model: 'gpt-realtime-2.1-mini',
    voice: 'cedar',
    serverCompiledInstructions: 'You are the tenant support receptionist. Follow server policy.',
    allowlistedTools: [
      {
        type: 'function',
        name: 'create_ticket',
        description: 'Create a tenant-scoped ticket after server authorization.',
        parameters: {
          type: 'object',
          properties: { summary: { type: 'string', maxLength: 500 } },
          required: ['summary'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'lookup_status',
        description: 'Read a tenant-scoped ticket status.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
    enabledToolNames: ['create_ticket'],
    maxOutputTokens: 512,
  });
  assert.equal(config.tools.length, 1);
  assert.equal(config.tools[0].name, 'create_ticket');
  assert.equal(config.max_output_tokens, 512);
  assert.equal(config.audio.output.voice, 'cedar');

  assert.throws(() => buildOpenAiRealtimeAcceptConfig({
    model: 'gpt-realtime-2.1-mini', voice: 'cedar', serverCompiledInstructions: 'Safe', allowlistedTools: [], enabledToolNames: ['not_allowed'],
  }));
  assert.throws(() => buildOpenAiRealtimeAcceptConfig({
    model: 'gpt-realtime-2.1-mini',
    voice: 'cedar',
    serverCompiledInstructions: 'Safe',
    allowlistedTools: [{
      type: 'function', name: 'unsafe_ref', description: 'Unsafe external reference.',
      parameters: { type: 'object', properties: { value: { $ref: 'https://evil.example/schema.json' } }, additionalProperties: false },
    }],
  }));
  assert.throws(() => buildOpenAiRealtimeAcceptConfig({
    model: 'gpt-realtime-2.1-mini', voice: 'cedar', serverCompiledInstructions: 'x'.repeat(12_001), allowlistedTools: [],
  }));
});

test('transfer targets are canonicalized and accepted only by exact server allowlist', () => {
  assert.deepEqual(validateTransferTarget('+15551234567', ['tel:+15551234567']), { kind: 'telephone', uri: 'tel:+15551234567' });
  assert.deepEqual(
    validateTransferTarget('sip:agent@EXAMPLE.com;transport=tls', ['sip:agent@example.com;transport=tls']),
    { kind: 'sip', uri: 'sip:agent@example.com;transport=tls' },
  );
  assert.throws(() => validateTransferTarget('tel:+15557654321', ['tel:+15551234567']));
  assert.throws(() => validateTransferTarget('sip:agent@evil.example;transport=tls', ['sip:agent@example.com;transport=tls']));
  assert.throws(() => validateTransferTarget('sip:agent@example.com;transport=udp', ['sip:agent@example.com;transport=tls']));
  assert.throws(() => validateTransferTarget('tel:+15551234567\r\nX-Header: injected', ['tel:+15551234567']));
});
