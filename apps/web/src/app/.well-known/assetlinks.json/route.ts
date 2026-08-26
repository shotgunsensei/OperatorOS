import { NextRequest, NextResponse } from 'next/server';

const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u;

function requestHost(request: NextRequest): string {
  const raw = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  return raw.split(',')[0]!.trim().toLowerCase().replace(/:\d+$/u, '');
}

function tradeFlowKitFingerprints(): string[] {
  return (process.env.TRADEFLOWKIT_ANDROID_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(value => FINGERPRINT.test(value));
}

function association(packageName: string, sha256CertFingerprints: string[]) {
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: sha256CertFingerprints,
    },
  }];
}

export function GET(request: NextRequest) {
  const host = requestHost(request);
  if (host === 'torqueshed.operatoros.net' || (process.env.NODE_ENV !== 'production' && host === 'localhost')) {
    const fingerprint = process.env.TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT?.trim().toUpperCase() ?? '';
    if (!FINGERPRINT.test(fingerprint)) {
      return NextResponse.json(
        { error: 'TorqueShed Android association is not configured', code: 'TORQUESHED_ASSETLINKS_UNAVAILABLE' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(association('pro.torqueshed.app', [fingerprint]), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  if (host === 'tradeflowkit.operatoros.net') {
    const packageName = (process.env.TRADEFLOWKIT_ANDROID_PACKAGE_NAME ?? '').trim();
    const sha256CertFingerprints = tradeFlowKitFingerprints();
    const associations = /^[-A-Za-z0-9_.]+$/u.test(packageName) && sha256CertFingerprints.length > 0
      ? association(packageName, sha256CertFingerprints)
      : [];
    return NextResponse.json(associations, {
      headers: {
        'Cache-Control': associations.length > 0 ? 'public, max-age=3600' : 'no-store',
      },
    });
  }

  return NextResponse.json(
    { error: 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
