import { ImageResponse } from 'next/og';
import { SOCIAL_IMAGE_ALT } from '@/lib/seo';

const SOCIAL_OPERATOR_MARK = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <defs>
      <linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#8799af"/></linearGradient>
      <linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#20e1ff"/><stop offset=".55" stop-color="#078bff"/><stop offset="1" stop-color="#1745e8"/></linearGradient>
    </defs>
    <rect width="128" height="128" rx="27" fill="#020612"/>
    <circle cx="64" cy="64" r="53" fill="none" stroke="url(#b)" stroke-width="3" stroke-dasharray="24 4"/>
    <path d="M64 18V34M87 24L79 38M104 41L90 49M110 64H94M104 87L90 79M87 104L79 90M64 110V94M41 104L49 90M24 87L38 79M18 64H34M24 41L38 49M41 24L49 38" stroke="#08b7ff" stroke-width="3"/>
    <g fill="#eaf8ff" stroke="#08aaff" stroke-width="3">
      <circle cx="64" cy="16" r="4"/><circle cx="88" cy="22" r="4"/><circle cx="106" cy="40" r="4"/><circle cx="112" cy="64" r="4"/><circle cx="106" cy="88" r="4"/><circle cx="88" cy="106" r="4"/><circle cx="64" cy="112" r="4"/><circle cx="40" cy="106" r="4"/><circle cx="22" cy="88" r="4"/><circle cx="16" cy="64" r="4"/><circle cx="22" cy="40" r="4"/><circle cx="40" cy="22" r="4"/>
    </g>
    <circle cx="64" cy="64" r="27" fill="none" stroke="url(#m)" stroke-width="15" stroke-dasharray="78 7"/>
    <circle cx="64" cy="64" r="18" fill="#03102a" stroke="#00d8ff" stroke-width="4"/>
  </svg>
`)}`;

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
            'radial-gradient(circle at 82% 18%, rgba(23,69,232,0.58), transparent 34%), radial-gradient(circle at 14% 84%, rgba(0,200,255,0.34), transparent 38%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <img
            src={SOCIAL_OPERATOR_MARK}
            alt="OperatorOS emblem"
            width="184"
            height="184"
            style={{ display: 'flex', width: 184, height: 184, objectFit: 'contain', borderRadius: 28 }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 34, fontWeight: 850, letterSpacing: '-0.04em' }}>
            <span style={{ color: '#EAF0F7' }}>Operator</span><span style={{ color: '#078BFF' }}>OS</span><span style={{ color: '#91A3BA', fontSize: 20, marginLeft: 12 }}>.net</span>
          </div>
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
            One home base for modern business operations.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: 25,
              lineHeight: 1.4,
              color: '#CBD5E1',
            }}
          >
            Shared sign-in, billing, access, and module launches for your business.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 20, color: '#75CFFF' }}>
          One secure entry. Every approved operation.
        </div>
      </div>
    ),
    size,
  );
}
