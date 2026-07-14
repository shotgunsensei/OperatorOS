'use client';

import React, { createContext, useContext } from 'react';

const ModuleDeepLinkTargetContext = createContext<string | undefined>(undefined);

export function ModuleDeepLinkTargetProvider({
  initialSectionId,
  children,
}: {
  initialSectionId?: string;
  children: React.ReactNode;
}) {
  return (
    <ModuleDeepLinkTargetContext.Provider value={initialSectionId}>
      {children}
    </ModuleDeepLinkTargetContext.Provider>
  );
}

export function useModuleDeepLinkTarget(): string | undefined {
  return useContext(ModuleDeepLinkTargetContext);
}
