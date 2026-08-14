export interface ModuleNavItem {
  title: string;
  url: string;
  icon: string;
  roles?: string[];
}

export interface VaultModuleManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  category: "core" | "feature";
  requiredPlan?: string;
  operatorOsFeatureKey?: string;

  server?: {
    mountPath: string;
    routesFile: string;
    emits?: string[];
    consumes?: string[];
  };

  client?: {
    navItems?: ModuleNavItem[];
    adminNavItems?: ModuleNavItem[];
  };

  roles?: string[];
}

export type ModuleDefinition = VaultModuleManifest;

export interface ModuleRegistry {
  modules: VaultModuleManifest[];
  getModule(id: string): VaultModuleManifest | undefined;
  getEnabledModules(): VaultModuleManifest[];
  isEnabled(id: string): boolean;
}
