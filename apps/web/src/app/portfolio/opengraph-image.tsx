import { ImageResponse } from 'next/og';

// Next.js convention: this file becomes the auto-attached
// `og:image` for /portfolio at 1200x630. Uses the built-in
// `next/og` ImageResponse — no extra dependency, no external
// host, generated on demand at the edge.

export const alt = 'John Travis Williams Jr. — Senior Infrastructure & Security Engineer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#080B12';
const TEXT = '#F8FAFC';
const TEXT_DIM = '#A7B0C0';
const CYAN = '#00E5FF';
const VIOLET = '#7C3AED';
const BORDER = 'rgba(148, 163, 184, 0.18)';

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: BG,
          color: TEXT,
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Radial brand glow */}
        <div
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(60% 50% at 20% 20%, rgba(0, 229, 255, 0.18) 0%, rgba(124, 58, 237, 0.10) 45%, transparent 70%)`,
          }}
        />
        {/* Top row: brand mark + status pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${CYAN}, ${VIOLET})`,
              color: '#0B0B12', fontSize: 28, fontWeight: 800,
            }}>
              JW
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>
                operatoros.net
              </span>
              <span style={{ fontSize: 16, color: TEXT_DIM }}>
                /portfolio
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 18px', borderRadius: 999,
            border: `1px solid rgba(34, 197, 94, 0.35)`,
            background: 'rgba(34, 197, 94, 0.12)',
            fontSize: 16, fontWeight: 600, color: '#22C55E',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: '#22C55E', display: 'flex' }} />
            Available for new roles
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
          <div style={{
            fontSize: 18, fontWeight: 700, letterSpacing: '0.18em',
            color: CYAN, textTransform: 'uppercase',
          }}>
            Infrastructure · Security · Automation · Healthcare IT
          </div>
          <div style={{
            fontSize: 76, fontWeight: 800, letterSpacing: '-0.025em',
            color: TEXT, lineHeight: 1.02, display: 'flex',
          }}>
            John Travis Williams Jr.
          </div>
          <div style={{
            fontSize: 32, fontWeight: 600, color: TEXT_DIM, display: 'flex',
          }}>
            Senior Infrastructure &amp; Security Engineer
          </div>
        </div>

        {/* Bottom row: metric chips */}
        <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
          {[
            ['20+', 'Years hands-on IT'],
            ['Tier 3', 'MSP escalation'],
            ['HIPAA', 'Healthcare-regulated'],
            ['Multi-site', 'Hybrid infrastructure'],
          ].map(([value, label]) => (
            <div
              key={label}
              style={{
                display: 'flex', flexDirection: 'column',
                padding: '14px 20px', borderRadius: 14,
                border: `1px solid ${BORDER}`,
                background: 'rgba(18, 24, 38, 0.72)',
                minWidth: 180,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>
                {value}
              </span>
              <span style={{ fontSize: 14, color: TEXT_DIM, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
