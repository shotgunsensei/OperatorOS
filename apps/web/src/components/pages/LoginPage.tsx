'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Layers3, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import OperatorLogo from '../brand/OperatorLogo';
import { brand } from '@/lib/brand';

interface LoginPageProps {
  onSwitch: (page: 'register' | 'forgot-password') => void;
}

const BENEFITS = [
  { icon: KeyRound, title: 'Sign in once', body: 'Your account and organization access follow you into every unlocked app.' },
  { icon: Layers3, title: 'Keep the stack connected', body: 'Apps, billing, roles, and access stay synchronized from one command layer.' },
  { icon: ShieldCheck, title: 'Operate with confidence', body: 'Server-verified access and auditable handoffs protect every module launch.' },
];

export default function LoginPage({ onSwitch }: LoginPageProps) {
  const { login, completeMfaLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mfaRequired) {
        await completeMfaLogin(useRecoveryCode
          ? { recoveryCode: mfaCode }
          : { code: mfaCode });
      } else {
        const result = await login(email, password);
        if (result.mfaRequired) {
          setMfaRequired(true);
          setPassword('');
          return;
        }
      }
    } catch (err: any) {
      setError(err.error || 'We could not sign you in. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="operatoros-auth-shell">
      <style>{`
        .operatoros-auth-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(440px, .92fr);
          background: ${brand.bgPrimary};
          color: ${brand.textPrimary};
          overflow: hidden;
        }
        .operatoros-auth-story {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 100vh;
          padding: clamp(32px, 5vw, 72px);
          box-sizing: border-box;
          isolation: isolate;
        }
        .operatoros-auth-story::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -2;
          background:
            linear-gradient(90deg, rgba(8,11,18,.28), rgba(8,11,18,.88)),
            linear-gradient(0deg, rgba(8,11,18,.96), rgba(8,11,18,.1) 58%),
            url('/media/operatoros/operatoros-command-nexus.png') center / cover no-repeat;
          filter: saturate(.92) contrast(1.04);
        }
        .operatoros-auth-story::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          background: radial-gradient(circle at 28% 36%, rgba(0,229,255,.17), transparent 34%);
        }
        .operatoros-auth-panel {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(24px, 5vw, 64px);
          box-sizing: border-box;
          background: linear-gradient(180deg, rgba(13,17,23,.98), rgba(8,11,18,1));
          border-left: 1px solid ${brand.borderSoft};
        }
        .operatoros-auth-form { width: 100%; max-width: 440px; }
        .operatoros-auth-input {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid ${brand.borderSoft};
          background: rgba(8,11,18,.82);
          color: ${brand.textPrimary};
          font: inherit;
          box-sizing: border-box;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .operatoros-auth-input:focus {
          border-color: ${brand.accentCyan};
          background: ${brand.bgPrimary};
          box-shadow: 0 0 0 3px rgba(0,229,255,.1);
        }
        .operatoros-auth-primary:hover { box-shadow: ${brand.ctaGlowHover} !important; transform: translateY(-1px); }
        .operatoros-auth-primary:focus-visible,
        .operatoros-auth-link:focus-visible { outline: 2px solid ${brand.accentCyan}; outline-offset: 3px; }
        @media (max-width: 940px) {
          .operatoros-auth-shell { grid-template-columns: 1fr; overflow: visible; }
          .operatoros-auth-story { min-height: auto; padding-bottom: 44px; }
          .operatoros-auth-story-copy { margin-top: 88px !important; }
          .operatoros-auth-panel { min-height: auto; border-left: 0; border-top: 1px solid ${brand.borderSoft}; }
        }
        @media (max-width: 560px) {
          .operatoros-auth-benefits { grid-template-columns: 1fr !important; }
          .operatoros-auth-story-copy { margin-top: 56px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-auth-primary { transition: none !important; }
          .operatoros-auth-primary:hover { transform: none; }
        }
      `}</style>

      <section className="operatoros-auth-story" aria-label="OperatorOS ecosystem overview">
        <OperatorLogo href="/" size={36} wordmarkSize={18} tagline="One command layer" />

        <div className="operatoros-auth-story-copy" style={{ marginTop: 'auto', maxWidth: 760 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 999,
            border: `1px solid ${brand.borderStrong}`, background: brand.bgGlass, color: brand.accentCyan,
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em',
          }}>
            <CheckCircle2 size={13} /> Your ecosystem, ready
          </span>
          <h1 style={{
            margin: '18px 0 14px', maxWidth: 720, fontFamily: brand.fontDisplay,
            fontSize: 'clamp(42px, 5.5vw, 76px)', lineHeight: .98, letterSpacing: '-.05em',
          }}>
            One secure entry to your entire operation.
          </h1>
          <p style={{ margin: 0, maxWidth: 620, color: brand.textSecondary, fontSize: 17, lineHeight: 1.65 }}>
            Open every approved app with the right organization, role, and access already in place.
          </p>

          <div className="operatoros-auth-benefits" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 30,
          }}>
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div key={title} style={{
                padding: 15, borderRadius: 14, border: `1px solid ${brand.borderSoft}`,
                background: 'rgba(8,11,18,.68)', backdropFilter: 'blur(12px)',
              }}>
                <Icon size={17} color={brand.accentCyan} />
                <div style={{ marginTop: 10, fontWeight: 800, fontSize: 13 }}>{title}</div>
                <div style={{ marginTop: 5, color: brand.textSecondary, fontSize: 11, lineHeight: 1.5 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="operatoros-auth-panel" aria-label="Sign in">
        <div className="operatoros-auth-form">
          <div style={{ marginBottom: 30 }}>
            <div style={{ color: brand.accentCyan, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {mfaRequired ? 'Identity verification' : 'Welcome back'}
            </div>
            <h2 style={{ margin: '9px 0 8px', fontFamily: brand.fontDisplay, fontSize: 34, letterSpacing: '-.04em' }}>
              {mfaRequired ? 'Confirm it is really you.' : 'Enter your command center.'}
            </h2>
            <p style={{ margin: 0, color: brand.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
              {mfaRequired
                ? 'Enter the current six-digit authenticator code or one unused recovery code.'
                : 'Your app access and active organization will be restored automatically.'}
            </p>
          </div>

          {error && (
            <div role="alert" data-testid="login-error" style={{
              padding: '11px 14px', marginBottom: 18, borderRadius: 10,
              background: 'rgba(239,35,60,.09)', border: `1px solid ${brand.accentRed}88`,
              color: '#FF7185', fontSize: 13, lineHeight: 1.45,
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            {!mfaRequired && <div style={{ marginBottom: 17 }}>
              <label htmlFor="operatoros-email" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                Work email
              </label>
              <input
                id="operatoros-email"
                className="operatoros-auth-input"
                data-testid="input-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>}

            {!mfaRequired && <div style={{ marginBottom: 8 }}>
              <label htmlFor="operatoros-password" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                Password
              </label>
              <input
                id="operatoros-password"
                className="operatoros-auth-input"
                data-testid="input-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>}

            {mfaRequired && <div style={{ marginBottom: 17 }}>
              <label htmlFor="operatoros-mfa-code" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                {useRecoveryCode ? 'Recovery code' : 'Authenticator code'}
              </label>
              <input
                id="operatoros-mfa-code"
                className="operatoros-auth-input"
                data-testid="input-mfa-code"
                type="text"
                inputMode={useRecoveryCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={event => setMfaCode(event.target.value)}
                required
                autoFocus
                placeholder={useRecoveryCode ? 'ABCDE-12345' : '123456'}
              />
            </div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 22 }}>
              {mfaRequired && <button
                type="button"
                className="operatoros-auth-link"
                data-testid="button-mfa-mode"
                onClick={() => { setUseRecoveryCode(value => !value); setMfaCode(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: brand.accentCyan, cursor: 'pointer', fontSize: 13, padding: 4 }}
              >{useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}</button>}
              <button
                type="button"
                className="operatoros-auth-link"
                data-testid="link-forgot-password"
                onClick={() => {
                  if (mfaRequired) {
                    setMfaRequired(false);
                    setMfaCode('');
                    setUseRecoveryCode(false);
                    setError('');
                    return;
                  }
                  onSwitch('forgot-password');
                }}
                style={{ background: 'none', border: 'none', color: brand.accentCyan, cursor: 'pointer', fontSize: 13, padding: 4 }}
              >{mfaRequired ? 'Start sign-in again' : 'Forgot password?'}</button>
            </div>

            <button
              type="submit"
              className="operatoros-auth-primary"
              data-testid="button-login"
              disabled={loading}
              style={{
                width: '100%', minHeight: 50, padding: '12px 16px', borderRadius: 12, border: 'none',
                background: loading ? brand.textMuted : `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`,
                color: brand.accentInk, fontSize: 14, fontWeight: 850, cursor: loading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : brand.ctaGlowSoft, transition: 'transform 160ms ease, box-shadow 160ms ease',
              }}
            >
              {loading
                ? (mfaRequired ? 'Verifying identity…' : 'Opening your command center…')
                : <>{mfaRequired ? 'Verify and continue' : 'Continue to OperatorOS'} <ArrowRight size={16} /></>}
            </button>
          </form>

          {!mfaRequired && <div style={{ marginTop: 24, paddingTop: 22, borderTop: `1px solid ${brand.borderSoft}`, textAlign: 'center', fontSize: 13, color: brand.textSecondary }}>
            New to the ecosystem?{' '}
            <button
              className="operatoros-auth-link"
              data-testid="link-register"
              onClick={() => onSwitch('register')}
              style={{ background: 'none', border: 'none', color: brand.accentCyan, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >Create your free command layer</button>
          </div>}
        </div>
      </section>
    </main>
  );
}
