'use client';

import React from 'react';
import { brand } from '@/lib/brand';
import OperatorMark from '../../brand/OperatorMark';
import { MARKETING_MODULES } from '@/lib/marketing-catalog';

/**
 * Command Orbit — the OperatorOS core surrounded by every module
 * orbiting it. Two rings keep the layout readable when all 11 modules
 * are visible:
 *
 *   - Inner ring (first 5 modules, ord 1..5)  — radius 38%
 *   - Outer ring (modules 6..11)              — radius 56%
 *
 * Pure SVG + CSS animation. `prefers-reduced-motion: reduce` freezes
 * the orbit and keeps the static composition, so visitors with motion
 * sensitivity still get a meaningful "everything connects to the
 * core" visual.
 */
export default function CommandOrbit() {
  const modules = MARKETING_MODULES;
  const inner = modules.slice(0, 5);
  const outer = modules.slice(5);

  return (
    <section
      data-testid="marketing-orbit"
      aria-label="OperatorOS module orbit"
      style={{
        position: 'relative',
        padding: '48px 24px 64px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes operatoros-orbit-spin-cw  { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
        @keyframes operatoros-orbit-spin-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes operatoros-orbit-counter-cw  { from { transform: rotate(0deg); }   to { transform: rotate(-360deg); } }
        @keyframes operatoros-orbit-counter-ccw { from { transform: rotate(-360deg); } to { transform: rotate(0deg); } }
        .operatoros-orbit-ring-inner { animation: operatoros-orbit-spin-cw 60s linear infinite; }
        .operatoros-orbit-ring-outer { animation: operatoros-orbit-spin-ccw 90s linear infinite; }
        /* Counter-rotate the labels so they stay upright as the rings spin. */
        .operatoros-orbit-node-inner { animation: operatoros-orbit-counter-cw 60s linear infinite; }
        .operatoros-orbit-node-outer { animation: operatoros-orbit-counter-ccw 90s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-orbit-ring-inner,
          .operatoros-orbit-ring-outer,
          .operatoros-orbit-node-inner,
          .operatoros-orbit-node-outer { animation: none !important; }
        }
        @media (max-width: 640px) {
          .operatoros-orbit-canvas { width: 320px !important; height: 320px !important; }
          .operatoros-orbit-node    { font-size: 10px !important; padding: 4px 8px !important; }
        }
      `}} />

      <div
        className="operatoros-orbit-canvas"
        data-testid="orbit-canvas"
        style={{
          position: 'relative',
          width: 'min(560px, 92vw)',
          height: 'min(560px, 92vw)',
          margin: '0 auto',
        }}
      >
        {/* Concentric guide rings */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: '22%',
            borderRadius: '50%',
            border: `1px dashed ${brand.borderSoft}`,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: '4%',
            borderRadius: '50%',
            border: `1px dashed ${brand.borderSoft}`,
          }}
        />

        {/* Core OperatorOS mark */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '22%', height: '22%',
            borderRadius: '50%',
            background: brand.markBgFill,
            border: `1px solid ${brand.borderStrong}`,
            boxShadow: brand.ctaGlowLarge,
          }}
          data-testid="orbit-core"
        >
          <OperatorMark size={64} />
        </div>

        <OrbitRing modules={inner} radiusPct={38} ringClass="operatoros-orbit-ring-inner" nodeClass="operatoros-orbit-node-inner" testIdPrefix="orbit-node-inner" />
        <OrbitRing modules={outer} radiusPct={50} ringClass="operatoros-orbit-ring-outer" nodeClass="operatoros-orbit-node-outer" testIdPrefix="orbit-node-outer" />
      </div>
    </section>
  );
}

function OrbitRing({
  modules,
  radiusPct,
  ringClass,
  nodeClass,
  testIdPrefix,
}: {
  modules: typeof MARKETING_MODULES;
  radiusPct: number;
  ringClass: string;
  nodeClass: string;
  testIdPrefix: string;
}) {
  return (
    <div
      className={ringClass}
      style={{
        position: 'absolute',
        inset: 0,
        transformOrigin: '50% 50%',
      }}
    >
      {modules.map((m, i) => {
        const angle = (360 / modules.length) * i;
        return (
          <div
            key={m.slug}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `rotate(${angle}deg) translate(${radiusPct}%) rotate(-${angle}deg)`,
              transformOrigin: '0 0',
            }}
          >
            <div
              className={`operatoros-orbit-node ${nodeClass}`}
              data-testid={`${testIdPrefix}-${m.slug}`}
              style={{
                transform: 'translate(-50%, -50%)',
                padding: '6px 12px',
                borderRadius: 999,
                background: brand.bgGlass,
                border: `1px solid ${brand.borderSoft}`,
                color: brand.textPrimary,
                fontFamily: brand.fontDisplay,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(8px)',
              }}
            >
              {m.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
