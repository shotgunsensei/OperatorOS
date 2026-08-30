'use client';

import Link from 'next/link';
import {
  Activity,
  Boxes,
  CreditCard,
  FileClock,
  Grid2X2,
  HeartPulse,
  Home,
  KeyRound,
  LifeBuoy,
  LogOut,
  Menu,
  PackageOpen,
  ReceiptText,
  ShieldCheck,
  Tags,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import OperatorLogo from '@/components/brand/OperatorLogo';
import TenantMessenger from '@/components/TenantMessenger';
import { platformViewToPath, type PlatformView } from '@/lib/platform-routes';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import { PLATFORM_DOMAINS } from '../../../../../packages/sdk/src/ecosystem.js';
import styles from './PlatformCommandShell.module.css';

type AccessState = 'loading' | 'denied' | 'authorized';

type ReleaseIdentity = {
  status?: string;
  commit?: string;
  buildId?: string;
};

const sections: Array<{
  kind: PlatformView['kind'];
  label: string;
  view: PlatformView;
  Icon: typeof Activity;
}> = [
  { kind: 'dashboard', label: 'Overview', view: { kind: 'dashboard' }, Icon: Activity },
  { kind: 'tenants', label: 'Tenants', view: { kind: 'tenants' }, Icon: Boxes },
  { kind: 'users', label: 'Users', view: { kind: 'users' }, Icon: UsersRound },
  { kind: 'modules', label: 'Modules', view: { kind: 'modules' }, Icon: PackageOpen },
  { kind: 'billing', label: 'Billing Events', view: { kind: 'billing' }, Icon: ReceiptText },
  { kind: 'pricing', label: 'Pricing', view: { kind: 'pricing' }, Icon: Tags },
  // Phase 42 added this durable catalog. It remains a first-class command
  // destination instead of being hidden by the Phase 47 shell migration.
  { kind: 'credit-catalog', label: 'Credit Catalog', view: { kind: 'credit-catalog' }, Icon: CreditCard },
  { kind: 'health', label: 'Health', view: { kind: 'health' }, Icon: HeartPulse },
  { kind: 'audit', label: 'Audit', view: { kind: 'audit' }, Icon: FileClock },
  { kind: 'sso', label: 'SSO', view: { kind: 'sso' }, Icon: KeyRound },
];

function sectionKind(view: PlatformView): PlatformView['kind'] {
  if (view.kind === 'tenant') return 'tenants';
  if (view.kind === 'user') return 'users';
  if (view.kind === 'module') return 'modules';
  return view.kind;
}

function sectionLabel(view: PlatformView): string {
  const kind = sectionKind(view);
  return sections.find(section => section.kind === kind)?.label ?? 'Overview';
}

function safeDetailLabel(view: PlatformView): string | null {
  const raw = view.kind === 'tenant' || view.kind === 'user'
    ? view.id
    : view.kind === 'module'
      ? view.slug
      : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 96);
  } catch {
    return raw.slice(0, 96);
  }
}

function runtimeEnvironment(): string {
  if (typeof window === 'undefined') return 'ENVIRONMENT';
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return 'LOCAL';
  if (host.includes('staging') || host.includes('preview') || host.includes('replit.dev')) return 'NON-PRODUCTION';
  return 'PRODUCTION';
}

