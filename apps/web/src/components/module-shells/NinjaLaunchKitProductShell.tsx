'use client';

import React, { useState } from 'react';
import { ClipboardCheck, Rocket } from 'lucide-react';
import { semantic, space } from '@/lib/design-tokens';
import NinjaLaunchKitCompleteWorkspace from './NinjaLaunchKitCompleteWorkspace';
import NinjaLaunchKitShell from './NinjaLaunchKitShell';

type ProductMode = 'kits' | 'execution';

function initialMode(routePath?: string): ProductMode {
  if (!routePath) return 'kits';
  return /^\/(?:launches|plan|artifacts|readiness)(?:\/|$)/.test(routePath) ? 'execution' : 'kits';
}

/**
 * Phase 34's complete launch-kit SaaS and the earlier persisted launch
 * execution/readiness workspace are separate, valid product outcomes. Keep
 * both reachable instead of allowing one restoration phase to retire the
 * other. Deep links select the owning workflow; users can switch explicitly.
 */
export default function NinjaLaunchKitProductShell({
  baseUrl,
  routePath,
}: {
  baseUrl?: string;
  routePath?: string;
}) {
  const [mode, setMode] = useState<ProductMode>(() => initialMode(routePath));

  return (
    <div style={{ minHeight: '100vh', background: '#050506', colorScheme: 'dark' }}>
      <nav
        aria-label="Ninja Launch Kit product mode"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 25,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          padding: `${space.md}px clamp(16px,4vw,34px)`,
          background: 'rgba(5,5,6,.94)',
          borderBottom: `1px solid ${semantic.border}`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <button
          type="button"
          aria-current={mode === 'kits' ? 'page' : undefined}
          onClick={() => setMode('kits')}
          style={modeButton(mode === 'kits')}
        >
          <Rocket size={15} /> Complete kits
        </button>
        <button
          type="button"
          aria-current={mode === 'execution' ? 'page' : undefined}
          onClick={() => setMode('execution')}
          style={modeButton(mode === 'execution')}
        >
          <ClipboardCheck size={15} /> Execution workspaces
        </button>
      </nav>
      {mode === 'kits' ? (
        <NinjaLaunchKitCompleteWorkspace baseUrl={baseUrl} routePath={routePath} />
      ) : (
        <NinjaLaunchKitShell baseUrl={baseUrl} />
      )}
    </div>
  );
}

function modeButton(active: boolean): React.CSSProperties {
  return {
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '9px 14px',
    borderRadius: 8,
    border: `1px solid ${active ? '#ef4444' : semantic.border}`,
    background: active ? 'rgba(153,27,27,.35)' : '#111114',
    color: active ? '#fff' : semantic.textMuted,
    font: 'inherit',
    fontWeight: 800,
    cursor: 'pointer',
  };
}
