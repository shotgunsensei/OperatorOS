'use client';

import React, { createContext, useContext } from 'react';

export type ModuleAccessLevel = 'none' | 'viewer' | 'user' | 'manager';

const ModuleAccessContext = createContext<ModuleAccessLevel | null>(null);

export function ModuleAccessProvider({
  accessLevel,
  children,
}: {
  accessLevel: ModuleAccessLevel;
  children: React.ReactNode;
}) {
  return <ModuleAccessContext.Provider value={accessLevel}>{children}</ModuleAccessContext.Provider>;
}

/**
 * Server-resolved, tenant-and-module-specific access. `null` keeps standalone
 * shell tests and legacy hosts on their existing tenant-role fallback.
 */
export function useModuleAccessLevel() {
  return useContext(ModuleAccessContext);
}
