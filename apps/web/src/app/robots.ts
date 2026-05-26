import type { MetadataRoute } from 'next';

/**
 * SEO fix: Lighthouse flagged "Page is blocked from indexing" because
 * the app shipped no robots.txt (request returned 404), which on some
 * deployment hosts (Replit's default `.replit.app` preview included)
 * is served as an implicit Disallow by the platform's parent robots
 * policy. We now serve an explicit allow-all robots.txt at /robots.txt
 * so search engines (and Lighthouse's audit) see a positive signal.
 *
 * The `/admin`, `/platform`, `/apps/*` and `/invites/*` routes are all
 * gated behind authentication and serve no public content, so we
 * disallow crawlers from them — they would only ever surface a login
 * wall in the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // `/portfolio` and `/john` (Task #113) are hidden share-by-link
        // pages — kept out of search even though they reuse the public
        // marketing chrome.
        disallow: ['/admin', '/platform', '/apps/', '/invites/', '/app', '/portfolio', '/john'],
      },
    ],
  };
}
