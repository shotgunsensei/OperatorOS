import { type NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const exactHost = request.nextUrl.hostname === 'operatorpoolhall.operatoros.net';
  return NextResponse.json({
    name: 'Operator Pool Hall',
    short_name: 'Pool Hall',
    description: 'Operator-themed digital pool hall with mobile-first deterministic 8-ball practice, CPU, local, and protected online play.',
    id: '/modules/ninja-pool-hall',
    start_url: exactHost ? '/online' : '/modules/ninja-pool-hall/online',
    scope: exactHost ? '/' : '/modules/ninja-pool-hall/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#020617',
    theme_color: '#0284c7',
    categories: ['games', 'sports', 'entertainment'],
    icons: [{
      src: '/brand/operatoros-mark.png',
      sizes: '1254x1254',
      type: 'image/png',
      purpose: 'any',
    }],
  }, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
