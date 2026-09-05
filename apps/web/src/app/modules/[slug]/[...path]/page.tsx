import ModuleHost from '../ModuleHost';
import ModuleState from '../ModuleState';
import { redirect } from 'next/navigation';
import { getModuleBySlug } from '../../../../../../../packages/modules/registry.js';
import {
  formatModuleDeepPath,
  resolveCoreModuleDeepLink,
} from './route-map';

interface ModuleDeepLinkPageProps {
  params: Promise<{
    slug: string;
    path: string[];
  }>;
}

/**
 * Host-routed module deep links land here after middleware rewrites while the
 * browser keeps the canonical module subdomain URL. Only routes backed by a
 * live native workflow are dispatched into a shell section; all other paths
 * get an explicit module-local recovery state.
 */
export default async function ModuleDeepLinkPage({ params }: ModuleDeepLinkPageProps) {
  const { slug, path } = await params;
  const module = getModuleBySlug(slug);

  // Preserve the root boundary's canonical unknown/inactive module states.
  if (!module || module.status !== 'active') {
    return <ModuleHost slug={slug} />;
  }

  const target = resolveCoreModuleDeepLink(slug, path);
  if (target) {
    if (target.redirectPath) redirect(target.redirectPath);
    return (
      <ModuleHost
        slug={slug}
        initialSectionId={target.sectionId}
        initialRoutePath={formatModuleDeepPath(path)}
      />
    );
  }

  const requestedPath = formatModuleDeepPath(path);
  return (
    <ModuleState
      testId="module-deep-link-not-found"
      eyebrow={`${module.name} page unavailable`}
      title="That page is not available."
      body={`Open ${module.name} to choose an available section.`}
      actionHref="/"
      actionLabel={`Open ${module.name}`}
    />
  );
}
