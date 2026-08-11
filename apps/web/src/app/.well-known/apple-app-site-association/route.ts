import { NextRequest, NextResponse } from 'next/server';

const TEAM_ID = /^[A-Z0-9]{10}$/;
function exactHost(request: NextRequest): boolean {
  const raw = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const host = raw.split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'torqueshed.operatoros.net' || (process.env.NODE_ENV !== 'production' && host === 'localhost');
}

export function GET(request: NextRequest) {
  if (!exactHost(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const teamId = process.env.TORQUESHED_IOS_TEAM_ID?.trim().toUpperCase() ?? '';
  if (!TEAM_ID.test(teamId)) {
    return NextResponse.json({ error: 'TorqueShed iOS association is not configured', code: 'TORQUESHED_AASA_UNAVAILABLE' }, { status: 503 });
  }
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [{
        appIDs: [`${teamId}.pro.torqueshed.app`],
        components: [
          { '/': '/garage/*', comment: 'Garage and vehicle records' },
          { '/': '/build/*', comment: 'Build journals' },
          { '/': '/diagnostic/*', comment: 'Diagnostic cases' },
          { '/': '/live-bay/*', comment: 'Authorized live collaboration' },
          { '/': '/market/*', comment: 'DIY marketplace' },
          { '/': '/profile', comment: 'Community profile' },
          { '/': '/notifications', comment: 'Notifications' },
          { '/': '/settings', comment: 'Native settings' },
        ],
      }],
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300', 'Content-Type': 'application/json' } });
}
