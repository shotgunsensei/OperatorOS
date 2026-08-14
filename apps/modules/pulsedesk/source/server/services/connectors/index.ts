import { registerConnectorService } from "./registry";
import { GoogleConnectorService } from "./google";
import { MicrosoftConnectorService } from "./microsoft";
import { ImapConnectorService } from "./imap";
import { ForwardingConnectorService } from "./forwarding";

export function initConnectorServices(): void {
  registerConnectorService(new GoogleConnectorService());
  registerConnectorService(new MicrosoftConnectorService());
  registerConnectorService(new ImapConnectorService());
  registerConnectorService(new ForwardingConnectorService());
  console.log("[connectors] All connector services registered");
}

export { getConnectorService, hasConnectorService } from "./registry";
export type { ConnectorService, ConnectorCredentials, FetchedEmail, ConnectorProvider } from "./types";
