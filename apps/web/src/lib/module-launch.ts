'use client';

import { getActiveTenantId } from './auth';
import { navigateToModuleProgrammatically } from './launch';
import { getModuleById } from '../../../../packages/modules/registry.js';

export interface SsoAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  returnTo: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface ModuleLaunchResponse {
  code?: string;
  launchUrl?: string;
  redirectUrl?: string;
  redirect_url?: string;
  expiresIn?: number;
  jti?: string;
  issuer?: string;
  audience?: string;
  tenantId?: string;
  module?: {
    id: string;
    slug: string;
    name: string;
    hostname?: string;
    entitlementKey?: string;
  };
}

export class ModuleLaunchError extends Error {
  status: number;
  code?: string;
  body: unknown;

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = 'ModuleLaunchError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function launchUrlFromResponse(data: ModuleLaunchResponse): string | null {
  return data.launchUrl || data.redirectUrl || data.redirect_url || null;
}

export function friendlyModuleLaunchError(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string } | null;
  if (!e) return 'Module launch failed.';
  if (e.code === 'MODULE_ACCESS_DENIED') return 'Access denied for the selected tenant.';
  if (e.code === 'MODULE_DISABLED') return 'This module is currently disabled.';
  if (e.code === 'MODULE_UNAVAILABLE') return 'This module is not available yet.';
  if (e.code === 'TENANT_REQUIRED') return 'Select a tenant before launching this module.';
  if (e.code === 'TENANT_NOT_FOUND') return 'The selected tenant is not available.';
  if (e.code === 'TENANT_SUSPENDED') return 'This tenant is suspended.';
  if (e.code === 'SSO_SECRET_NOT_CONFIGURED') return 'SSO is not configured for launches.';
  if (e.code === 'RATE_LIMITED') return 'Too many launch attempts. Try again shortly.';
  if (e.status === 0 || e.code === 'NETWORK_ERROR') return 'Network failure while issuing SSO handoff.';
  return e.message || 'Module launch failed.';
}

export async function issueModuleLaunch(
  moduleId: string,
  tenantId: string | null | undefined = getActiveTenantId(),
  authorization?: SsoAuthorizationRequest,
): Promise<ModuleLaunchResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  let res: Response;
  try {
    res = await fetch('/api/sso/issue', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ moduleId, tenantId, ...authorization }),
    });
  } catch (err) {
    throw new ModuleLaunchError((err as Error)?.message || 'Failed to fetch', 0, 'NETWORK_ERROR');
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { error: text }; }
  }

  if (!res.ok) {
    throw new ModuleLaunchError(
      data?.error || data?.message || res.statusText || 'Module launch failed',
      res.status,
      data?.code,
      data,
    );
  }

  const launchUrl = launchUrlFromResponse(data ?? {});
  if (!launchUrl) {
    throw new ModuleLaunchError('SSO issue succeeded but no launch URL was returned.', res.status, 'LAUNCH_URL_MISSING', data);
  }

  return data as ModuleLaunchResponse;
}

export async function launchModuleViaSso(
  moduleId: string,
  _tenantId?: string | null,
): Promise<ModuleLaunchResponse> {
  const module = getModuleById(moduleId);
  if (!module || module.status !== 'active') {
    throw new ModuleLaunchError('Module is not available for launch.', 404, 'MODULE_UNAVAILABLE');
  }

  // Enter the module host first. Its middleware owns the state/nonce/PKCE
  // transaction cookies, then performs a central-auth round trip only when
  // that host does not already have a valid local session.
  await navigateToModuleProgrammatically(module.launchUrl);
  return {
    launchUrl: module.launchUrl,
    redirectUrl: module.launchUrl,
    module: {
      id: module.id,
      slug: module.slug,
      name: module.name,
      hostname: module.hostname,
      entitlementKey: module.entitlementKey,
    },
  };
}

export function canonicalModuleLaunchUrl(moduleId: string): string {
  const module = getModuleById(moduleId);
  if (!module || module.status !== 'active') {
    throw new ModuleLaunchError('Module is not available for launch.', 404, 'MODULE_UNAVAILABLE');
  }
  return module.launchUrl;
}
