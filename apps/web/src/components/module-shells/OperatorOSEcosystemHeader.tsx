'use client';

import React, { useState } from 'react';
import { CreditCard, Grid2X2, LifeBuoy, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import TenantMessenger from '@/components/TenantMessenger';
import { useTenant } from '@/components/TenantProvider';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import { PLATFORM_DOMAINS } from '../../../../../packages/sdk/src/ecosystem.js';

export default function OperatorOSEcosystemHeader({
  moduleName,
  moduleSlug,
}: {
  moduleName: string;
  moduleSlug: string;
}) {
  const { user, logoutEverywhere } = useAuth();
  const { activeTenant } = useTenant();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function globalLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logoutEverywhere();
      window.location.assign(`${PLATFORM_DOMAINS.root}/signed-out?signed_out=global`);
    } catch {
      setLogoutError('We could not sign you out everywhere. This session is still active. Try again in a moment.');
      setLoggingOut(false);
    }
  }

  const links = [
    { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, Icon: Grid2X2 },
    { label: 'Profile and security', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl, Icon: UserRound },
    { label: 'Billing and plans', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.billingUrl, Icon: CreditCard },
    { label: 'Help and support', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.supportUrl, Icon: LifeBuoy },
  ];

  return (
    <>
      <style>{`
        .operatoros-ecosystem-header { background:#121820; color:#f1f5f9; border-bottom:1px solid #2b3746; padding:10px 18px; position:relative; z-index:20; }
        .operatoros-ecosystem-header__row { max-width:1320px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .operatoros-ecosystem-header__identity { min-width:0; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .operatoros-ecosystem-header__brand { color:#8bb9ff; font-weight:800; letter-spacing:.01em; font-size:13px; }
        .operatoros-ecosystem-header__context { color:#aeb9c7; font-size:12px; overflow-wrap:anywhere; }
        .operatoros-ecosystem-header__nav { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .operatoros-ecosystem-header__link { display:inline-flex; align-items:center; gap:5px; min-height:40px; padding:8px 10px; color:#dbe4ee; border:1px solid transparent; border-radius:7px; background:transparent; font:inherit; font-size:12px; font-weight:650; text-decoration:none; cursor:pointer; }
        .operatoros-ecosystem-header__link:hover, .operatoros-ecosystem-header__link:focus-visible { color:#fff; background:#202b38; border-color:#435269; }
        .operatoros-ecosystem-header__link:disabled { cursor:wait; opacity:.6; }
        .operatoros-ecosystem-header__error { max-width:1320px; margin:8px auto 0; color:#fca5a5; font-size:12px; }
        @media (max-width:760px) { .operatoros-ecosystem-header { padding:10px 12px; } .operatoros-ecosystem-header__nav { width:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; } .operatoros-ecosystem-header__link { min-height:44px; justify-content:center; white-space:normal; text-align:center; } }
      `}</style>
      <header className="operatoros-ecosystem-header" data-testid={`${moduleSlug}-ecosystem-header`}>
        <div className="operatoros-ecosystem-header__row">
          <div className="operatoros-ecosystem-header__identity">
            <span className="operatoros-ecosystem-header__brand">OperatorOS</span>
            <span aria-hidden="true">/</span>
            <strong>{moduleName}</strong>
            <span className="operatoros-ecosystem-header__context">
              Organization: {activeTenant?.name ?? 'None selected'} · Signed in as {user?.name || user?.email || 'Unknown user'}
            </span>
          </div>
          <nav className="operatoros-ecosystem-header__nav" aria-label="OperatorOS account">
            <TenantMessenger />
            {links.map(({ label, href, Icon }) => (
              <a key={label} className="operatoros-ecosystem-header__link" href={href}>
                <Icon size={14} aria-hidden="true" /> {label}
              </a>
            ))}
            <button
              type="button"
              className="operatoros-ecosystem-header__link"
              onClick={() => void globalLogout()}
              disabled={loggingOut}
              data-testid={`${moduleSlug}-global-logout`}
            >
              <LogOut size={14} aria-hidden="true" /> {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </nav>
        </div>
        {logoutError && <div className="operatoros-ecosystem-header__error" role="alert">{logoutError}</div>}
      </header>
    </>
  );
}
