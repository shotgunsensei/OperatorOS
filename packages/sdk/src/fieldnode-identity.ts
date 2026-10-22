/** Canonical identity namespace, never derived from an incoming Host header. */
export const FIELDNODE_IDENTITY_ISSUER = 'https://operatoros.net' as const;
export const FIELDNODE_IDENTITY_CONTRACT_VERSION = 1 as const;

export type FieldNodeIdentityMembershipRole = 'owner' | 'admin' | 'member' | 'viewer';
export type FieldNodeIdentityModuleAccess = 'viewer' | 'user' | 'manager';

/** A read of current authority, not a bearer credential or device grant. */
export interface FieldNodeIdentityResponse {
  readonly contractVersion: typeof FIELDNODE_IDENTITY_CONTRACT_VERSION;
  readonly issuer: typeof FIELDNODE_IDENTITY_ISSUER;
  /** Immutable OperatorOS user ID; email is not an identity-linking key. */
  readonly subject: string;
  readonly tenantId: string;
  readonly module: 'fieldnode';
  /** Actual persisted membership, excluding platform support overrides. */
  readonly membershipRole: FieldNodeIdentityMembershipRole;
  readonly moduleAccessLevel: FieldNodeIdentityModuleAccess;
  readonly sessionExpiresAt: string;
  /** OperatorOS currently provides no durable AMR/auth-time attestation. */
  readonly authenticationAssurance: 'not_attested';
}
