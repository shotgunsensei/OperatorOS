import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

const PUBLIC_ROUTES = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/modules', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/ecosystem', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/help', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/messaging', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/sms-consent', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/msg_privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/msg_terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
  }));
}
