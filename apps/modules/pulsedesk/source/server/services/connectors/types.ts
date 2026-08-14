import type { MailConnector } from "@shared/schema";
import type { ParsedEmail } from "../emailProcessor";

export type ConnectorProvider = "google" | "microsoft" | "imap" | "forwarding";

export interface FetchedEmail {
  uid: number | string;
  email: ParsedEmail;
}

export interface ConnectorCredentials {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  imapUser?: string;
  imapPassword?: string;
}

export interface OAuthAppCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthStartResult {
  redirectUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  error?: string;
  emailAddress?: string;
  credentials?: ConnectorCredentials;
}

export interface ConnectorHealthStatus {
  healthy: boolean;
  status: string;
  lastPollAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  emailsProcessed: number;
}

export interface ConnectorService {
  readonly provider: ConnectorProvider;

  startOAuth?(
    connector: MailConnector,
    redirectUri: string,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<OAuthStartResult>;

  handleOAuthCallback?(
    connector: MailConnector,
    code: string,
    redirectUri: string,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<OAuthCallbackResult>;

  testConnection(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<{
    success: boolean;
    error?: string;
    mailboxInfo?: { exists: number; unseen: number };
  }>;

  fetchEmails(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    inboundAlias: string,
    maxMessages?: number,
  ): Promise<FetchedEmail[]>;

  markProcessed(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    uids: (number | string)[],
  ): Promise<void>;

  refreshCredentials?(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    appCreds?: OAuthAppCredentials | null,
  ): Promise<ConnectorCredentials | null>;

  disconnect?(
    connector: MailConnector,
    credentials: ConnectorCredentials,
  ): Promise<{ success: boolean; error?: string }>;

  getHealth(connector: MailConnector): ConnectorHealthStatus;
}
