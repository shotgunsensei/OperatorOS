'use client';

/**
 * Task #72 — first-screen for StudyForge AI, backed by the API.
 *
 * Submitting a source POSTs to `/v1/modules/studyforge-ai/sessions`,
 * which extracts cards server-side and persists the session per-tenant.
 * Past sessions are listed below the generator and can be re-opened or
 * deleted.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Sparkles, RotateCcw, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';
import { moduleShellApi } from '@/lib/auth';

interface Card { id: string; question: string; answer: string }
interface StudySession {
  id: string;
  source: string;
  cards: Card[];
  createdAt: string;
}

const SAMPLE = `The mitochondrion is the powerhouse of the cell, generating ATP through oxidative phosphorylation. \
Photosynthesis converts light energy into chemical energy stored in glucose. \
Newton's second law states that force equals mass times acceleration. \
Binary search runs in O(log n) time on a sorted array.`;

export default function StudyForgeShell({ baseUrl }: { baseUrl?: string }) {
  const [source, setSource] = useState('');
  const [active, setActive] = useState<StudySession | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = useMemo(() => source.trim().split(/\s+/).filter(Boolean).length, [source]);

  useEffect(() => {
    let cancelled = false;
    moduleShellApi.studyforge.list()
      .then((res: any) => {
        if (cancelled) return;
        const sessions: StudySession[] = res.sessions ?? [];
        setHistory(sessions);
        if (sessions[0]) {
          setActive(sessions[0]);
        }
      })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load sessions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function generate() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const session: StudySession = await moduleShellApi.studyforge.create(source);
      setActive(session);
      setRevealed(new Set());
      setHistory((prev) => [session, ...prev].slice(0, 20));
      setSource('');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('SOURCE_TOO_SHORT')) {
        setError('Add at least 8 words of source material to generate cards.');
      } else if (msg.includes('NO_CARDS')) {
        setError('Could not extract distinct ideas — add a few more sentences.');
      } else {
        setError(msg || 'Could not generate study session');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setActive(null);
    setRevealed(new Set());
    setSource('');
  }

  async function removeSession(id: string) {
    try {
      await moduleShellApi.studyforge.delete(id);
      setHistory((prev) => prev.filter((s) => s.id !== id));
      if (active?.id === id) {
        setActive(null);
        setRevealed(new Set());
      }
    } catch (err: any) {
      setError(err?.message || 'Could not delete session');
    }
  }

  function toggle(cardId: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
  }

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
            Paste any source material to generate an active-recall study session.
          </p>
        </div>
        <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-studyforge-ai" label="Open the full workspace" />
      </header>

      <div style={{ ...cardStyle, display: 'grid', gap: space.md }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff' }}>
            Your source material
          </h2>
          <button
            type="button"
            data-testid="button-studyforge-load-sample"
            onClick={() => setSource(SAMPLE)}
            style={{
              padding: '4px 10px', borderRadius: radius.sm,
              border: `1px solid ${semantic.border}`, background: 'transparent',
              color: semantic.textMuted, cursor: 'pointer', fontSize: fontSize.sm,
            }}
          >
            Load sample
          </button>
        </div>
        <textarea
          data-testid="textarea-studyforge-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={6}
          placeholder="Paste lecture notes, an article, a transcript — anything you want to study."
          style={{
            background: semantic.bg,
            color: semantic.text,
            border: `1px solid ${semantic.border}`,
            borderRadius: radius.sm,
            padding: '10px 12px',
            fontSize: fontSize.body,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        {error && (
          <div data-testid="text-studyforge-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          <button
            type="button"
            data-testid="button-studyforge-generate"
            onClick={generate}
            disabled={wordCount < 8 || submitting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: radius.sm, border: 'none',
              background: wordCount < 8 || submitting ? 'rgba(139,148,158,0.18)' : semantic.accent,
              color: wordCount < 8 || submitting ? semantic.textMuted : '#fff',
              cursor: wordCount < 8 || submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: fontSize.body,
            }}
          >
            <Sparkles size={14} /> {submitting ? 'Generating…' : 'Generate study session'}
          </button>
          {active && (
            <button
              type="button"
              data-testid="button-studyforge-reset"
              onClick={reset}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: radius.sm,
                border: `1px solid ${semantic.border}`, background: 'transparent',
                color: semantic.textMuted, cursor: 'pointer', fontSize: fontSize.sm,
              }}
            >
              <RotateCcw size={14} /> Clear current
            </button>
          )}
          <span data-testid="text-studyforge-wordcount" style={{ marginLeft: 'auto', color: semantic.textMuted, fontSize: fontSize.sm }}>
            {wordCount} words {wordCount < 8 && '— add a few more to start'}
          </span>
        </div>
      </div>

      {active && (
        <section style={{ marginTop: space.xl }}>
          <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
            Recall session
            <span style={{ marginLeft: 8, color: semantic.textMuted, fontSize: fontSize.sm, fontWeight: 400 }}>
              ({active.cards.length} cards)
            </span>
          </h2>
          {active.cards.length === 0 ? (
            <div data-testid="text-studyforge-no-cards" style={{ ...cardStyle, color: semantic.textMuted }}>
              The source was too short to extract distinct ideas. Add a few more sentences and try again.
            </div>
          ) : (
            <ul data-testid="list-studyforge-cards" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
              {active.cards.map((c) => {
                const open = revealed.has(c.id);
                return (
                  <li key={c.id} data-testid={`card-studyforge-${c.id}`} style={{ ...cardStyle }}>
                    <div style={{ color: '#fff', fontWeight: 600 }}>{c.question}</div>
                    {open ? (
                      <p
                        data-testid={`text-studyforge-answer-${c.id}`}
                        style={{ margin: `${space.sm}px 0 0`, color: semantic.text, fontSize: fontSize.body }}
                      >
                        {c.answer}
                      </p>
                    ) : (
                      <p style={{ margin: `${space.sm}px 0 0`, color: semantic.textMuted, fontSize: fontSize.sm, fontStyle: 'italic' }}>
                        Try to recall the answer before revealing it.
                      </p>
                    )}
                    <button
                      type="button"
                      data-testid={`button-studyforge-toggle-${c.id}`}
                      onClick={() => toggle(c.id)}
                      style={{
                        marginTop: space.sm,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: radius.sm,
                        border: `1px solid ${semantic.border}`, background: 'transparent',
                        color: semantic.text, cursor: 'pointer', fontSize: fontSize.sm,
                      }}
                    >
                      {open ? (<><EyeOff size={14} /> Hide answer</>) : (<><Eye size={14} /> Reveal answer</>)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section style={{ marginTop: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          Past sessions
        </h2>
        {loading ? (
          <div data-testid="text-studyforge-loading" style={{ ...cardStyle, color: semantic.textMuted }}>
            Loading sessions…
          </div>
        ) : history.length === 0 ? (
          <div data-testid="text-studyforge-history-empty" style={{ ...cardStyle, color: semantic.textMuted }}>
            Generate a session above and it will appear here.
          </div>
        ) : (
          <ul data-testid="list-studyforge-history" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
            {history.map((s) => (
              <li key={s.id} data-testid={`row-studyforge-history-${s.id}`} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  data-testid={`button-studyforge-open-${s.id}`}
                  onClick={() => { setActive(s); setRevealed(new Set()); }}
                  style={{
                    flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
                    color: '#fff', cursor: 'pointer', padding: 0, fontSize: fontSize.body, fontWeight: 600,
                  }}
                >
                  {s.cards.length} cards
                  <span style={{ marginLeft: 8, color: semantic.textMuted, fontWeight: 400, fontSize: fontSize.sm }}>
                    {s.source.slice(0, 80)}{s.source.length > 80 ? '…' : ''}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid={`button-studyforge-delete-${s.id}`}
                  onClick={() => removeSession(s.id)}
                  aria-label="Delete session"
                  style={{
                    padding: '6px 10px', borderRadius: radius.sm,
                    border: `1px solid ${semantic.border}`, background: 'transparent',
                    color: semantic.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: fontSize.sm,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
