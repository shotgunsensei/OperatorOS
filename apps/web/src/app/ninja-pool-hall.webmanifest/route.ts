import { type NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const exactHost = request.nextUrl.hostname === 'ninja-pool-hall.operatoros.net';
  return NextResponse.json({
    name: 'Ninja Pool Hall',
    short_name: 'Ninja Pool',
    description: 'Mobile-first deterministic 8-ball practice, CPU, local and protected online play.',
    id: '/modules/ninja-pool-hall',
    start_url: exactHost ? '/online' : '/modules/ninja-pool-hall/online',
    scope: exactHost ? '/' : '/modules/ninja-pool-hall/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#030305',
    theme_color: '#b91c1c',
    categories: ['games', 'sports', 'entertainment'],
    icons: [{
      src: '/media/operatoros/module-ninja-pool-hall.png',
      sizes: '1024x1024',
      type: 'image/png',
      purpose: 'any maskable',
    }],
  }, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
