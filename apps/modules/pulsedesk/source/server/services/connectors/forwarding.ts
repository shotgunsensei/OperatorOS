import type { MailConnector } from "@shared/schema";
import type {
  ConnectorService,
  ConnectorCredentials,
  ConnectorHealthStatus,
  FetchedEmail,
} from "./types";
import { db } from "../../db";
import { emailSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export class ForwardingConnectorService implements ConnectorService {
  readonly provider = "forwarding" as const;

  async testConnection(connector: MailConnector, _credentials: ConnectorCredentials) {
    const [settings] = await db.select().from(emailSettings).where(eq(emailSettings.orgId, connector.orgId));

    if (!settings) {
      return { success: false, error: "No email settings found for organization" };
    }

    if (!settings.inboundAlias) {
      return { success: false, error: "No inbound alias configured" };
    }

    return {
      success: true,
      mailboxInfo: {
        exists: 0,
        unseen: 0,
      },
    };
  }

  async fetchEmails(
    _connector: MailConnector,
    _credentials: ConnectorCredentials,
    _inboundAlias: string,
    _maxMessages?: number,
  ): Promise<FetchedEmail[]> {
    return [];
  }

  async markProcessed(
    _connector: MailConnector,
    _credentials: ConnectorCredentials,
    _uids: (number | string)[],
  ): Promise<void> {
  }

  getHealth(connector: MailConnector): ConnectorHealthStatus {
    return {
      healthy: connector.enabled,
      status: connector.status,
      lastPollAt: null,
      lastError: null,
      consecutiveFailures: 0,
      emailsProcessed: connector.emailsProcessed,
    };
  }
}
