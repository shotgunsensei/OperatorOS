'use client';

import Link from 'next/link';
import { AlertTriangle, Ban, CloudOff, Inbox, Menu, RefreshCcw, X, type LucideIcon } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  canAccessModuleRoute,
  findActiveModuleRoute,
  isModuleRouteActive,
  moduleThemeStyle,
  type ModuleRouteAccess,
  type ModuleRouteManifestGroup,
  type ModuleRouteManifestItem,
  type ModuleThemeTokens,
} from './contracts';
import styles from './ModuleApplicationShell.module.css';

export type ModuleShellState = 'ready' | 'loading' | 'empty' | 'error' | 'forbidden' | 'provider-disabled';

export interface ModuleShellClassNames {
  shell: string;
  workspace: string;
  sideRail: string;
  brand: string;
  contextChip: string;
  navGroup: string;
  navLabel: string;
  navLink: string;
  navLinkActive: string;
  railFooter: string;
  content: string;
  topbar: string;
  breadcrumbs: string;
  topActions: string;
  page: string;
  pageHeader: string;
  eyebrow: string;
  stateCard: string;
  mobileNav: string;
  mobileNavLink: string;
  mobileNavLinkActive: string;
}

export interface ModuleShellContextChip {
  label: string;
  value: string;
  title?: string;
  testId?: string;
}

export interface ModuleShellUtilityAction {
  label: string;
  href: string;
  icon: LucideIcon;
  testId?: string;
}

export interface ModuleApplicationShellProps<Capability extends string = string, Role extends string = string> {
  moduleId: string;
  moduleName: string;
  theme: ModuleThemeTokens;
  themeMode?: string;
  currentPath: string;
  navigation: readonly ModuleRouteManifestGroup<Capability, Role>[];
  access?: ModuleRouteAccess<Capability, Role>;
  brand: React.ReactNode;
  organization?: ModuleShellContextChip;
  accessContext?: ModuleShellContextChip;
  ecosystemHeader?: React.ReactNode;
  topActions?: React.ReactNode;
  breadcrumbContent?: React.ReactNode;
  utilityActions?: readonly ModuleShellUtilityAction[];
  page: {
    eyebrow: string;
    title: string;
    subtitle: string;
    actions?: React.ReactNode;
    detailLabel?: string;
  };
  state?: ModuleShellState;
  stateMessage?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
  classNames?: Partial<ModuleShellClassNames>;
  mobileNavigation?: 'drawer' | 'bottom';
  mobileItemIds?: readonly string[];
  testId?: string;
  contentId?: string;
  pageHeaderTestId?: string;
  dataAttributes?: Record<`data-${string}`, string>;
}

const defaultStateCopy: Record<Exclude<ModuleShellState, 'ready'>, { title: string; body: string }> = {
  loading: { title: 'Loading workspace', body: 'Preparing this route and its authorized organization context.' },
  empty: { title: 'Nothing here yet', body: 'This route is ready, but it does not have any records to show.' },
  error: { title: 'This route could not load', body: 'Retry the focused request. Other module areas remain available.' },
  forbidden: { title: 'Access unavailable', body: 'Your validated role or capability does not permit this route.' },
  'provider-disabled': { title: 'Provider not enabled', body: 'Configure and verify the required provider before using this workflow.' },
};

const stateIcons = {
  loading: RefreshCcw,
  empty: Inbox,
  error: AlertTriangle,
  forbidden: Ban,
  'provider-disabled': CloudOff,
};

// Kept in module memory only: it distinguishes a client-side route transition
// from the first render without persisting navigation state outside the URL.
const lastRenderedRoutes = new Map<string, string>();

function classes(custom: Partial<ModuleShellClassNames> | undefined, key: keyof ModuleShellClassNames): string {
  return custom?.[key] || styles[key];
}

