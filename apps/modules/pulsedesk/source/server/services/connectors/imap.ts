import type { MailConnector } from "@shared/schema";
import type {
  ConnectorService,
  ConnectorCredentials,
  ConnectorHealthStatus,
  FetchedEmail,
} from "./types";
import { fetchUnseenEmails, markMessagesSeen, testImapConnection, type ImapConfig } from "../imapClient";

function buildImapConfig(connector: MailConnector, creds: ConnectorCredentials): ImapConfig {
  return {
    host: connector.imapHost || "",
    port: connector.imapPort || 993,
    user: creds.imapUser || connector.emailAddress || "",
    password: creds.imapPassword || "",
    tls: connector.imapTls,
    folder: connector.imapFolder || "INBOX",
  };
}

export class ImapConnectorService implements ConnectorService {
  readonly provider = "imap" as const;

  async testConnection(connector: MailConnector, credentials: ConnectorCredentials) {
    const config = buildImapConfig(connector, credentials);
    return testImapConnection(config);
  }

  async fetchEmails(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    inboundAlias: string,
    maxMessages = 20,
  ): Promise<FetchedEmail[]> {
    const config = buildImapConfig(connector, credentials);
    const results = await fetchUnseenEmails(config, inboundAlias, maxMessages);
    return results.map(r => ({ uid: r.uid, email: { ...r.email, provider: "imap" } }));
  }

  async markProcessed(
    connector: MailConnector,
    credentials: ConnectorCredentials,
    uids: (number | string)[],
  ): Promise<void> {
    const config = buildImapConfig(connector, credentials);
    await markMessagesSeen(config, uids.map(u => Number(u)));
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
}