export default function PlatformCommandShell({
  accessState,
  view,
  children,
  deniedActions,
}: {
  accessState: AccessState;
  view: PlatformView;
  children?: React.ReactNode;
  deniedActions?: React.ReactNode;
}) {
  const { logoutEverywhere } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseIdentity | null>(null);
  const activeLabel = accessState === 'denied' ? 'Access denied' : sectionLabel(view);
  const activeKind = sectionKind(view);
  const detailLabel = safeDetailLabel(view);
  const environment = useMemo(runtimeEnvironment, []);

  useEffect(() => setDrawerOpen(false), [view.kind, detailLabel]);
  useEffect(() => {
    let active = true;
    fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (active) setRelease(body?.release ?? { status: 'unavailable' }); })
      .catch(() => { if (active) setRelease({ status: 'unavailable' }); });
    return () => { active = false; };
  }, []);

  async function globalLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logoutEverywhere();
      window.location.assign(`${PLATFORM_DOMAINS.root}/signed-out?signed_out=global`);
    } catch {
      setLogoutError('Sign out could not be confirmed. This session remains active; retry in a moment.');
      setLoggingOut(false);
    }
  }

  const releaseLabel = release?.status === 'identified' && release.commit
    ? `RELEASE ${release.commit.slice(0, 7)}`
    : release
      ? 'RELEASE UNIDENTIFIED'
      : 'RELEASE CHECKING';

  return (
    <div className={styles.shell} data-testid="platform-command-shell">
      <a className={styles.skipLink} href="#platform-command-content">Skip to command content</a>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.identity}>
            {accessState === 'authorized' && (
              <button
                type="button"
                className={styles.menuButton}
                aria-label={drawerOpen ? 'Close Platform Command navigation' : 'Open Platform Command navigation'}
                aria-controls="platform-command-navigation"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(open => !open)}
                data-testid="platform-drawer-toggle"
              >
                {drawerOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
              </button>
            )}
            <a className={styles.brand} href={PLATFORM_DOMAINS.root} aria-label="OperatorOS home">
              <OperatorLogo size={30} wordmarkSize={13} showDomain={false} />
            </a>
            <span className={styles.commandMark}>Platform Command</span>
            <div className={styles.context} aria-label="Runtime identity">
              <span className={styles.badge} data-testid="platform-environment">{environment}</span>
              <span className={styles.badge} data-testid="platform-release">{releaseLabel}</span>
            </div>
          </div>
          <nav className={styles.accountNav} aria-label="OperatorOS global navigation">
            {accessState === 'authorized' && <TenantMessenger />}
            <Link className={styles.accountLink} href="/app" data-testid="platform-my-apps">
              <Grid2X2 size={16} aria-hidden="true" /><span>My Apps</span>
            </Link>
            <a className={styles.accountLink} href={PLATFORM_DOMAINS.root}>
              <Home size={16} aria-hidden="true" /><span>OperatorOS Home</span>
            </a>
            <a className={styles.accountLink} href={DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl}>
              <UserRound size={16} aria-hidden="true" /><span>Profile and security</span>
            </a>
            <a className={styles.accountLink} href={buildOperatorOSHelpUrl({ module: 'platform-command' })}>
              <LifeBuoy size={16} aria-hidden="true" /><span>Help and support</span>
            </a>
            {accessState !== 'loading' && (
              <button
                type="button"
                className={styles.logoutButton}
                onClick={() => void globalLogout()}
                disabled={loggingOut}
                data-testid="platform-global-logout"
              >
                <LogOut size={16} aria-hidden="true" /><span>{loggingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            )}
          </nav>
        </div>
        {logoutError && <div className={styles.alert} role="alert">{logoutError}</div>}
      </header>

      {accessState === 'authorized' ? (
        <div className={styles.body}>
          {drawerOpen && (
            <button
              type="button"
              className={styles.overlay}
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            />
          )}
          <nav
            id="platform-command-navigation"
            className={`${styles.sideNav} ${drawerOpen ? styles.sideNavOpen : ''}`}
            aria-label="Platform Command sections"
          >
            <p className={styles.navLabel}>Command workspace</p>
            {sections.map(({ kind, label, view: destination, Icon }) => {
              const active = activeKind === kind;
              return (
                <Link
                  key={kind}
                  href={platformViewToPath(destination)}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`platform-nav-${kind}`}
                >
                  <Icon size={16} aria-hidden="true" /> {label}
                </Link>
              );
            })}
          </nav>
          <div className={styles.mainColumn}>
            <div className={styles.crumbBar}>
              <nav className={styles.crumbs} aria-label="Breadcrumb">
                <Link href="/app/platform">Platform Command</Link>
                {activeKind !== 'dashboard' && <span aria-hidden="true">/</span>}
                {detailLabel ? (
                  <>
                    <Link href={platformViewToPath({ kind: activeKind } as PlatformView)}>{sectionLabel(view)}</Link>
                    <span aria-hidden="true">/</span>
                    <span className={styles.crumbCurrent} aria-current="page">{detailLabel}</span>
                  </>
                ) : activeKind !== 'dashboard' ? (
                  <span className={styles.crumbCurrent} aria-current="page">{sectionLabel(view)}</span>
                ) : null}
              </nav>
              <span className={styles.activeSection}>Active: {activeLabel}</span>
            </div>
            <main id="platform-command-content" className={styles.content} tabIndex={-1}>
              {children}
            </main>
          </div>
        </div>
      ) : (
        <main id="platform-command-content" className={styles.content} tabIndex={-1}>
          <section className={styles.state} data-testid={`platform-${accessState}`}>
            <div>
              {accessState === 'loading' ? (
                <>
                  <ShieldCheck size={34} color="#8bb9ff" aria-hidden="true" />
                  <h1>Verifying platform access</h1>
                  <p>OperatorOS is checking your authenticated platform role before loading any command data.</p>
                </>
              ) : (
                <>
                  <ShieldCheck size={34} color="#ff8a82" aria-hidden="true" />
                  <h1>403 — Platform Command unavailable</h1>
                  <p>This workspace requires the OperatorOS super-admin role. No platform records were loaded.</p>
                  <div className={styles.stateActions}>
                    {deniedActions ?? <Link href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}>Return to My Apps</Link>}
                    <a href={PLATFORM_DOMAINS.root}>OperatorOS Home</a>
                  </div>
                </>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
