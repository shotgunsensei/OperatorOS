import type { Metadata } from 'next';

export const SITE_ORIGIN = 'https://operatoros.net';
export const SITE_NAME = 'OperatorOS';
export const DEFAULT_TITLE = 'OperatorOS — Choose the tools for your business';
export const DEFAULT_DESCRIPTION =
  'Choose your business lane: TradeFlowKit for trade companies, TechDeck for MSPs, or PulseDesk for healthcare and legal-office operations. One OperatorOS account.';
export const SOCIAL_IMAGE_PATH = '/opengraph-image';
export const SOCIAL_IMAGE_ALT =
  'Choose your OperatorOS lane: Trade Companies, MSPs, or Healthcare / Legal-office operations.';

interface PublicPageMetadata {
  title: string;
  description: string;
  path: `/${string}` | '/';
  imagePath?: `/${string}`;
  imageAlt?: string;
}

export function absoluteUrl(path: `/${string}` | '/'): string {
  return path === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`;
}

export function buildPublicMetadata({
  title,
  description,
  path,
  imagePath = SOCIAL_IMAGE_PATH,
  imageAlt = SOCIAL_IMAGE_ALT,
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
          url: imagePath,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imagePath],
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
