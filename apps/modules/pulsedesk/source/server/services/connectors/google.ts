import type { MailConnector } from "@shared/schema";
import type {
  ConnectorService,
  ConnectorCredentials,
  ConnectorHealthStatus,
  FetchedEmail,
  OAuthStartResult,
  OAuthCallbackResult,
} from "./types";
import { fetchUnseenEmails, markMessagesSeen, testImapConnection, type ImapConfig } from "../imapClient";
import crypto from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface OAuthAppCredentials {
  clientId: string;
  clientSecret: string;
}

function getEnvClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID not configured");
  return id;
}

function getEnvClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET not configured");
  return secret;
}

function resolveClientId(appCreds?: OAuthAppCredentials | null): string {
  if (appCreds?.clientId) return appCreds.clientId;
  return getEnvClientId();
}

function resolveClientSecret(appCreds?: OAuthAppCredentials | null): string {
  if (appCreds?.clientSecret) return appCreds.clientSecret;
  return getEnvClientSecret();
}

export function isGoogleConfigured(appCreds?: OAuthAppCredentials | null): boolean {
  if (appCreds?.clientId && appCreds?.clientSecret) return true;
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function buildImapConfig(connector: MailConnector, creds: ConnectorCredentials): ImapConfig {
  return {
    host: "imap.gmail.com",
    port: 993,
    user: creds.imapUser || connector.emailAddress || "",
    password: creds.accessToken || "",
    tls: true,
    folder: connector.imapFolder || "INBOX",
    useOAuth: true,
  };
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface GoogleUserInfo {
  email?: string;
}

export class GoogleConnectorService implements ConnectorService {
  readonly provider = "google" as const;

  async startOAuth(_connector: MailConnector, redirectUri: string, appCreds?: OAuthAppCredentials | null): Promise<OAuthStartResult> {
    const state = crypto.randomBytes(32).toString("hex");
    const params = new URLSearchParams({
      client_id: resolveClientId(appCreds),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return { redirectUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`, state };
  }

  async handleOAuthCallback(
    _connector: MailConnector,
    code: string,
    redirectUri: string,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<OAuthCallbackResult> {
    try {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: resolveClientId(appCreds),
          client_secret: resolveClientSecret(appCreds),
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("[google-connector] Token exchange failed:", errBody);
        return { success: false, error: "Failed to exchange authorization code" };
      }

      const tokenData: GoogleTokenResponse = await tokenRes.json() as GoogleTokenResponse;
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;

      if (!accessToken) {
        return { success: false, error: "No access token received" };
      }

      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let emailAddress = "";
      if (userRes.ok) {
        const userData: GoogleUserInfo = await userRes.json() as GoogleUserInfo;
        emailAddress = userData.email || "";
      }

      return {
        success: true,
        emailAddress,
        credentials: {
          accessToken,
          refreshToken,
          tokenExpiry: Date.now() + expiresIn * 1000,
          imapUser: emailAddress,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[google-connector] OAuth callback error:", message);
      return { success: false, error: "OAuth processing failed" };
    }
  }

  async testConnection(connector: MailConnector, credentials: ConnectorCredentials, appCreds?: OAuthAppCredentials | null) {
    const creds = await this.ensureFreshToken(connector, credentials, appCreds);
    const config = buildImapConfig(connector, creds);
    return testImapConnection(config);
  }

  async fetchEmails(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    inboundAlias: string,
    maxMessages = 20,
  ): Promise<FetchedEmail[]> {
    const creds = await this.ensureFreshToken(connector, credentials);
    const config = buildImapConfig(connector, creds);
    const results = await fetchUnseenEmails(config, inboundAlias, maxMessages);
    return results.map(r => ({ uid: r.uid, email: { ...r.email, provider: "google" } }));
  }

  async markProcessed(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    uids: (number | string)[],
  ): Promise<void> {
    const creds = await this.ensureFreshToken(connector, credentials);
    const config = buildImapConfig(connector, creds);
    await markMessagesSeen(config, uids.map(u => Number(u)));
  }

  async refreshCredentials(
    _connector: MailConnector,
    credentials: ConnectorCredentials,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<ConnectorCredentials | null> {
    if (!credentials.refreshToken) return null;

    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: resolveClientId(appCreds),
          client_secret: resolveClientSecret(appCreds),
          refresh_token: credentials.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!res.ok) return null;

      const data: GoogleTokenResponse = await res.json() as GoogleTokenResponse;
      return {
        ...credentials,
        accessToken: data.access_token,
        tokenExpiry: Date.now() + (data.expires_in || 3600) * 1000,
      };
    } catch {
      return null;
    }
  }

  async disconnect(
    _connector: MailConnector,
    credentials: ConnectorCredentials,
  ): Promise<{ success: boolean; error?: string }> {
    const tokenToRevoke = credentials.accessToken || credentials.refreshToken;
    if (!tokenToRevoke) {
      return { success: true };
    }

    try {
      const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(tokenToRevoke)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("[google-connector] Token revocation failed:", body);
        return { success: false, error: "Token revocation failed" };
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[google-connector] Revocation error:", message);
      return { success: false, error: message };
    }
  }

  getHealth(connector: MailConnector): ConnectorHealthStatus {
    return {
      healthy: connector.status === "active" && connector.enabled && connector.consecutiveFailures === 0,
      status: connector.status,
      lastPollAt: connector.lastPolledAt,
      lastError: connector.lastError,
      consecutiveFailures: connector.consecutiveFailures,
      emailsProcessed: connector.emailsProcessed,
    };
  }

  private async ensureFreshToken(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<ConnectorCredentials> {
    if (credentials.tokenExpiry && credentials.tokenExpiry > Date.now() + 60_000) {
      return credentials;
    }
    const refreshed = await this.refreshCredentials(connector, credentials, appCreds);
    if (!refreshed) throw new Error("Failed to refresh Google access token");
    return refreshed;
  }
}
