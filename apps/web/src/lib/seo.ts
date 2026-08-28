import type { Metadata } from 'next';

export const SITE_ORIGIN = 'https://operatoros.net';
export const SITE_NAME = 'OperatorOS';
export const DEFAULT_TITLE = 'OperatorOS — The Command Layer for Modern Operations';
export const DEFAULT_DESCRIPTION =
  'The modular command layer for modern business operations. One console, every tool your team launches. Powered by Shotgun Ninjas.';
export const SOCIAL_IMAGE_PATH = '/opengraph-image';
export const SOCIAL_IMAGE_ALT =
  'OperatorOS — one command layer for modern business operations';

interface PublicPageMetadata {
  title: string;
  description: string;
  path: `/${string}` | '/';
}

export function absoluteUrl(path: `/${string}` | '/'): string {
  return path === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`;
}

export function buildPublicMetadata({
  title,
  description,
  path,
}: PublicPageMetadata): Metadata {
  const canonical = absoluteUrl(path);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: SOCIAL_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SOCIAL_IMAGE_PATH],
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const globalJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: 'Shotgun Ninjas Productions',
      alternateName: SITE_NAME,
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/brand/operatoros-logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: SITE_ORIGIN,
      name: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      publisher: {
        '@id': `${SITE_ORIGIN}/#organization`,
      },
      inLanguage: 'en-US',
    },
  ],
} as const;

export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${SITE_ORIGIN}/#software-application`,
  name: SITE_NAME,
  url: SITE_ORIGIN,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: DEFAULT_DESCRIPTION,
  provider: {
    '@id': `${SITE_ORIGIN}/#organization`,
  },
} as const;
