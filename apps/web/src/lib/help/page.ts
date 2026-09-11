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
    workflow: options.workflow ?? features,
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
    workflow: options.workflow ?? features,
    access: options.access,
    notes: options.notes,
  };
}
