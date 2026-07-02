import type { Request } from "express";
import type { AuthProvider, AuthProviderConfig, AuthInitiateResult, AuthCallbackResult, LocalCredentialResult } from "./providers";
import { hashPassword, verifyPassword } from "../middleware";

export class LocalAuthProvider implements AuthProvider {
  readonly type = "local";

  async initiateLogin(_req: Request, _config: AuthProviderConfig): Promise<AuthInitiateResult> {
    throw new Error("Local auth does not use redirect-based login");
  }

  async handleCallback(_req: Request, _config: AuthProviderConfig): Promise<AuthCallbackResult> {
    throw new Error("Local auth does not use callback-based login");
  }

  async validateCredentials(_username: string, password: string, storedHash: string): Promise<LocalCredentialResult> {
    const valid = await verifyPassword(password, storedHash);
    if (!valid) {
      return { success: false, error: "Invalid credentials" };
    }

    const needsRehash = /^[0-9a-f]{64}$/.test(storedHash);

    return { success: true, needsRehash };
  }

  async rehashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }
}
