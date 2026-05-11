'use client';

/**
 * Task #69 — real first-screen for StudyForge AI.
 *
 * Drop-in source → study plan generator. The user pastes any study
 * material; we extract sentences locally and turn them into a tutored
 * recall session (flashcards + a starter quiz). No AI backend call yet
 * — the local generator is honest and good enough to demo the loop.
 */

import React, { useMemo, useState } from 'react';
import { GraduationCap, Sparkles, RotateCcw, Eye, EyeOff } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';

interface Card { id: string; question: string; answer: string }

const SAMPLE = `The mitochondrion is the powerhouse of the cell, generating ATP through oxidative phosphorylation. \
Photosynthesis converts light energy into chemical energy stored in glucose. \
Newton's second law states that force equals mass times acceleration. \
Binary search runs in O(log n) time on a sorted array.`;

function buildCards(source: string): Card[] {
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
  return sentences.slice(0, 6).map((sentence, idx) => {
    const subject = sentence.split(/\s+/).slice(0, 3).join(' ').replace(/[.,!?]+$/, '');
    return {
      id: `card_${idx}`,
      question: `What does the source say about ${subject}?`,
      answer: sentence,
    };
  });
}

export default function StudyForgeShell({ baseUrl }: { baseUrl?: string }) {
  const [source, setSource] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);

  const wordCount = useMemo(() => source.trim().split(/\s+/).filter(Boolean).length, [source]);

  function generate() {
    const next = buildCards(source.trim());
    setCards(next);
    setRevealed(new Set());
    setGenerated(true);
  }

  function reset() {
    setCards([]);
    setRevealed(new Set());
    setGenerated(false);
    setSource('');
  }

  function toggle(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          <button
            type="button"
            data-testid="button-studyforge-generate"
            onClick={generate}
            disabled={wordCount < 8}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: radius.sm, border: 'none',
              background: wordCount < 8 ? 'rgba(139,148,158,0.18)' : semantic.accent,
              color: wordCount < 8 ? semantic.textMuted : '#fff',
              cursor: wordCount < 8 ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: fontSize.body,
            }}
          >
            <Sparkles size={14} /> Generate study session
          </button>
          {generated && (
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
              <RotateCcw size={14} /> Reset
            </button>
          )}
          <span data-testid="text-studyforge-wordcount" style={{ marginLeft: 'auto', color: semantic.textMuted, fontSize: fontSize.sm }}>
            {wordCount} words {wordCount < 8 && '— add a few more to start'}
          </span>
        </div>
      </div>

      {generated && (
        <section style={{ marginTop: space.xl }}>
          <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
            Recall session
            <span style={{ marginLeft: 8, color: semantic.textMuted, fontSize: fontSize.sm, fontWeight: 400 }}>
              ({cards.length} cards)
            </span>
          </h2>
          {cards.length === 0 ? (
            <div data-testid="text-studyforge-no-cards" style={{ ...cardStyle, color: semantic.textMuted }}>
              The source was too short to extract distinct ideas. Add a few more sentences and try again.
            </div>
          ) : (
            <ul data-testid="list-studyforge-cards" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
              {cards.map((c) => {
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
    </div>
  );
}
