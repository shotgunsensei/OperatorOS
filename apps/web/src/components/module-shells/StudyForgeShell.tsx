'use client';

import React from 'react';
import { GraduationCap, BookOpen, Sparkles } from 'lucide-react';
import { semantic, space, fontSize, cardStyle } from '@/lib/design-tokens';
import { ShellLiveBadge, ShellMvpNotice, ShellLaunchButton } from './ShellChrome';

export default function StudyForgeShell({ baseUrl }: { baseUrl?: string }) {
  return (
    <div style={{ padding: space.xxl, maxWidth: 960, margin: '0 auto' }} data-testid="shell-studyforge-ai">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
        <GraduationCap size={28} color={semantic.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>StudyForge AI</h1>
            <ShellLiveBadge />
          </div>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Your AI study & training partner — turn any document into a tutored learning loop.
          </p>
        </div>
      </header>
      <ShellMvpNotice />


      <div style={{ display: 'grid', gap: space.lg, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <FeatureCard
          icon={<BookOpen size={18} color={semantic.accent} />}
          title="Drop in any source"
          body="PDFs, transcripts, course notes — StudyForge digests them into a study plan."
        />
        <FeatureCard
          icon={<Sparkles size={18} color={semantic.accent} />}
          title="Active recall sessions"
          body="Spaced flashcards + Socratic prompts adapt to what you keep getting wrong."
        />
        <FeatureCard
          icon={<GraduationCap size={18} color={semantic.accent} />}
          title="Mastery tracking"
          body="See concept-level mastery percentages; drill the weak spots first."
        />
      </div>

      <div style={{ marginTop: space.xl }}>
        <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-studyforge-ai" label="Start a study session" />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {icon}
        <h3 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>{title}</h3>
      </div>
      <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, margin: 0 }}>{body}</p>
    </div>
  );
}
