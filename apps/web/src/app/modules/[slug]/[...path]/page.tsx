import ModuleHost from '../ModuleHost';
import ModuleState from '../ModuleState';
import { getModuleBySlug } from '../../../../../../../packages/modules/registry.js';
import {
  formatModuleDeepPath,
  resolveCoreModuleDeepLink,
} from './route-map';

interface ModuleDeepLinkPageProps {
  params: {
    slug: string;
    path: string[];
  };
}

/**
 * Host-routed module deep links land here after middleware rewrites while the
 * browser keeps the canonical module subdomain URL. Only routes backed by a
 * live native workflow are dispatched into a shell section; all other paths
 * get an explicit module-local recovery state.
 */
export default function ModuleDeepLinkPage({ params }: ModuleDeepLinkPageProps) {
  const module = getModuleBySlug(params.slug);

  // Preserve the root boundary's canonical unknown/inactive module states.
  if (!module || module.status !== 'active') {
    return <ModuleHost slug={params.slug} />;
  }

  const target = resolveCoreModuleDeepLink(params.slug, params.path);
  if (target) {
    return (
      <ModuleHost
        slug={params.slug}
        initialSectionId={target.sectionId}
      />
    );
  }

  const requestedPath = formatModuleDeepPath(params.path);
  return (
    <ModuleState
      testId="module-deep-link-not-found"
      eyebrow={`${module.name} / 404`}
      title="That module route is not available."
      body={`${requestedPath} is not a supported ${module.name} path in the consolidated OperatorOS runtime.`}
      actionHref="/"
      actionLabel={`Open ${module.name}`}
    />
  );
}
