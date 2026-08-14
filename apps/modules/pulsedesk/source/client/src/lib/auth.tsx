import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { User, Org, Membership } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface OrgCounts {
  tickets: number;
  departments: number;
  assets: number;
  members: number;
}

interface AuthContextType {
  user: User | null;
  org: Org | null;
  membership: Membership | null;
  orgs: Org[];
  orgCounts: OrgCounts | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (username: string, password: string, orgSlug?: string) => Promise<void>;
  register: (username: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgCounts, setOrgCounts] = useState<OrgCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { toast } = useToast();
  const sessionExpiredRef = useRef(false);

  const clearSession = useCallback(() => {
    setUser(null);
    setOrg(null);
    setMembership(null);
    setOrgs([]);
    setOrgCounts(null);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setOrg(data.org);
        setMembership(data.membership);
        setOrgs(data.orgs || []);
        setOrgCounts(data.orgCounts || null);
        setSessionExpired(false);
        sessionExpiredRef.current = false;
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const handleSessionExpired = () => {
      if (sessionExpiredRef.current) return;
      sessionExpiredRef.current = true;
      setSessionExpired(true);
      clearSession();
      toast({
        title: "Session expired",
        description: "Your session has ended. Please sign in again.",
        variant: "destructive",
      });
    };
    window.addEventListener("pulsedesk:session-expired", handleSessionExpired);
    return () => window.removeEventListener("pulsedesk:session-expired", handleSessionExpired);
  }, [clearSession, toast]);

  const login = async (username: string, password: string, orgSlug?: string) => {
    void username;
    void password;
    void orgSlug;
    throw new Error("PulseDesk sign-in is managed by OperatorOS SSO. Launch PulseDesk from OperatorOS.");
  };

  const register = async (username: string, password: string, fullName: string) => {
    void username;
    void password;
    void fullName;
    throw new Error("PulseDesk registration is managed by OperatorOS. Ask a tenant admin to add the user there.");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    clearSession();
  };

  const switchOrg = async (orgId: string) => {
    const res = await fetch("/api/auth/switch-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
      credentials: "include",
    });
    if (res.ok) {
      await refreshAuth();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, org, membership, orgs, orgCounts, isLoading, sessionExpired, login, register, logout, switchOrg, refreshAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
