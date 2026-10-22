import { constants, createPrivateKey, createPublicKey, randomUUID, sign, verify, type KeyObject } from 'node:crypto';
import {
  TOOL_BRIDGE_ASSERTION_TYPE, TOOL_BRIDGE_CLOCK_SKEW_SECONDS, TOOL_BRIDGE_MAX_LIFETIME_SECONDS,
  isToolBridgeData, isToolBridgeUuid, type ToolBridgeAssertionClaims, type ToolBridgeData, type ToolBridgeOperation,
} from '@operatoros/sdk';

export interface ToolBridgeSigningConfig { issuer: string; audience: string; keyId: string; privateKey: string | KeyObject }
export interface ToolBridgeVerificationConfig { issuer: string; audience: string; keyId: string; publicKey: string | KeyObject }
export class ToolBridgeAssertionError extends Error {
  readonly code = 'TOOL_BRIDGE_ASSERTION_REJECTED';
  constructor() { super('Tool bridge assertion rejected'); this.name = 'ToolBridgeAssertionError'; }
}
function reject(): never { throw new ToolBridgeAssertionError(); }
function validateConfig(config: { issuer: string; audience: string; keyId: string }): void {
  for (const raw of [config.issuer, config.audience]) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.origin !== raw || url.username || url.password
      || url.search || url.hash || url.pathname !== '/') reject();
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.keyId)) reject();
}
function rsaKey(value: string | KeyObject, privateKey: boolean): KeyObject {
  const key = typeof value === 'string' ? (privateKey ? createPrivateKey(value) : createPublicKey(value)) : value;
  if (key.type !== (privateKey ? 'private' : 'public') || key.asymmetricKeyType !== 'rsa'
    || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) reject();
  return key;
}
function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decode(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) reject();
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) reject();
  return JSON.parse(bytes.toString('utf8'));
}
/** Keys are supplied explicitly; this module creates or installs no persistent credential. */
export function signToolBridgeAssertion(
  config: ToolBridgeSigningConfig, operation: ToolBridgeOperation, data: ToolBridgeData,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  try {
    validateConfig(config);
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0
      || nowSeconds > Number.MAX_SAFE_INTEGER - TOOL_BRIDGE_MAX_LIFETIME_SECONDS || !isToolBridgeData(operation, data)) reject();
    const key = rsaKey(config.privateKey, true);
    const payload: ToolBridgeAssertionClaims = {
      iss: config.issuer, aud: config.audience, iat: nowSeconds, nbf: nowSeconds,
      exp: nowSeconds + TOOL_BRIDGE_MAX_LIFETIME_SECONDS, jti: randomUUID(), op: operation, data,
    };
    const input = `${encode({ alg: 'RS256', typ: TOOL_BRIDGE_ASSERTION_TYPE, kid: config.keyId })}.${encode(payload)}`;
    const token = `${input}.${sign('RSA-SHA256', Buffer.from(input), { key, padding: constants.RSA_PKCS1_PADDING }).toString('base64url')}`;
    if (Buffer.byteLength(token) > 16_384) reject();
    return token;
  } catch { return reject(); }
}
/** Signature validation does not replace the consumer's atomic revision/replay ledger. */
export function verifyToolBridgeAssertion(
  config: ToolBridgeVerificationConfig, operation: ToolBridgeOperation, token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ToolBridgeAssertionClaims {
  try {
    validateConfig(config);
    if (typeof token !== 'string' || Buffer.byteLength(token) > 16_384 || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) reject();
    const parts = token.split('.');
    if (parts.length !== 3) reject();
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decode(headerPart) as Record<string, unknown>;
    if (!header || typeof header !== 'object' || Array.isArray(header) || Object.keys(header).length !== 3
      || header.alg !== 'RS256' || header.typ !== TOOL_BRIDGE_ASSERTION_TYPE || header.kid !== config.keyId) reject();
    if (!/^[A-Za-z0-9_-]+$/.test(signaturePart)) reject();
    const signature = Buffer.from(signaturePart, 'base64url');
    if (signature.toString('base64url') !== signaturePart || !verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), {
      key: rsaKey(config.publicKey, false), padding: constants.RSA_PKCS1_PADDING,
    }, signature)) reject();
    const payload = decode(payloadPart) as ToolBridgeAssertionClaims;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 8
      || payload.iss !== config.issuer || payload.aud !== config.audience || payload.op !== operation
      || !isToolBridgeUuid(payload.jti) || !isToolBridgeData(operation, payload.data)) reject();
    if (![payload.iat, payload.nbf, payload.exp].every(Number.isSafeInteger)
      || payload.iat < 0 || payload.nbf !== payload.iat || payload.exp <= payload.iat
      || payload.exp - payload.iat > TOOL_BRIDGE_MAX_LIFETIME_SECONDS
      || payload.iat > nowSeconds + TOOL_BRIDGE_CLOCK_SKEW_SECONDS
      || payload.nbf > nowSeconds + TOOL_BRIDGE_CLOCK_SKEW_SECONDS
      || payload.exp <= nowSeconds - TOOL_BRIDGE_CLOCK_SKEW_SECONDS) reject();
    return payload;
  } catch { return reject(); }
}
