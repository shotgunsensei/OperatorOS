'use client';

import React, { createContext, useContext } from 'react';

export interface ModuleDeepLinkTargetValue {
  sectionId?: string;
  routePath?: string;
}

const ModuleDeepLinkTargetContext = createContext<ModuleDeepLinkTargetValue>({});

export function ModuleDeepLinkTargetProvider({
  initialSectionId,
  initialRoutePath,
  children,
}: {
  initialSectionId?: string;
  initialRoutePath?: string;
  children: React.ReactNode;
}) {
  return (
    <ModuleDeepLinkTargetContext.Provider value={{ sectionId: initialSectionId, routePath: initialRoutePath }}>
      {children}
    </ModuleDeepLinkTargetContext.Provider>
  );
}

export function useModuleDeepLinkTarget(): ModuleDeepLinkTargetValue {
  return useContext(ModuleDeepLinkTargetContext);
}
