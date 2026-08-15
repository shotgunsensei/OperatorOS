/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.MOBILE_BUILD === '1';
const isDev = process.env.NODE_ENV !== 'production';

// Next.js currently emits inline bootstrap/style content for this mixed
// server/client application. Keep that compatibility explicit while closing
// every other browser content channel. Phase 39 tracks removal of
// `unsafe-inline` as a dated medium-risk follow-up; adopting per-request nonces
// would force the entire application into dynamic rendering and must be done as
// a measured migration rather than an unreviewed production switch.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.operatoros.net wss://*.operatoros.net",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SHARED_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  {
    key: 'Content-Security-Policy',
    value: CONTENT_SECURITY_POLICY,
  },
];

function resolveApiUrl() {
  const internalApiUrl = process.env.INTERNAL_API_URL;
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const configured = internalApiUrl || publicApiUrl;

  if (!configured) {
    const message =
      'Missing API URL configuration: set INTERNAL_API_URL or NEXT_PUBLIC_API_URL for non-dev builds.';
    if (isDev) {
      console.warn(message);
      return 'http://localhost:5001';
    }
    throw new Error(message);
  }

  return configured.replace(/\/$/, '');
}

const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@operatoros/sdk'],
  // The Replit deployer runs `npm install` against this pnpm workspace,
  // producing a flat node_modules with a different `@types/react` /
  // `eslint` graph than the pnpm-locked dev install. That mismatch makes
  // `next build`'s built-in lint+typecheck pass spuriously fail (e.g. a
  // stray `bigint` widening of `ReactNode`, or ESLint 9 removing
  // `useEslintrc`/`extensions`). The authoritative checks already run in
  // dev/CI via the mandatory `pnpm typecheck` step in
  // `pnpm build:production`, so we skip the redundant Next pass here to keep the
  // production build reproducible. The authoritative root `lint` and
  // `typecheck` commands run before this production build in the release gate.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // The transpiled `@operatoros/sdk` package is authored as ESM TypeScript
  // and uses explicit `.js` extensions in its relative imports
  // (e.g. `export * from './catalog.js'`). `tsc` resolves these to the
  // `.ts` sources via `moduleResolution`, but webpack does not unless we
  // teach it to try the TS extensions first. This `extensionAlias` is
  // additive — real `.js` files still resolve because `.js` stays in the
  // candidate list — and is required for the web app to import the shared
  // ecosystem registry helpers from the SDK.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
  ...(isMobileBuild ? {
    output: 'export',
    distDir: 'out',
    images: { unoptimized: true },
  } : {}),
  ...(!isMobileBuild ? {
    async headers() {
      return [
        {
          source: '/:path*',
          headers: SHARED_SECURITY_HEADERS,
        },
      ];
    },
    async rewrites() {
      const apiUrl = resolveApiUrl();
      return {
        // Replit attaches api.operatoros.net to this same public Next.js
        // port. This MUST be a beforeFiles rewrite: an array/afterFiles
        // rewrite lets real Next routes such as /, /sso, and /logout win
        // before the API proxy is considered.
        beforeFiles: [
          {
            source: '/:path*',
            has: [{ type: 'host', value: 'api.operatoros.net' }],
            destination: `${apiUrl}/:path*`,
          },
        ],
        afterFiles: [
          // Every registered platform/module host advertises /healthz. Keep
          // that endpoint public and backed by the API health handler.
          {
            source: '/healthz',
            destination: `${apiUrl}/healthz`,
          },
          {
            source: '/readyz',
            destination: `${apiUrl}/readyz`,
          },
          {
            source: '/api/:path*',
            destination: `${apiUrl}/v1/:path*`,
          },
          {
            source: '/ws/:path*',
            destination: `${apiUrl}/:path*`,
          },
        ],
        fallback: [],
      };
    },
    // Marketing-redesign Phase 1 route split.
    //
    // The console (and all of its sub-surfaces — Platform Command, per-
    // module pages, invite-accept) now lives under `/app/*`. Old root
    // URLs (`/platform`, `/apps/:slug`, `/invites/:token`) are emitted
    // by transactional emails, audit logs, and external bookmarks, so
    // we 308-redirect them to their `/app/...` equivalents instead of
    // breaking them.
    //
    // 308 (permanent) is chosen so user agents update bookmarks and
    // crawlers update their indices; the API-side email templates can
    // migrate to the new paths in a follow-up without an interim period
    // of double-handling.
    async redirects() {
      return [
        { source: '/platform',         destination: '/app/platform',         permanent: true },
        { source: '/platform/:path*',  destination: '/app/platform/:path*',  permanent: true },
        { source: '/apps/:slug',       destination: '/app/apps/:slug',       permanent: true },
        { source: '/invites/:token',   destination: '/app/invites/:token',   permanent: true },
      ];
    },
  } : {}),
};

export default nextConfig;
