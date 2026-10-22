import type { ToolModuleSlug } from '@operatoros/sdk';
import type { ToolBridgeSigningConfig } from './tool-bridge-assertion.js';
import type { ToolProviderMode, ToolPurchaseSnapshot } from './tool-purchase-store.js';
import type { ToolArtifactDeliveryConfiguration } from './tool-artifact-delivery.js';

export interface ToolCheckoutOffer {
  providerMode: ToolProviderMode;
  providerAccountId: string;
  snapshot: ToolPurchaseSnapshot;
}
export interface ToolCommerceConfiguration {
  artifacts?: ToolArtifactDeliveryConfiguration;
  officeexitDelivery?: { enabled: false } | { enabled: true; signing: ToolBridgeSigningConfig };
  checkout: { enabled: false } | {
    enabled: true; publicOrigin: string; offers: Partial<Record<ToolModuleSlug, ToolCheckoutOffer>>;
  };
  officeexitLink: { enabled: false } | {
    enabled: true; signing: ToolBridgeSigningConfig;
  };
}

// Deliberately closed at the production composition root. Environment values
// alone cannot open charging or establish a new identity trust relationship.
// Approved activation must supply reviewed configuration explicitly here.
export const CLOSED_TOOL_COMMERCE: ToolCommerceConfiguration = Object.freeze({
  checkout: Object.freeze({ enabled: false }), officeexitLink: Object.freeze({ enabled: false }),
  artifacts: null, officeexitDelivery: Object.freeze({ enabled: false }),
});

export function exactToolHttpsOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.origin !== value || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('TOOL_ORIGIN_INVALID');
  }
  return parsed.origin;
}
