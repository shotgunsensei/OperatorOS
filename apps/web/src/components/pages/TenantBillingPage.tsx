'use client';

import React from 'react';
import { Receipt } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import BillingPage from './BillingPage';

export default function TenantBillingPage() {
  return (
    <div data-testid="page-tenant-billing">
      <header
        style={{
          padding: '24px 32px 0',
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <Receipt size={24} color={colors.accent} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>Tenant Billing</h1>
          <p style={{ color: colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            Subscription, usage, and add-ons for the active tenant. Owners see full controls; admins see read-only state.
          </p>
        </div>
      </header>
      <BillingPage />
    </div>
  );
}
