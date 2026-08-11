import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    name: 'TorqueShed Digital Garage',
    short_name: 'TorqueShed',
    description: 'Vehicle history, build journals, diagnostics, community and garage collaboration.',
    id: '/modules/torqueshed',
    start_url: '/modules/torqueshed/dashboard',
    scope: '/modules/torqueshed/',
    display: 'standalone',
    background_color: '#0b0d0f',
    theme_color: '#111315',
    categories: ['automotive', 'productivity', 'utilities'],
    icons: [{ src: '/favicon.ico', sizes: 'any', type: 'image/x-icon', purpose: 'any maskable' }],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
}
