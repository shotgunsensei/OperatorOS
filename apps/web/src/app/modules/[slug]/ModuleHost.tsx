import InternalAppPage from '../../apps/[slug]/page';
import { ModuleDeepLinkTargetProvider } from '../../apps/[slug]/ModuleDeepLinkTarget';
import { getModuleBySlug } from '../../../../../../packages/modules/registry.js';
import ModuleState from './ModuleState';

interface ModuleHostProps {
  slug: string;
  initialSectionId?: string;
  initialRoutePath?: string;
  requestedHost?: string;
}

/** Shared registry/status/entitlement boundary used by root and deep routes. */
export default function ModuleHost({
  slug,
  initialSectionId,
  initialRoutePath,
  requestedHost,
}: ModuleHostProps) {
  const module = getModuleBySlug(slug);

  if (!module) {
    return (
      <ModuleState
        testId="module-host-unknown"
        eyebrow="Unknown module host"
        title="This OperatorOS module route is not registered."
        body={
          requestedHost
            ? `${requestedHost} is not mapped to an active OperatorOS module.`
            : 'The requested module slug is not mapped to the OperatorOS registry.'
        }
      />
    );
  }

  if (module.status !== 'active') {
    return (
      <ModuleState
        testId="module-host-unavailable"
        eyebrow="Module unavailable"
        title={`${module.name} is not available right now.`}
        body={`OperatorOS knows this module, but its registry status is ${module.status}.`}
      />
    );
  }

  return (
    <ModuleDeepLinkTargetProvider initialSectionId={initialSectionId} initialRoutePath={initialRoutePath}>
      <InternalAppPage />
    </ModuleDeepLinkTargetProvider>
  );
}
