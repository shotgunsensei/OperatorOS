'use client';

import { colors } from '../SaasLayout';
import { buttonStyles } from '@/lib/design-tokens';

interface UnauthorizedPageProps {
  onGoBack: () => void;
  message?: string;
}

export default function UnauthorizedPage({ onGoBack, message }: UnauthorizedPageProps) {
  return (
    <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16, margin: '0 auto 24px',
        background: 'rgba(210,153,34,0.15)', border: `1px solid ${colors.accentYellow}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32,
      }}>!</div>

      <h1 data-testid="unauthorized-title" style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>
        Access denied
      </h1>

      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px', lineHeight: 1.6 }}>
        {message || 'You don\'t have permission to access this page. This area requires elevated privileges.'}
      </p>

      <button
        data-testid="button-go-back"
        onClick={onGoBack}
        style={{
          ...buttonStyles.primary,
        }}
      >Go to Dashboard</button>
    </div>
  );
}
