import { NextRequest, NextResponse } from 'next/server';

const FINGERPRINT = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
function exactHost(request: NextRequest): boolean {
  const raw = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const host = raw.split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'torqueshed.operatoros.net' || (process.env.NODE_ENV !== 'production' && host === 'localhost');
}

export function GET(request: NextRequest) {
  if (!exactHost(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fingerprint = process.env.TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT?.trim().toUpperCase() ?? '';
  if (!FINGERPRINT.test(fingerprint)) {
    return NextResponse.json({ error: 'TorqueShed Android association is not configured', code: 'TORQUESHED_ASSETLINKS_UNAVAILABLE' }, { status: 503 });
  }
  return NextResponse.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'pro.torqueshed.app',
      sha256_cert_fingerprints: [fingerprint],
    },
  }], { headers: { 'Cache-Control': 'public, max-age=300', 'Content-Type': 'application/json' } });
}
