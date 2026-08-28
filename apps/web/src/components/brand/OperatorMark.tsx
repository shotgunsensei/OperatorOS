'use client';

import React from 'react';
import Image from 'next/image';
import { OPERATOROS_ASSET_SIZE, OPERATOROS_MARK_PATH } from '@/lib/brand-assets';

interface OperatorMarkProps {
  size?: number;
  ringColor?: string;
  nodeColor?: string;
  chevronColor?: string;
  glow?: boolean;
  title?: string;
  decorative?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * OperatorMark — the official emblem extracted from the supplied OperatorOS
 * logo. It intentionally contains no wordmark or domain text so it remains
 * legible in favicons, badges, loaders, collapsed navigation, and app chrome.
 */
export default function OperatorMark(props: OperatorMarkProps) {
  const {
    size = 32,
    glow = false,
    title = 'OperatorOS',
    decorative = false,
    className,
    style,
  } = props;

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      className={className}
      data-brand-asset="operatoros-mark"
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: glow
          ? 'var(--brand-mark-drop-shadow, drop-shadow(0 0 12px rgba(0, 200, 255, 0.55)))'
          : undefined,
        ...style,
      }}
    >
      <Image
        src={OPERATOROS_MARK_PATH}
        alt=""
        aria-hidden="true"
        width={OPERATOROS_ASSET_SIZE}
        height={OPERATOROS_ASSET_SIZE}
        sizes={`${size}px`}
        draggable={false}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
}
