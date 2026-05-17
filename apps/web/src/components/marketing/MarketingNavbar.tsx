'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import OperatorLogo from '../brand/OperatorLogo';
import { brand } from '@/lib/design-tokens';

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'Platform' },
  { href: '/modules', label: 'Modules' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/pricing', label: 'Pricing' },
];

/**
 * MarketingNavbar — sticky glass-blurred top bar for public pages.
 *
 * Renders OperatorOS logo, primary nav links, and a context-aware CTA:
 *   - Signed in   → "Go to Console" (→ /app)
 *   - Signed out  → "Sign in" + "Launch console"
 *
 * Mobile (< 768px): collapses links into a hamburger drawer.
 */
export default function MarketingNavbar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes operatoros-nav-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .operatoros-nav-link {
          position: relative;
          color: var(--brand-text-secondary);
          font-size: 14px;
          font-weight: 500;
          padding: 8px 4px;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .operatoros-nav-link:hover { color: var(--brand-text-primary); }
        .operatoros-nav-link[data-active="true"] { color: var(--brand-text-primary); }
        .operatoros-nav-link[data-active="true"]::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -2px;
          height: 2px;
          background: linear-gradient(90deg, var(--brand-accent-cyan), var(--brand-accent-violet));
          border-radius: 2px;
        }
        .operatoros-cta-primary {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px;
          background: linear-gradient(135deg, var(--brand-accent-cyan) 0%, var(--brand-accent-violet) 100%);
          color: var(--brand-accent-ink); font-weight: 600; font-size: 13px;
          text-decoration: none; border: none; cursor: pointer;
          box-shadow: var(--brand-cta-glow-soft);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .operatoros-cta-primary:hover {
          transform: translateY(-1px);
          box-shadow: var(--brand-cta-glow-hover);
        }
        .operatoros-cta-secondary {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px;
          background: transparent; color: var(--brand-text-primary);
          font-weight: 500; font-size: 13px; text-decoration: none;
          border: 1px solid var(--brand-border-soft); cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .operatoros-cta-secondary:hover {
          border-color: var(--brand-border-strong);
          background: var(--brand-bg-glass-hover);
        }
        @media (max-width: 767px) {
          .operatoros-nav-desktop { display: none !important; }
          .operatoros-nav-mobile-toggle { display: inline-flex !important; }
        }
        @media (min-width: 768px) {
          .operatoros-nav-mobile-drawer { display: none !important; }
          .operatoros-nav-mobile-toggle { display: none !important; }
        }
      ` }} />

      <header
        data-testid="marketing-navbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          background: scrolled ? brand.bgGlassNavScrolled : brand.bgGlassNavTop,
          borderBottom: `1px solid ${scrolled ? brand.borderSoft : 'transparent'}`,
          transition: 'background 0.2s ease, border-color 0.2s ease',
        }}
      >
        <div
          style={{
            maxWidth: brand.contentMaxWidth,
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <Link
            href="/"
            data-testid="link-marketing-home"
            style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex' }}
          >
            <OperatorLogo size={32} wordmarkSize={16} />
          </Link>

          <nav
            className="operatoros-nav-desktop"
            data-testid="marketing-nav-desktop"
            style={{ display: 'flex', alignItems: 'center', gap: 28, marginLeft: 16 }}
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="operatoros-nav-link"
                data-active={isActive(link.href)}
                data-testid={`marketing-nav-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div style={{ flex: 1 }} />

          <div
            className="operatoros-nav-desktop"
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            {!loading && (
              user ? (
                <Link
                  href="/app"
                  className="operatoros-cta-primary"
                  data-testid="cta-go-to-console"
                >
                  Go to console <ArrowRight size={14} />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="operatoros-cta-secondary"
                    data-testid="cta-sign-in"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/login"
                    className="operatoros-cta-primary"
                    data-testid="cta-launch-console"
                  >
                    Launch console <ArrowRight size={14} />
                  </Link>
                </>
              )
            )}
          </div>

          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            data-testid="marketing-nav-mobile-toggle"
            className="operatoros-nav-mobile-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 8,
              border: `1px solid ${brand.borderSoft}`,
              background: 'transparent',
              color: brand.textPrimary,
              cursor: 'pointer',
            }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileOpen && (
          <div
            className="operatoros-nav-mobile-drawer"
            data-testid="marketing-nav-mobile-drawer"
            style={{
              borderTop: `1px solid ${brand.borderSoft}`,
              padding: '12px 24px 18px',
              animation: 'operatoros-nav-fade 0.2s ease',
              background: brand.bgPrimary,
            }}
          >
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="operatoros-nav-link"
                  data-active={isActive(link.href)}
                  data-testid={`marketing-nav-mobile-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                  style={{ padding: '10px 4px', fontSize: 15 }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {!loading && (
                user ? (
                  <Link
                    href="/app"
                    className="operatoros-cta-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    data-testid="cta-mobile-go-to-console"
                  >
                    Go to console <ArrowRight size={14} />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="operatoros-cta-secondary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      data-testid="cta-mobile-sign-in"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/login"
                      className="operatoros-cta-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      data-testid="cta-mobile-launch-console"
                    >
                      Launch <ArrowRight size={14} />
                    </Link>
                  </>
                )
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
