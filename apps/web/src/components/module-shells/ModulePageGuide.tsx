'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { BookOpen, ChevronDown } from 'lucide-react';
import { findHelpPage, HELP_GUIDES, normalizeHelpPagePath } from '@/lib/help';
import { MODULE_GLOSSARY } from '@/lib/help/module-glossary';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { buildOperatorOSHelpUrl } from '../../../../../packages/modules/navigation.js';
import styles from './ModulePageGuide.module.css';

/** Read-only guidance. Access and workflow results still come from the server. */
export default function ModulePageGuide({ moduleSlug, routePath }: { moduleSlug: string; routePath?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const accessLevel = useModuleAccessLevel();
  const guide = HELP_GUIDES.find(item => item.id === moduleSlug);
  if (!guide) return null;

  const localPath = (pathname ?? '/').replace(/^\/(?:app\/)?(?:apps|modules)\/[a-z0-9-]+/u, '') || '/';
  const currentPath = normalizeHelpPagePath(routePath ?? `${localPath}${search?.size ? `?${search.toString()}` : ''}`) ?? '/';
  const page = findHelpPage(guide, currentPath)
    ?? (currentPath === '/' ? findHelpPage(guide, new URL(guide.startHref).pathname) : null);
  const helpUrl = buildOperatorOSHelpUrl({ module: moduleSlug, page: page?.path ?? currentPath });

  return (
    <aside className={styles.guide} data-module={moduleSlug} data-testid="module-page-guide" aria-label="Page instructions">
      {accessLevel === 'viewer' && <p className={styles.access}>You have view-only access. You can review records. Ask your organization administrator if you need to make changes.</p>}
      <details className={styles.details} key={`${moduleSlug}:${page?.id ?? currentPath}`}>
        <summary><BookOpen size={18} aria-hidden="true" /><span>Step-by-step help{page ? `: ${page.title}` : ` for ${guide.name}`}</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className={styles.content}>
          <div>
            <p className={styles.description}>{page?.summary ?? guide.description}</p>
            {page ? <ol>{page.workflow.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol> : <p>Open the full guide to choose a task and see its instructions.</p>}
            <a href={helpUrl} className={styles.help}>Open full guide</a>
          </div>
          <div className={styles.tips}>
            <strong>Before you leave this page</strong>
            <p>After making a change, check for a saved result or confirmation. A draft or preview still needs review. If a request times out, check the record before trying it again.</p>
            {page?.access && <p><strong>Who can make changes:</strong> {page.access}</p>}
            {page?.notes?.map(note => <p key={note}>{note}</p>)}
            <p>{guide.availability}</p>
            {MODULE_GLOSSARY[moduleSlug] && <dl className={styles.glossary}>{MODULE_GLOSSARY[moduleSlug].map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>}
          </div>
        </div>
      </details>
    </aside>
  );
}
