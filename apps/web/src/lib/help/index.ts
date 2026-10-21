import { COMPANION_MODULE_GUIDES } from './companion-module-guides';
import { OPERATOROS_GUIDE, PLATFORM_COMMAND_GUIDE } from './operatoros-guides';
import { PRIMARY_MODULE_GUIDES } from './primary-module-guides';
import { guidePage } from './page';
import type { HelpGuide, HelpPageGuide } from './types';
import { MODULE_GLOSSARY } from './module-glossary';
import { MODULE_SETUP_GUIDES } from './module-setup';

export type { HelpGuide, HelpGuideKind, HelpPageGuide } from './types';

export const HELP_CONTENT_VERSION = '2026.09.21-v3';

const FIELDNODE_GUIDE: HelpGuide = {
  id: 'fieldnode', name: 'FieldNode', kind: 'companion-application', accent: '#22d3ee',
  description: 'Explore FieldNode hardware, open the free application entry, and understand the requirements for future device management.',
  availability: 'Public introduction. Remote device management and online hardware ordering are not available in this release.',
  startHref: 'https://fieldnode.operatoros.net/',
  pages: [
    guidePage('https://fieldnode.operatoros.net', 'fieldnode-introduction', 'FieldNode introduction', '/',
      'Learn about the appliance and its free application, then choose hardware information or the existing-owner entry.', [
        'Read the FieldNode hardware introduction without signing in.',
        'Use Get a FieldNode to review hardware ordering information; no checkout or hardware price is published yet.',
        'Use Manage my FieldNodes for the protected owner entry and its current availability notice.',
      ], {
        access: 'The introduction is public. The application is included with free and paid OperatorOS accounts; it requires no application license purchase or subscription.',
        workflow: [
          'Open the FieldNode introduction and review the hardware and application information.',
          'Review the hardware purchasing section if you are considering an appliance; ordering remains unavailable.',
          'Choose Manage my FieldNodes if you already own an appliance, or continue reading without an account.',
        ],
      }),
    guidePage('https://fieldnode.operatoros.net', 'fieldnode-management', 'Manage my FieldNodes', '/manage',
      'Read the management availability notice; remote device pairing and management are not connected in this release.', [
        'Sign in with OperatorOS and use the organization that should own the device.',
        'Review the unavailable management notice instead of expecting a device list or pairing controls.',
        'Continue using the appliance local console separately while remote management is unavailable.',
      ], {
        access: 'OperatorOS sign-in and application access for the active organization are required. Future device access also requires verified ownership and pairing; a paid plan or software license does not prove hardware ownership.',
        workflow: [
          'Select Manage my FieldNodes from the introduction.',
          'Sign in to your OperatorOS account and confirm the intended organization.',
          'Read the current availability notice and continue using the appliance local console separately.',
        ],
        notes: ['There is no supported remote device enrollment, inventory, or command workflow in this release.'],
      }),
  ],
};

export const HELP_GUIDES: readonly HelpGuide[] = [
  OPERATOROS_GUIDE,
  PLATFORM_COMMAND_GUIDE,
  ...PRIMARY_MODULE_GUIDES,
  ...COMPANION_MODULE_GUIDES,
  FIELDNODE_GUIDE,
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
  'fieldnode',
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
    ...Object.values(MODULE_SETUP_GUIDES[guide.id] ?? {}),
  ].join(' ').toLocaleLowerCase();
}
