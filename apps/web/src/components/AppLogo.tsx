'use client';

import React, { useState } from 'react';
import { brand } from '@/lib/brand';
import { getAppLogoSrc, monogram } from '@/lib/app-logos';

/**
 * Per-app brand badge. Renders the real logo asset mapped to the app's
 * `iconKey` (see `lib/app-logos.ts`) and gracefully falls back to a
 * monogram of the app's initials when no asset is mapped or the image
 * fails to load. Used by the /apps catalog and any per-app surface so
 * the app's visual identity stays consistent everywhere.
 *
 * Keeps the stable `img-app-logo-<slug>` test id regardless of which
 * variant renders.
 */
export default function AppLogo({
  name,
  slug,
  iconKey,
  size = 44,
}: {
  name: string;
  slug: string;
  iconKey?: string | null;
  size?: number;
}) {
  const src = getAppLogoSrc(iconKey);
  const [failed, setFailed] = useState(false);
  const showLogo = !!src && !failed;

  const box: React.CSSProperties = {
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: Math.round(size / 4),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (showLogo) {
    return (
      <span
        aria-hidden="true"
        data-testid={`img-app-logo-${slug}`}
        style={{
          ...box,
          background: brand.bgGlass,
          border: `1px solid ${brand.borderSoft}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      data-testid={`img-app-logo-${slug}`}
      style={{
        ...box,
        fontFamily: brand.fontDisplay,
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        color: brand.accentInk,
        background: `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`,
      }}
    >
      {monogram(name)}
    </span>
  );
}
