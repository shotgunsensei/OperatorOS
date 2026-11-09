export type SnapProofCaptureIdentity = Readonly<{ userId: string; tenantId: string }>;
export type SnapProofCaptureIdentityStatus = 'match' | 'missing' | 'invalid' | 'mismatch';

/** A request consistency assertion, never an identity or authorization source. */
export function snapProofCaptureIdentityStatus(input: Record<string, unknown>, trusted: SnapProofCaptureIdentity): SnapProofCaptureIdentityStatus {
  if (!Object.hasOwn(input, 'expectedCaptureIdentity')) return 'missing';
  const value = input.expectedCaptureIdentity;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const keys = Object.keys(value);
  if (keys.length !== 2 || !Object.hasOwn(value, 'userId') || !Object.hasOwn(value, 'tenantId')) return 'invalid';
  const identity = value as Record<string, unknown>;
  if (![identity.userId, identity.tenantId].every(id => typeof id === 'string' && /^[\x21-\x7e]{1,128}$/.test(id))) return 'invalid';
  return identity.userId === trusted.userId && identity.tenantId === trusted.tenantId ? 'match' : 'mismatch';
}
