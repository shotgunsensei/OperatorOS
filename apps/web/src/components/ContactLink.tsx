'use client';

import React from 'react';
import { Mail } from 'lucide-react';

/**
 * ContactLink — a small fixed "Contact" pill for pages that don't render one of
 * the shared shells (marketing navbar/footer or the console sidebar), so the
 * Contact link is reachable on every page.
 *
 * It points at the root-domain contact page with an ABSOLUTE URL so it resolves
 * to operatoros.net/john regardless of which subdomain the current page is
 * served from.
 */
export const CONTACT_URL = 'https://operatoros.net/john';

export default function ContactLink() {
  return (
    <a
      href={CONTACT_URL}
      data-testid="link-contact-floating"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 999,
        background: 'rgba(13, 17, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid #21262d',
        color: '#c9d1d9',
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
      }}
    >
      <Mail size={15} />
      <span>Contact</span>
    </a>
  );
}
