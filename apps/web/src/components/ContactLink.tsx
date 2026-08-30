'use client';

import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../packages/modules/navigation.js';

/**
 * Legacy component name retained for import compatibility. The fixed action
 * is now Help and support so auth, invite, admin, and fallback pages never send
 * a customer to the hidden owner portfolio when they need product guidance.
 */
export const CONTACT_URL = DEFAULT_OPERATOROS_NAVIGATION_URLS.supportUrl;

export default function ContactLink() {
  return (
    <aside aria-label="Help and support">
      <a
        href={CONTACT_URL}
        className="operatoros-floating-contact"
        data-testid="link-contact-floating"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 40,
          boxSizing: 'border-box',
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
        <LifeBuoy size={15} />
        <span>Help</span>
      </a>
      <style>{`@media (max-width: 720px) { .operatoros-floating-contact { bottom: 76px !important; right: 12px !important; } }`}</style>
    </aside>
  );
}
