'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, ArrowLeft, AlertTriangle } from 'lucide-react';
import { semantic, space, fontSize, radius, cardStyle } from '@/lib/design-tokens';
import { meApi } from '@/lib/auth';
import StudyForgeShell from '@/components/module-shells/StudyForgeShell';
import NinjaLaunchKitShell from '@/components/module-shells/NinjaLaunchKitShell';
import CallCommandShell from '@/components/module-shells/CallCommandShell';
import NinjamationShell from '@/components/module-shells/NinjamationShell';

interface MeModule {
  slug: string;
  name: string;
  description?: string;
  baseUrl?: string | null;
  status?: string;
  hasAccess?: boolean;
}

const POLISHED_SHELLS: Record<string, React.ComponentType<{ baseUrl?: string }>> = {
  'studyforge-ai':    StudyForgeShell,
  'ninja-launch-kit': NinjaLaunchKitShell,
  'callcommand-ai':   CallCommandShell,
  'ninjamation':      NinjamationShell,
};

export default function InternalAppPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [mod, setMod] = useState<MeModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!slug) return;
      try {
        const res: any = await (meApi as any).modules?.();
        const list: MeModule[] = res?.modules ?? res?.items ?? [];
        const found = list.find(m => m.slug === slug) ?? null;
        if (alive) setMod(found);
      } catch (e: any) {
        if (alive) setErr(e?.error || 'Failed to load module');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (!slug) return null;

  if (loading) {
    return (
      <div style={{ padding: space.xxl, color: semantic.textMuted }} data-testid="app-shell-loading">
        Loading {slug}\u2026
      </div>
    );
  }

  if (err || !mod) {
    return (
      <div style={{ padding: space.xxl, maxWidth: 720, margin: '0 auto' }}>
        <BackLink />
        <div
          data-testid="app-shell-not-accessible"
          style={{
            ...cardStyle,
            borderColor: semantic.accentDanger,
            background: `${semantic.accentDanger}15`,
            display: 'flex', alignItems: 'center', gap: space.md,
          }}
        >
          <AlertTriangle size={18} color={semantic.accentDanger} />
          <div>
            <div style={{ color: semantic.accentDanger, fontWeight: 600 }}>
              {err ? 'Could not load this module' : `${slug} is not enabled for your tenant`}
            </div>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>
              {err ?? 'Visit the App Marketplace to request access or upgrade your plan.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const Shell = POLISHED_SHELLS[mod.slug];
  if (Shell) {
    return (
      <div>
        <div style={{ padding: `${space.lg}px ${space.xxl}px 0` }}>
          <BackLink />
        </div>
        <Shell baseUrl={mod.baseUrl ?? undefined} />
      </div>
    );
  }

  // Generic launcher card for the remaining 7 external modules.
  const isExternal = mod.baseUrl && /^https?:\/\//i.test(mod.baseUrl);
  return (
    <div style={{ padding: space.xxl, maxWidth: 720, margin: '0 auto' }} data-testid={`app-shell-${mod.slug}`}>
      <BackLink />
      <div style={{ ...cardStyle }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>{mod.name}</h1>
        {mod.description && (
          <p style={{ color: semantic.textMuted, margin: `${space.sm}px 0 0`, fontSize: fontSize.body }}>
            {mod.description}
          </p>
        )}
        <div style={{ marginTop: space.lg, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isExternal ? (
            <a
              href={mod.baseUrl!}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`link-launch-${mod.slug}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: radius.sm,
                background: semantic.accent, color: '#fff', textDecoration: 'none',
                fontWeight: 600, fontSize: fontSize.body,
              }}
            >
              Launch {mod.name} <ExternalLink size={14} />
            </a>
          ) : (
            <span
              data-testid={`text-no-baseurl-${mod.slug}`}
              style={{ color: semantic.textMuted, fontSize: fontSize.sm }}
            >
              No external URL configured for this module yet.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      data-testid="link-back-to-apps"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: semantic.textMuted, textDecoration: 'none',
        fontSize: fontSize.sm, marginBottom: space.md,
      }}
    >
      <ArrowLeft size={14} /> Back to My Apps
    </Link>
  );
}
