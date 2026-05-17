'use client';

/**
 * Gate 2 — Legacy `/admin` URL contract.
 *
 * Super admins are redirected to `/platform` (the new Platform Command).
 * Everyone else (legacy `role='admin'` only) is bounced back to `/`,
 * where the in-app sidebar still surfaces the legacy AdminPage. This
 * keeps any external link or bookmarked URL working without exposing
 * the legacy admin shell to a super-admin who should be using
 * Platform Command instead.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthProvider, { useAuth } from '@/components/AuthProvider';

function AdminRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/'); return; }
    // Gate 2 contract: /admin always routes through /platform. The
    // /platform/[[...slug]] route surfaces a friendly 403 for non-super-
    // admins, so we never need to bounce them to the legacy admin shell —
    // and the URL stays consistent with the published "/platform" surface.
    router.replace('/app/platform');
  }, [user, loading, router]);
  return <div style={{ padding: 48, color: '#8b949e', textAlign: 'center' }}>Redirecting…</div>;
}

export default function AdminRoute() {
  return (
    <AuthProvider>
      <AdminRedirect />
    </AuthProvider>
  );
}
