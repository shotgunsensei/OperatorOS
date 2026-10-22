import { z } from 'zod';
import {
  BRANDFORGE_INTEGRATION_CATALOG,
  integrationConnectInput,
  parsePhase31,
} from './brandforgeos-phase31.js';
import {
  isOperatorOSDeterministicProviderTestEnvironment,
  sanitizeSharedMetadata,
} from './shared-service-safety.js';

export const BRANDFORGE_CONNECTOR_POLICY_VERSION = 'brandforge-connector-policy-v1';
export type BrandForgeConnector = (typeof BRANDFORGE_INTEGRATION_CATALOG)[number];

export type BrandForgeConnectorPolicy =
  | { allowed: true; catalog: BrandForgeConnector; execution: 'deterministic_test'; externalDelivery: false }
  | {
    allowed: false;
    statusCode: 404 | 503;
    code: 'BRANDFORGE_PROVIDER_UNSUPPORTED' | 'PROVIDER_ADAPTER_UNAVAILABLE';
    reasonCode: 'BRANDFORGE_PROVIDER_UNSUPPORTED' | 'BRANDFORGE_PROVIDER_CONTRACT_REQUIRED';
    execution: 'unavailable';
    externalDelivery: false;
  };

/** No production adapter is registered until its provider and data contract are reviewed. */
export function brandForgeConnectorPolicy(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): BrandForgeConnectorPolicy {
  const catalog = BRANDFORGE_INTEGRATION_CATALOG.find(item => item.provider === provider);
  if (!catalog) return {
    allowed: false, statusCode: 404, code: 'BRANDFORGE_PROVIDER_UNSUPPORTED',
    reasonCode: 'BRANDFORGE_PROVIDER_UNSUPPORTED', execution: 'unavailable', externalDelivery: false,
  };
  // Preserve the existing test-only connector, but an accidentally mixed
  // production/test environment must not expose synthetic success as runtime readiness.
  const ordinaryTestFlag = env.NODE_ENV === 'test' || env.APP_ENV === 'test';
  if (ordinaryTestFlag && isOperatorOSDeterministicProviderTestEnvironment(env)) {
    return { allowed: true, catalog, execution: 'deterministic_test', externalDelivery: false };
  }
  return {
    allowed: false, statusCode: 503, code: 'PROVIDER_ADAPTER_UNAVAILABLE',
    reasonCode: 'BRANDFORGE_PROVIDER_CONTRACT_REQUIRED', execution: 'unavailable', externalDelivery: false,
  };
}

export function brandForgeConnectorAvailability(provider: string, env: NodeJS.ProcessEnv = process.env) {
  const policy = brandForgeConnectorPolicy(provider, env);
  return {
    runtimeAvailable: policy.allowed,
    availability: policy.allowed ? 'test_only' as const : 'planned' as const,
    execution: policy.execution,
    externalDelivery: false as const,
    reasonCode: policy.allowed ? 'DETERMINISTIC_TEST_ADAPTER' : policy.reasonCode,
    policyVersion: BRANDFORGE_CONNECTOR_POLICY_VERSION,
  };
}

export function brandForgeConnectorFailure(policy: Extract<BrandForgeConnectorPolicy, { allowed: false }>) {
  return {
    error: policy.code === 'BRANDFORGE_PROVIDER_UNSUPPORTED'
      ? 'Integration provider is unsupported'
      : 'A live provider contract is not available. Use Reports and Exports for deliberate provider handoff.',
    code: policy.code,
    reasonCode: policy.reasonCode,
    externalDelivery: false as const,
  };
}

function invalidConfiguration(): never {
  throw Object.assign(new Error('Connection metadata must be bounded public JSON without credential fields'), {
    code: 'BRANDFORGE_INPUT_INVALID', statusCode: 400, field: 'publicConfig',
  });
}

function validateJson(value: unknown, depth = 0): void {
  if (depth > 4) invalidConfiguration();
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidConfiguration();
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 500) invalidConfiguration();
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 20) invalidConfiguration();
    value.forEach(item => validateJson(item, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalidConfiguration();
  const entries = Object.entries(value);
  if (entries.length > 40) invalidConfiguration();
  for (const [key, nested] of entries) {
    if (!key || key.length > 80) invalidConfiguration();
    validateJson(nested, depth + 1);
  }
}

function publicConfiguration(metadata: unknown) {
  validateJson(metadata);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) invalidConfiguration();
  const safe = sanitizeSharedMetadata(metadata);
  const serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, 'utf8') > 16_384 || serialized !== JSON.stringify(safe)) invalidConfiguration();
  return safe;
}

/** Separate public metadata from the existing server-only encrypted secret input. */
export function parseBrandForgeConnectorConfiguration(input: unknown) {
  // Validate before schema parsing: object-key filtering by a parser must not
  // turn an unsafe public configuration into an apparently accepted one.
  if (input && typeof input === 'object' && !Array.isArray(input) &&
      Object.hasOwn(input, 'publicConfig') && (input as Record<string, unknown>).publicConfig !== undefined) {
    publicConfiguration((input as Record<string, unknown>).publicConfig);
  }
  const parsed = parsePhase31(integrationConnectInput, input);
  if (parsed.mode === 'live') throw Object.assign(new Error('The available connector is a local test only'), {
    code: 'BRANDFORGE_INPUT_INVALID', statusCode: 400, field: 'mode',
  });
  const safe = publicConfiguration(parsed.publicConfig ?? {});
  // Neither a browser flag nor a saved encrypted reference proves callback acceptance.
  return { ...parsed, publicConfig: safe, callbackReady: false as const };
}

const syncInput = z.object({
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/).optional(),
}).strict();

export function parseBrandForgeConnectorSync(input: unknown) {
  return parsePhase31(syncInput, input);
}
