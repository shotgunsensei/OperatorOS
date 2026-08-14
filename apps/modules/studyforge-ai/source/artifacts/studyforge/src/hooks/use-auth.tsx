import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { SessionUser } from "@workspace/api-client-react";

interface AuthContextType {
  user: SessionUser | null;
  isLoading: boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useGetMe();
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  return (
    <AuthContext.Provider value={{ user: data?.user || null, isLoading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}