import type { Request, Response } from "express";

export interface AuthProviderConfig {
  orgId: string;
  authMode: string;
  entraTenantId?: string | null;
  entraClientId?: string | null;
  entraClientSecret?: string | null;
  entraRedirectUri?: string | null;
  entraAllowedDomains?: string[] | null;
  entraJitProvisioningEnabled?: boolean;
}

export interface AuthInitiateResult {
  redirectUrl: string;
  state: string;
  nonce: string;
}

export interface AuthCallbackResult {
  success: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
  upn?: string;
  entraObjectId?: string;
  entraTenantId?: string;
  groups?: string[];
  department?: string;
  jobTitle?: string;
  error?: string;
}

export interface LocalCredentialResult {
  success: boolean;
  userId?: string;
  error?: string;
  needsRehash?: boolean;
}

export interface AuthProvider {
  readonly type: string;
  initiateLogin(req: Request, config: AuthProviderConfig): Promise<AuthInitiateResult>;
  handleCallback(req: Request, config: AuthProviderConfig): Promise<AuthCallbackResult>;
  validateCredentials?(username: string, password: string, storedHash: string): Promise<LocalCredentialResult>;
}

export interface ScimProvider {
  syncUsers(orgId: string, config: AuthProviderConfig): Promise<void>;
  provisionUser(orgId: string, userData: any): Promise<void>;
  deprovisionUser(orgId: string, userId: string): Promise<void>;
}

export interface SamlProvider extends AuthProvider {
  readonly type: "saml";
  getMetadata(config: AuthProviderConfig): string;
}

export interface OidcProvider extends AuthProvider {
  readonly type: "oidc";
  getDiscoveryUrl(config: AuthProviderConfig): string;
}
