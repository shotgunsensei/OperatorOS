/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.MOBILE_BUILD === '1';

const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@veridian/sdk'],
  ...(isMobileBuild ? {
    output: 'export',
    distDir: 'out',
    images: { unoptimized: true },
  } : {}),
  ...(!isMobileBuild ? {
    async rewrites() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
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
