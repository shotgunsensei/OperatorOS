import { type NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const exactHost = request.nextUrl.hostname === 'faultlinelab.operatoros.net';
  return NextResponse.json({
    name: 'FaultlineLab — Diagnostic Challenge Platform',
    short_name: 'FaultlineLab',
    description: 'Persistent, server-scored diagnostic investigations for technical operators and teams.',
    id: exactHost ? '/' : '/modules/faultlinelab',
    start_url: exactHost ? '/challenges' : '/modules/faultlinelab/challenges',
    scope: exactHost ? '/' : '/modules/faultlinelab/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0a0e14',
    theme_color: '#8b5cf6',
    categories: ['education', 'productivity', 'utilities'],
    icons: [{
      src: '/app-logos/faultlinelab.png',
      sizes: '512x512',
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
