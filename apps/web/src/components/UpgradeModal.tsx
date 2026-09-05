'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Layers3, ShieldCheck, Users, X } from 'lucide-react';
import { useTenant } from '@/components/TenantProvider';
import { colors } from './SaasLayout';
import OperatorMark from './brand/OperatorMark';
import { brand } from '@/lib/brand';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Retained for callers that previously refreshed after a plan mutation. */
  onUpgraded: () => void;
  resource?: string;
  message?: string;
  /** Legacy hint retained for source compatibility; Application Stack has one offer. */
  upgradeSlug?: string;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  onUpgraded: _onUpgraded,
  resource,
  message,
  upgradeSlug: _upgradeSlug,
}: UpgradeModalProps) {
  const { activeRole } = useTenant();
  const isOwner = activeRole === 'owner';

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(1,4,9,0.82)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}
      onClick={onClose}
      data-testid="upgrade-modal"
      role="presentation"
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(18,24,38,0.99), rgba(8,11,18,0.99))',
          border: `1px solid ${brand.borderStrong}`,
          borderRadius: 20,
          padding: 'clamp(22px, 4vw, 34px)',
          maxWidth: 720,
          width: '100%',
          boxShadow: '0 38px 120px rgba(0,0,0,.62), 0 0 70px rgba(124,58,237,.12)',
        }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <OperatorMark size={40} glow />
            <div>
              <div style={{ color: brand.accentCyan, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                One monthly business subscription
              </div>
              <h2 id="upgrade-modal-title" style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '4px 0 0' }}>
                Build an Application Stack
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="button-close-upgrade-modal"
            aria-label="Close Application Stack details"
            style={{ minWidth: 40, minHeight: 40, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', padding: 4 }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6, margin: '18px 0 0' }}>
          {message ?? 'Application Stack is the only offer available for a new paid subscription. Legacy Starter, Pro, Elite, and per-application purchases are closed to new sales.'}
        </p>
        {resource && (
          <div style={{ marginTop: 10, color: brand.accentCyan, fontSize: 12, fontWeight: 700 }}>
            Capacity requested for: {resource}
          </div>
        )}

        <div
          data-testid="workspace-capacity-stack-note"
          style={{
            marginTop: 22,
            padding: 18,
            borderRadius: 14,
            border: `1px solid ${brand.borderSoft}`,
            background: 'linear-gradient(105deg, rgba(0,229,255,.07), rgba(124,58,237,.08))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#fff', fontSize: 16, fontWeight: 800 }}>
            <Layers3 size={19} color={brand.accentCyan} /> One flagship application per organization
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 16 }}>
            <OfferItem icon={<Users size={15} />} text="Five seats included" />
            <OfferItem icon={<CheckCircle2 size={15} />} text="One eligible companion included" />
            <OfferItem icon={<Layers3 size={15} />} text="Extra companions: $29/month" />
            <OfferItem icon={<Users size={15} />} text="Extra seats: $15/month" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, color: colors.textMuted, fontSize: 12 }}>
            <ShieldCheck size={14} color={brand.accentCyan} /> Final price is shown by secure checkout before any charge.
          </div>
        </div>

        {!isOwner && (
          <div role="status" style={{ marginTop: 18, padding: '11px 13px', borderRadius: 9, background: 'rgba(210,153,34,.08)', border: `1px solid ${colors.accentYellow}55`, color: colors.text, fontSize: 12, lineHeight: 1.5 }}>
            Billing is read-only for your role. Only the organization owner can choose the flagship application or change paid capacity.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: 42, padding: '9px 15px', borderRadius: 9, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontWeight: 700 }}
          >
            Keep current access
          </button>
          {isOwner ? (
            <Link
              href="/pricing#build-stack"
              onClick={onClose}
              style={{ minHeight: 42, padding: '9px 15px', borderRadius: 9, background: `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`, color: brand.accentInk, fontSize: 13, fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, boxSizing: 'border-box' }}
            >
              Review Application Stack <ArrowRight size={14} />
            </Link>
          ) : (
            <Link
              href="/app?page=tenant-billing"
              onClick={onClose}
              style={{ minHeight: 42, padding: '9px 15px', borderRadius: 9, border: `1px solid ${brand.borderStrong}`, color: brand.accentCyan, fontSize: 13, fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, boxSizing: 'border-box' }}
            >
              View billing state <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function OfferItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={{ minHeight: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(1,4,9,.38)', color: colors.text, fontSize: 12, fontWeight: 700 }}>
      <span style={{ color: brand.accentCyan, display: 'inline-flex' }}>{icon}</span>
      {text}
    </div>
  );
}
