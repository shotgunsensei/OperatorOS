import type { HelpPageGuide } from './types';

type PageOptions = {
  access?: string;
  notes?: readonly string[];
  workflow?: readonly string[];
  openPath?: string;
};

export function guidePage(
  baseUrl: string,
  id: string,
  title: string,
  path: string,
  summary: string,
  features: readonly string[],
  options: PageOptions = {},
): HelpPageGuide {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const openPath = options.openPath ?? normalizedPath;
  const href = new URL(openPath.startsWith('/') ? openPath : `/${openPath}`, `${baseUrl.replace(/\/+$/u, '')}/`).toString();
  return {
    id,
    title,
    path: normalizedPath,
    href,
    summary,
    features,
    workflow: options.workflow ?? [
      `Open ${title} and confirm that the organization and access badge are correct.`,
      'Use the page filters or record list to narrow the work before changing anything.',
      'Complete the needed action, then confirm the saved state, activity entry, or provider result shown by the page.',
    ],
    access: options.access,
    notes: options.notes,
  };
}

export function consolePage(
  id: string,
  title: string,
  href: string,
  summary: string,
  features: readonly string[],
  options: PageOptions = {},
): HelpPageGuide {
  const url = new URL(href, 'https://app.operatoros.net/');
  return {
    id,
    title,
    path: `${url.pathname}${url.search}`,
    href: url.toString(),
    summary,
    features,
    workflow: options.workflow ?? [
      `Open ${title} and verify the current account and organization context.`,
      'Review the visible status, instructions, and access boundaries before selecting an action.',
      'Complete the action and confirm the success, error, or no-change message before leaving the page.',
    ],
    access: options.access,
    notes: options.notes,
  };
}
