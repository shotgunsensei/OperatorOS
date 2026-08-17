import { ImageResponse } from 'next/og';
import { SOCIAL_IMAGE_ALT } from '@/lib/seo';

export const alt = SOCIAL_IMAGE_ALT;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 84px',
          color: '#F8FAFC',
          backgroundColor: '#080B12',
          backgroundImage:
            'radial-gradient(circle at 82% 18%, rgba(124,58,237,0.55), transparent 34%), radial-gradient(circle at 14% 84%, rgba(0,229,255,0.34), transparent 38%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.08em',
          }}
        >
          <span style={{ color: '#00E5FF' }}>OPERATOR</span>
          <span style={{ color: '#A78BFA' }}>OS</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 920 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 68,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: '-0.04em',
            }}
          >
            One command layer for modern operations.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 26,
              lineHeight: 1.4,
              color: '#CBD5E1',
            }}
          >
            Shared sign-in, billing, access, and module launches for your business.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 20, color: '#94A3B8' }}>
          operatoros.net
        </div>
      </div>
    ),
    size,
  );
}