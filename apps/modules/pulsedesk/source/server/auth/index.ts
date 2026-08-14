import { LocalAuthProvider } from "./local-provider";
import { EntraAuthProvider } from "./entra-provider";
import type { AuthProvider } from "./providers";

const localProvider = new LocalAuthProvider();
const entraProvider = new EntraAuthProvider();

export function getAuthProvider(authMode: string): AuthProvider {
  switch (authMode) {
    case "m365":
      return entraProvider;
    case "hybrid":
      return entraProvider;
    case "local":
    default:
      return localProvider;
  }
}

export { localProvider, entraProvider };
export { encryptSecret, decryptSecret } from "./crypto";
export { graphService } from "./graph-service";
export type { AuthProvider, AuthProviderConfig, AuthInitiateResult, AuthCallbackResult, LocalCredentialResult } from "./providers";
export type { IGraphService, GraphUserProfile, GraphGroup } from "./graph-service";
