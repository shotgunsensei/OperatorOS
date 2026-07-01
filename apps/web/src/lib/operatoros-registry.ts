import {
  OPERATOROS_MODULE_REGISTRY,
  type OperatorOSModuleRegistryEntry,
} from '../../../../packages/modules/registry.js';

export type { OperatorOSModuleRegistryEntry };

export const COMMAND_CENTER_MODULES: readonly OperatorOSModuleRegistryEntry[] =
  OPERATOROS_MODULE_REGISTRY
    .filter((module) => module.id !== 'operatoros' && module.status !== 'hidden')
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return a.name.localeCompare(b.name);
    });

export const COMMAND_CENTER_MODULES_BY_SLUG: ReadonlyMap<string, OperatorOSModuleRegistryEntry> =
  new Map(COMMAND_CENTER_MODULES.map((module) => [module.slug, module]));

export function getCommandCenterModule(slug: string): OperatorOSModuleRegistryEntry | undefined {
  return COMMAND_CENTER_MODULES_BY_SLUG.get(slug);
}
