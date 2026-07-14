import { useEffect } from 'react';
import type { AppView } from '@/types';
import type { CaseCatalogEntry } from '@/data/caseCatalog/types';

export const CANONICAL_ORIGIN = 'https://faultlinelab.com';

export interface CaseSeo {
  path: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageWidth: number;
  ogImageHeight: number;
  ogType: 'article';
}

export const CASE_OG_IMAGE_WIDTH = 1200;
export const CASE_OG_IMAGE_HEIGHT = 630;

export function buildCaseSeo(entry: CaseCatalogEntry): CaseSeo {
  const title = `${entry.title} — Faultline Lab`;
  return {
    path: `/case/${entry.slug}/`,
    title,
    description: entry.shortSummary,
    ogTitle: title,
    ogDescription: entry.shortSummary,
    ogImage: `/og/case-${entry.slug}.png`,
    ogImageWidth: CASE_OG_IMAGE_WIDTH,
    ogImageHeight: CASE_OG_IMAGE_HEIGHT,
    ogType: 'article',
  };
}

export interface RouteSeo {
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
}

const DEFAULT_OG_IMAGE = '/og-image.jpg';
const SITE_NAME = 'Shotgun Ninjas Productions';

const DEFAULT_DESCRIPTION =
  'Faultline Lab — diagnostic challenge platform for technical minds. Investigate, deduce, and resolve realistic IT, networking, and automotive incidents.';

export const ROUTE_SEO: Record<AppView, RouteSeo> = {
  boot: {
    path: '/',
    title: 'Faultline Lab — Diagnostic Challenge Platform',
    description: DEFAULT_DESCRIPTION,
  },
  'incident-board': {
    path: '/',
    title: 'Incident Board — Faultline Lab',
    description:
      'Browse open diagnostic incidents and pick your next investigation. Realistic IT, networking, and automotive faults await.',
  },
  investigation: {
    path: '/investigation',
    title: 'Investigation Workspace — Faultline Lab',
    description:
      'Run terminal commands, inspect evidence, and submit a diagnosis inside the Faultline Lab investigation workspace.',
  },
  debrief: {
    path: '/debrief',
    title: 'Case Debrief — Faultline Lab',
    description:
      'Review your diagnostic accuracy, time-to-resolution, and learning notes from your latest Faultline Lab case.',
  },
  profile: {
    path: '/profile',
    title: 'Investigator Profile — Faultline Lab',
    description:
      'Track your rank, completed cases, and diagnostic stats across the Faultline Lab operator ecosystem.',
  },
  settings: {
    path: '/settings',
    title: 'Settings — Faultline Lab',
    description:
      'Manage your Faultline Lab account, preferences, and diagnostic experience settings.',
  },
  store: {
    path: '/store',
    title: 'Case Store — Faultline Lab',
    description:
      'Unlock new case packs and expansion content for Faultline Lab. Sharpen your diagnostic skill across new domains.',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing & Plans — Faultline Lab',
    description:
      'Compare Faultline Lab plans. Pick monthly or yearly access to the full diagnostic challenge catalog.',
  },
  admin: {
    path: '/admin',
    title: 'Admin Panel — Faultline Lab',
    description: 'Faultline Lab administrative console.',
  },
  auth: {
    path: '/sign-in',
    title: 'Sign In — Faultline Lab',
    description:
      'Sign in to Faultline Lab to sync your progress and unlock the full diagnostic challenge catalog.',
  },
  account: {
    path: '/account',
    title: 'Account & Billing — Faultline Lab',
    description:
      'Manage your Faultline Lab subscription, billing, and account preferences.',
  },
  daily: {
    path: '/daily',
    title: 'Daily Challenge — Faultline Lab',
    description:
      "Take on today's Faultline Lab daily diagnostic challenge and compare your run against the global operator pool.",
  },
  sandbox: {
    path: '/sandbox',
    title: 'Sandbox — Faultline Lab',
    description:
      'Free-form diagnostic sandbox. Experiment with Faultline Lab tooling outside of scored cases.',
  },
  'access-denied': {
    path: '/access-denied',
    title: 'Access Denied — Faultline Lab',
    description:
      'Faultline Lab access is managed by OperatorOS. Update your plan or role in OperatorOS to continue.',
  },
};

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-managed="seo"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('data-managed', 'seo');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applyRouteSeo(view: AppView): void {
  const seo = ROUTE_SEO[view] ?? ROUTE_SEO.boot;
  const url = `${CANONICAL_ORIGIN}${seo.path}`;
  const ogTitle = seo.ogTitle ?? seo.title;
  const ogDescription = seo.ogDescription ?? seo.description;

  document.title = seo.title;
  setMeta('meta[name="description"]', 'name', 'description', seo.description);
  setMeta('meta[property="og:title"]', 'property', 'og:title', ogTitle);
  setMeta('meta[property="og:description"]', 'property', 'og:description', ogDescription);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
  setMeta('meta[property="og:image"]', 'property', 'og:image', `${CANONICAL_ORIGIN}${DEFAULT_OG_IMAGE}`);
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', ogTitle);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', ogDescription);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', `${CANONICAL_ORIGIN}${DEFAULT_OG_IMAGE}`);
  setLink('canonical', url);
}

export function useRouteSeo(view: AppView): void {
  useEffect(() => {
    applyRouteSeo(view);
  }, [view]);
}
