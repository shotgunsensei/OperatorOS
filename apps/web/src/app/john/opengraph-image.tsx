import React from 'react';
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'John Williams — systems engineering, automation and applied AI';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px', background: '#0b1e2d', color: '#ffffff' }}>
      <div style={{ fontSize: 22, color: '#9cebd7', letterSpacing: 3, display: 'flex', marginBottom: 30 }}>SYSTEMS · AUTOMATION · APPLIED AI</div>
      <div style={{ fontSize: 86, fontWeight: 700, letterSpacing: -4, display: 'flex' }}>John Williams.</div>
      <div style={{ fontSize: 33, color: '#d0dfe8', marginTop: 25, display: 'flex' }}>Systems experience. An engineer’s approach to AI.</div>
      <div style={{ fontSize: 23, color: '#9cebd7', marginTop: 60, display: 'flex' }}>Selected work · Career experience · Verified evidence</div>
      <div style={{ fontSize: 21, color: '#a9bdca', marginTop: 18, display: 'flex' }}>operatoros.net/john</div>
    </div>, size,
  );
}
