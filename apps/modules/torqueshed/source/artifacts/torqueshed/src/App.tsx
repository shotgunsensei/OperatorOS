import { useEffect, useState } from "react";
import { TorqueShedApp, type TorqueShedUser } from "./torqueshed-app";

function App() {
  const [user, setUser] = useState<TorqueShedUser>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    fetch("/api/auth/me", {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { user?: Exclude<TorqueShedUser, null> };
        return payload.user ?? null;
      })
      .then((nextUser) => { if (mounted) setUser(nextUser); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => { if (mounted) setAuthReady(true); });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    setUser(null);
    if (response?.ok) {
      const payload = (await response.json().catch(() => null)) as { returnTo?: string } | null;
      if (payload?.returnTo) window.location.assign(payload.returnTo);
    }
  }

  if (!authReady) {
    return (
      <main className="auth-boot" aria-label="Loading TorqueShed">
        <img src="/torqueshed-logo.png" alt="TorqueShed" />
        <span />
        <p>Opening the garage</p>
      </main>
    );
  }

  return <TorqueShedApp user={user} onSignOut={signOut} />;
}

export default App;
