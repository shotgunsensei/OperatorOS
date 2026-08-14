import ModuleHost from '../ModuleHost';
import ModuleState from '../ModuleState';
import { redirect } from 'next/navigation';
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
    if (target.redirectPath) redirect(target.redirectPath);
    return (
      <ModuleHost
        slug={params.slug}
        initialSectionId={target.sectionId}
        initialRoutePath={formatModuleDeepPath(params.path)}
      />
    );
  }

  const requestedPath = formatModuleDeepPath(params.path);
  return (
    <ModuleState
      testId="module-deep-link-not-found"
      eyebrow={`${module.name} / 404`}
      title="That module route is not available."
      body={`That ${module.name} page is not available. Return to the module home and choose an available section.`}
      actionHref="/"
      actionLabel={`Open ${module.name}`}
    />
  );
}
