'use client';

import { AlertTriangle } from 'lucide-react';
import { colors } from '../SaasLayout';

interface SuspendedPageProps {
  onLogout: () => void;
  message?: string;
}

export default function SuspendedPage({ onLogout, message }: SuspendedPageProps) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: colors.bg, padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 480, background: colors.bgSecondary,
        border: `1px solid ${colors.border}`, borderRadius: 16, padding: 40,
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 24px',
          background: 'rgba(248,81,73,0.15)', border: `1px solid ${colors.accentRed}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertTriangle size={32} color={colors.accentRed} strokeWidth={2} />
        </div>

        <h1 data-testid="suspended-title" style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>
          Account Suspended
        </h1>

        <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 24px', lineHeight: 1.6 }}>
          {message || 'Your account has been suspended. If you believe this is a mistake, please contact support for assistance.'}
        </p>

        <div style={{
          padding: '16px', borderRadius: 8,
          background: 'rgba(248,81,73,0.08)', border: `1px solid rgba(248,81,73,0.2)`,
          marginBottom: 24,
        }}>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
            Contact support at <span style={{ color: colors.accent }}>support@operatoros.com</span> for help with your account.
          </p>
        </div>

        <button
          data-testid="button-suspended-logout"
          onClick={onLogout}
          style={{
            padding: '12px 32px', borderRadius: 8, border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.text,
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >Sign out</button>
      </div>
    </div>
  );
}
