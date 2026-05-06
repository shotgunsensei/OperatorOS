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
    if ((user as any).platformRole === 'super_admin') {
      router.replace('/platform');
    } else {
      router.replace('/');
    }
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
