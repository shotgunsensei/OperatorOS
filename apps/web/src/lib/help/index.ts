import { COMPANION_MODULE_GUIDES } from './companion-module-guides';
import { OPERATOROS_GUIDE, PLATFORM_COMMAND_GUIDE } from './operatoros-guides';
import { PRIMARY_MODULE_GUIDES } from './primary-module-guides';
import type { HelpGuide, HelpPageGuide } from './types';
import { MODULE_GLOSSARY } from './module-glossary';

export type { HelpGuide, HelpGuideKind, HelpPageGuide } from './types';

export const HELP_CONTENT_VERSION = '2026.09.09-v2';

export const HELP_GUIDES: readonly HelpGuide[] = [
  OPERATOROS_GUIDE,
  PLATFORM_COMMAND_GUIDE,
  ...PRIMARY_MODULE_GUIDES,
  ...COMPANION_MODULE_GUIDES,
];

export const MODULE_HELP_GUIDE_IDS = [
  'tradeflowkit',
  'pulsedesk',
  'techdeck',
  'torqueshed',
  'faultlinelab',
  'ninja-pool-hall',
  'brandforgeos',
  'snapproofos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
  'outcall',
] as const;

export function findHelpGuide(id?: string | null): HelpGuide {
  return HELP_GUIDES.find(guide => guide.id === id) ?? OPERATOROS_GUIDE;
}

export function normalizeHelpPagePath(value?: string | null): string | null {
  if (!value) return null;
  let raw = value.trim();
  try {
    if (/^https?:\/\//iu.test(raw)) {
      const parsed = new URL(raw);
      raw = `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return null;
  }
  raw = raw.replace(/^\/(?:app\/)?(?:apps|modules)\/[a-z0-9-]+/iu, '') || '/';
  if (!raw.startsWith('/')) raw = `/${raw}`;
  return raw.slice(0, 240);
}

export function findHelpPage(guide: HelpGuide, value?: string | null): HelpPageGuide | null {
  const normalized = normalizeHelpPagePath(value);
  if (!normalized) return null;
  const pathOnly = normalized.split(/[?#]/u, 1)[0] || '/';
  // Exact query/tab matches and the longest parent route take precedence over
  // broad sections, so a detail page never receives an unrelated set of steps.
  return guide.pages.find(page => page.path === normalized)
    ?? guide.pages.find(page => page.path === pathOnly)
    ?? [...guide.pages]
      .filter(page => {
        const parent = page.path.split(/[?#]/u, 1)[0];
        return parent !== '/' && pathOnly.startsWith(`${parent}/`);
      })
      .sort((a, b) => b.path.length - a.path.length)[0]
    ?? guide.pages.find(page => page.path.split(/[?#]/u, 1)[0] === pathOnly)
    ?? (guide.kind !== 'platform' && ['/', '/app', '/dashboard', '/overview'].includes(pathOnly)
      ? guide.pages.find(page => page.path === '/')
        ?? guide.pages.find(page => page.path === new URL(guide.startHref).pathname)
      : null)
    ?? null;
}

export function helpSearchText(guide: HelpGuide, page: HelpPageGuide): string {
  return [
    guide.name,
    guide.description,
    guide.availability,
    page.title,
    page.path,
    page.summary,
    ...page.features,
    ...page.workflow,
    page.access ?? '',
    ...(page.notes ?? []),
    ...(MODULE_GLOSSARY[guide.id]?.flat() ?? []),
  ].join(' ').toLocaleLowerCase();
}
