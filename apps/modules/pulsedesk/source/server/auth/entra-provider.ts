import type { Request } from "express";
import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthProvider, AuthProviderConfig, AuthInitiateResult, AuthCallbackResult } from "./providers";

const ENTRA_AUTHORITY_BASE = "https://login.microsoftonline.com";
const OPENID_SCOPE = "openid profile email";

function buildAuthorizeUrl(tenantId: string): string {
  return `${ENTRA_AUTHORITY_BASE}/${tenantId}/oauth2/v2.0/authorize`;
}

function buildTokenUrl(tenantId: string): string {
  return `${ENTRA_AUTHORITY_BASE}/${tenantId}/oauth2/v2.0/token`;
}

function buildJwksUri(tenantId: string): string {
  return `${ENTRA_AUTHORITY_BASE}/${tenantId}/discovery/v2.0/keys`;
}

function buildIssuer(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(tenantId: string) {
  if (!jwksCache.has(tenantId)) {
    const jwksUrl = new URL(buildJwksUri(tenantId));
    jwksCache.set(tenantId, createRemoteJWKSet(jwksUrl));
  }
  return jwksCache.get(tenantId)!;
}

export class EntraAuthProvider implements AuthProvider {
  readonly type = "m365";

  async initiateLogin(_req: Request, config: AuthProviderConfig): Promise<AuthInitiateResult> {
    if (!config.entraTenantId || !config.entraClientId || !config.entraRedirectUri) {
      throw new Error("Entra ID configuration incomplete");
    }

    const state = crypto.randomBytes(32).toString("hex");
    const nonce = crypto.randomBytes(32).toString("hex");

    const params = new URLSearchParams({
      client_id: config.entraClientId,
      response_type: "code",
      redirect_uri: config.entraRedirectUri,
      scope: `${OPENID_SCOPE} User.Read`,
      response_mode: "query",
      state,
      nonce,
      prompt: "select_account",
    });

    if (config.entraAllowedDomains && config.entraAllowedDomains.length > 0) {
      params.set("domain_hint", config.entraAllowedDomains[0]);
    }

    const redirectUrl = `${buildAuthorizeUrl(config.entraTenantId)}?${params.toString()}`;

    return { redirectUrl, state, nonce };
  }

  async handleCallback(req: Request, config: AuthProviderConfig): Promise<AuthCallbackResult> {
    const { code, error, error_description } = req.query as Record<string, string>;

    if (error) {
      return {
        success: false,
        error: error_description || error || "Authentication failed",
      };
    }

    if (!code) {
      return { success: false, error: "No authorization code received" };
    }

    if (!config.entraTenantId || !config.entraClientId || !config.entraClientSecret || !config.entraRedirectUri) {
      return { success: false, error: "Entra ID configuration incomplete" };
    }

    try {
      const tokenResponse = await fetch(buildTokenUrl(config.entraTenantId), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.entraClientId,
          client_secret: config.entraClientSecret,
          code,
          redirect_uri: config.entraRedirectUri,
          grant_type: "authorization_code",
          scope: `${OPENID_SCOPE} User.Read`,
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("Token exchange failed:", errBody);
        return { success: false, error: "Failed to exchange authorization code" };
      }

      const tokenData = await tokenResponse.json();
      const idToken = tokenData.id_token;
      const accessToken = tokenData.access_token;

      if (!idToken) {
        return { success: false, error: "No ID token received" };
      }

      const jwks = getJWKS(config.entraTenantId);
      const expectedIssuer = buildIssuer(config.entraTenantId);

      const savedNonce = req.session.entraNonce;
      if (!savedNonce) {
        return { success: false, error: "Missing nonce in session — possible session expiry or replay" };
      }

      let claims: any;
      try {
        const { payload } = await jwtVerify(idToken, jwks, {
          issuer: expectedIssuer,
          audience: config.entraClientId,
          clockTolerance: 120,
        });
        claims = payload;
      } catch (verifyErr: any) {
        console.error("ID token verification failed:", verifyErr.message);
        return { success: false, error: "ID token verification failed: " + verifyErr.message };
      }

      if (claims.nonce !== savedNonce) {
        return { success: false, error: "ID token nonce mismatch" };
      }

      if (claims.tid && claims.tid !== config.entraTenantId) {
        return { success: false, error: "Token tenant mismatch" };
      }

      const email = claims.email || claims.preferred_username || claims.upn || "";
      const displayName = claims.name || "";
      const upn = claims.preferred_username || claims.upn || "";
      const entraObjectId = claims.oid || claims.sub || "";

      if (config.entraAllowedDomains && config.entraAllowedDomains.length > 0 && email) {
        const emailDomain = email.split("@")[1]?.toLowerCase();
        if (emailDomain && !config.entraAllowedDomains.some((d: string) => d.toLowerCase() === emailDomain)) {
          return { success: false, error: `Email domain ${emailDomain} is not allowed for this organization` };
        }
      }

      let groups: string[] = [];
      if (claims.groups && Array.isArray(claims.groups)) {
        groups = claims.groups;
      }

      if (groups.length === 0 && accessToken) {
        try {
          const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me/memberOf", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (graphResponse.ok) {
            const graphData = await graphResponse.json();
            groups = (graphData.value || [])
              .filter((m: any) => m["@odata.type"] === "#microsoft.graph.group")
              .map((g: any) => g.id);
          }
        } catch {
        }
      }

      return {
        success: true,
        email,
        displayName,
        upn,
        entraObjectId,
        entraTenantId: claims.tid || config.entraTenantId,
        groups,
        department: claims.department || undefined,
        jobTitle: claims.jobTitle || undefined,
      };
    } catch (err: any) {
      console.error("Entra callback error:", err);
      return { success: false, error: "Authentication processing failed" };
    }
  }
}
