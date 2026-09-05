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
        eyebrow="Application unavailable"
        title="We could not find this OperatorOS application."
        body={
          requestedHost
            ? 'This application address is not available. Return to My Apps or open Help.'
            : 'Return to My Apps or open Help to choose an available application.'
        }
      />
    );
  }

  if (module.status !== 'active') {
    return (
      <ModuleState
        testId="module-host-unavailable"
        eyebrow="Application unavailable"
        title={`${module.name} is not available right now.`}
        body="Choose another application or contact support if you believe you should have access."
      />
    );
  }

  return (
    <ModuleDeepLinkTargetProvider initialSectionId={initialSectionId} initialRoutePath={initialRoutePath}>
      <InternalAppPage />
    </ModuleDeepLinkTargetProvider>
  );
}
