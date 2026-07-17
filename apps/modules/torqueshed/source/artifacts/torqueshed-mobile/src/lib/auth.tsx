import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";
import { apiUrl, operatorOsAppUrl, operatorOsAuthUrl } from "./theme";

const sessionKey = "torqueshed.session.v1";

export type NativeUser = {
  id: string;
  displayName: string;
  email: string;
  platformRole: string;
  tenant: { id: string; slug: string | null; name: string; role: string | null };
};

type AuthContextValue = {
  ready: boolean;
  session: string | null;
  user: NativeUser | null;
  launchOperatorOs: () => Promise<void>;
  acceptSsoToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<NativeUser | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(sessionKey)
      .then(async (stored) => {
        if (!stored) return;
        const response = await fetch(`${apiUrl}/api/auth/me`, { headers: { authorization: `Bearer ${stored}` } });
        if (!response.ok) {
          await SecureStore.deleteItemAsync(sessionKey);
          return;
        }
        const payload = (await response.json()) as { user: NativeUser };
        setSession(stored);
        setUser(payload.user);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  async function launchOperatorOs() {
    const next = `${operatorOsAppUrl}/app`;
    await WebBrowser.openBrowserAsync(`${operatorOsAuthUrl}/login?next=${encodeURIComponent(next)}`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      controlsColor: "#F26218",
    });
  }

  const acceptSsoToken = useCallback(async (token: string) => {
    const response = await fetch(`${apiUrl}/api/auth/operatoros`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error("OperatorOS launch could not be verified");
    const payload = (await response.json()) as { token: string; user: NativeUser };
    await SecureStore.setItemAsync(sessionKey, payload.token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    setSession(payload.token);
    setUser(payload.user);
  }, []);

  async function signOut() {
    if (session) {
      await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${session}` } }).catch(() => undefined);
    }
    await SecureStore.deleteItemAsync(sessionKey);
    setSession(null);
    setUser(null);
  }

  const value = { ready, session, user, launchOperatorOs, acceptSsoToken, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
