/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.MOBILE_BUILD === '1';
const isDev = process.env.NODE_ENV !== 'production';

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
  // dev/CI via `pnpm typecheck` and `pnpm lint`, so we skip the redundant
  // pass here to keep production builds reproducible.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  ...(isMobileBuild ? {
    output: 'export',
    distDir: 'out',
    images: { unoptimized: true },
  } : {}),
  ...(!isMobileBuild ? {
    async rewrites() {
      const apiUrl = resolveApiUrl();
      return [
        {
          source: '/api/:path*',
          destination: `${apiUrl}/v1/:path*`,
        },
        {
          source: '/ws/:path*',
          destination: `${apiUrl}/:path*`,
        },
      ];
    },
  } : {}),
};

export default nextConfig;
