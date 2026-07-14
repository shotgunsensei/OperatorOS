import React, { createContext, useContext, useState, useEffect } from "react";
import { useListTenants } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";

interface TenantContextType {
  tenantId: number | null;
  setTenantId: (id: number) => void;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  setTenantId: () => {},
  isLoading: true,
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { data: tenants, isLoading } = useListTenants({
    query: {
      enabled: isAuthenticated,
      queryKey: ["tenants"],
    },
  });
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (tenants && tenants.length > 0 && !tenantId) {
      setTenantId(tenants[0].id);
    } else if (tenants && tenants.length === 0 && !isLoading && isAuthenticated) {
      setLocation("/onboarding");
    }
  }, [tenants, tenantId, isLoading, isAuthenticated, setLocation]);

  return (
    <TenantContext.Provider value={{ tenantId, setTenantId, isLoading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