function ContextChip({ value }: { value: ModuleShellContextChip }) {
  return (
    <div className={styles.contextChip} data-testid={value.testId}>
      <span>{value.label}</span><strong title={value.title || value.value}>{value.value}</strong>
    </div>
  );
}

export default function ModuleApplicationShell<Capability extends string = string, Role extends string = string>(
  props: ModuleApplicationShellProps<Capability, Role>,
) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const access = props.access ?? {};
  const currentRoute = useMemo(
    () => findActiveModuleRoute(props.navigation, props.currentPath),
    [props.currentPath, props.navigation],
  );
  const routeForbidden = !!currentRoute && !canAccessModuleRoute(currentRoute, access);
  const effectiveState: ModuleShellState = routeForbidden ? 'forbidden' : (props.state ?? 'ready');
  const mobileMode = props.mobileNavigation ?? 'drawer';
  const allItems = props.navigation.flatMap(group => group.items);
  const mobileItems = props.mobileItemIds?.length
    ? allItems.filter(item => props.mobileItemIds?.includes(item.id))
    : allItems.slice(0, 5);

  useEffect(() => {
    setDrawerOpen(false);
    const previousPath = lastRenderedRoutes.get(props.moduleId);
    lastRenderedRoutes.set(props.moduleId, props.currentPath);
    if (previousPath && previousPath !== props.currentPath) {
      document.getElementById(props.contentId || `${props.moduleId}-route-content`)?.focus({ preventScroll: true });
    }
  }, [props.contentId, props.currentPath, props.moduleId]);
  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  const navigationItem = (item: ModuleRouteManifestItem<Capability, Role>, mobile = false) => {
    const active = isModuleRouteActive(item, props.currentPath);
    const permitted = canAccessModuleRoute(item, access);
    const baseClass = mobile
      ? (props.classNames?.mobileNavLink ?? styles.navLink)
      : classes(props.classNames, 'navLink');
    const activeClass = mobile
      ? (props.classNames?.mobileNavLinkActive ?? styles.navLinkActive)
      : classes(props.classNames, 'navLinkActive');
    return (
      <Link
        key={item.id}
        href={item.canonicalPath}
        className={`${baseClass} ${active ? activeClass : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-disabled={!permitted || item.status === 'disabled' ? 'true' : undefined}
        data-route-capability={item.requiredCapability || undefined}
        data-testid={`${props.moduleId}-${mobile ? 'mobile' : 'sidebar'}-${item.id}`}
      >
        <item.icon size={mobile ? 19 : 17} aria-hidden="true" />
        <span>{mobile ? (item.mobileLabel || item.label) : item.label}</span>
        {(item.badge || item.status === 'attention') && <span className={styles.navBadge}>{item.badge || '!'}</span>}
      </Link>
    );
  };

  const stateContent = effectiveState === 'ready' ? null : defaultStateCopy[effectiveState];
  const StateIcon = effectiveState === 'ready' ? null : stateIcons[effectiveState];

  return (
    <main
      className={classes(props.classNames, 'shell')}
      style={moduleThemeStyle(props.theme)}
      data-module-theme={props.theme.id}
      data-theme={props.themeMode}
      data-testid={props.testId || `${props.moduleId}-module-shell`}
      {...props.dataAttributes}
    >
      <a className="ops-skip-link" href={`#${props.contentId || `${props.moduleId}-route-content`}`}>Skip to {props.moduleName} content</a>
      {props.ecosystemHeader}
      <div className={classes(props.classNames, 'workspace')}>
        {drawerOpen && mobileMode === 'drawer' && (
          <button type="button" className={styles.overlay} aria-label="Close module navigation" onClick={() => setDrawerOpen(false)} />
        )}
        <aside
          className={`${classes(props.classNames, 'sideRail')} ${drawerOpen && mobileMode === 'drawer' ? styles.sideRailOpen : ''}`}
          data-testid={`${props.moduleId}-module-sidebar`}
          id={`${props.moduleId}-route-navigation`}
        >
          {props.brand}
          {props.organization && (props.classNames?.contextChip
            ? <div className={classes(props.classNames, 'contextChip')} data-testid={props.organization.testId}><span>{props.organization.label}</span><strong title={props.organization.title || props.organization.value}>{props.organization.value}</strong></div>
            : <ContextChip value={props.organization} />)}
          {props.navigation.map(group => (
            <nav key={group.id} className={classes(props.classNames, 'navGroup')} aria-label={`${props.moduleName} ${group.label.toLowerCase()} navigation`}>
              <span className={classes(props.classNames, 'navLabel')}>{group.label}</span>
              {group.items.map(item => navigationItem(item))}
            </nav>
          ))}
          {props.accessContext && (
            <div className={classes(props.classNames, 'railFooter')}>
              {props.classNames?.contextChip
                ? <div className={classes(props.classNames, 'contextChip')} data-testid={props.accessContext.testId}><span>{props.accessContext.label}</span><strong>{props.accessContext.value}</strong></div>
                : <ContextChip value={props.accessContext} />}
            </div>
          )}
        </aside>

        <div className={classes(props.classNames, 'content')}>
          <div className={classes(props.classNames, 'topbar')}>
            {mobileMode === 'drawer' && (
              <button
                type="button"
                className={styles.drawerButton}
                aria-label={drawerOpen ? `Close ${props.moduleName} navigation` : `Open ${props.moduleName} navigation`}
                aria-controls={`${props.moduleId}-route-navigation`}
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(open => !open)}
              >
                {drawerOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              </button>
            )}
            <nav className={classes(props.classNames, 'breadcrumbs')} aria-label={`${props.moduleName} breadcrumb`}>
              {props.breadcrumbContent ?? (
                <><span>{props.moduleName}</span><span aria-hidden="true">/</span>
                  <strong aria-current="page">{props.page.detailLabel || currentRoute?.breadcrumbLabel || currentRoute?.label || props.page.title}</strong></>
              )}
            </nav>
            <div className={classes(props.classNames, 'topActions')}>
              {props.utilityActions?.map(action => (
                <Link key={action.label} href={action.href} className={styles.utilityLink} aria-label={action.label} data-testid={action.testId}>
                  <action.icon size={17} aria-hidden="true" /><span className="module-utility-label">{action.label}</span>
                </Link>
              ))}
              {props.topActions}
            </div>
          </div>

          <section className={classes(props.classNames, 'page')}>
            <header id={props.contentId || `${props.moduleId}-route-content`} className={classes(props.classNames, 'pageHeader')} tabIndex={-1} data-testid={props.pageHeaderTestId}>
              <div>
                <div className={classes(props.classNames, 'eyebrow')}>{props.page.eyebrow}</div>
                <h1>{props.page.title}</h1>
                <p>{props.page.subtitle}</p>
              </div>
              {props.page.actions}
            </header>
            {stateContent && StateIcon ? (
              <section className={classes(props.classNames, 'stateCard')} data-module-state={effectiveState} aria-busy={effectiveState === 'loading' || undefined} role={effectiveState === 'error' || effectiveState === 'forbidden' ? 'alert' : 'status'}>
                <div>
                  <StateIcon size={22} aria-hidden="true" />
                  <h2>{stateContent.title}</h2>
                  <p>{props.stateMessage || stateContent.body}</p>
                  {effectiveState === 'error' && props.onRetry && <button type="button" onClick={props.onRetry}>Retry</button>}
                </div>
              </section>
            ) : props.children}
          </section>
        </div>
      </div>

      {mobileMode === 'bottom' && (
        <nav className={classes(props.classNames, 'mobileNav')} aria-label={`${props.moduleName} mobile navigation`} data-testid={`${props.moduleId}-mobile-nav`}>
          {mobileItems.map(item => navigationItem(item, true))}
        </nav>
      )}
    </main>
  );
}
