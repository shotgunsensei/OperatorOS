'use client';

import AuthProvider, { useAuth } from '@/components/AuthProvider';
import TenantProvider from '@/components/TenantProvider';
import LoginPage from '@/components/pages/LoginPage';
import OfficeExitTenantLink from '@/components/OfficeExitTenantLink';

function Content() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking your account.</p>;
  if (!user) return <LoginPage onSwitch={() => { window.location.assign('/app'); }} />;
  return <OfficeExitTenantLink />;
}
export default function OfficeExitLinkPage() {
  return <AuthProvider><TenantProvider><Content /></TenantProvider></AuthProvider>;
}
