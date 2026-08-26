import { type NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const exactHost = request.nextUrl.hostname === 'tradeflowkit.operatoros.net';
  return NextResponse.json({
    name: 'TradeFlowKit — Business Operations for Trades',
    short_name: 'TradeFlowKit',
    description: 'Tenant-scoped leads, customers, jobs, quotes, invoices, payments, and team operations.',
    id: exactHost ? '/' : '/modules/tradeflowkit',
    start_url: exactHost ? '/' : '/modules/tradeflowkit',
    scope: exactHost ? '/' : '/modules/tradeflowkit/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#07111f',
    theme_color: '#ea580c',
    categories: ['business', 'productivity'],
    icons: [{
      src: '/app-logos/tradeflowkit.png',
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
