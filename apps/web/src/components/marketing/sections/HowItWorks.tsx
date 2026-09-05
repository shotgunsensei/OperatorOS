'use client';

import React from 'react';
import { brand } from '@/lib/brand';

interface Step {
  cmd: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    cmd: '1 · Sign in',
    title: 'Sign in once.',
    body: 'One account, one organization, every application. Your role and access follow you everywhere.',
  },
  {
    cmd: '2 · Choose applications',
    title: 'Choose your applications.',
    body: 'Add the business tools your team actually needs, with plan and access managed in one place.',
  },
  {
    cmd: '3 · Connect your tools',
    title: 'Connect your workflows.',
    body: 'Wire in the calls, calendars, payments, and tools that already power your day.',
  },
  {
    cmd: '4 · Run the day',
    title: 'Run the day from one home base.',
    body: 'See your applications, priorities, team access, and next actions without hunting across disconnected accounts.',
  },
];

/**
 * How OperatorOS Works — a 4-step horizontal timeline that collapses
 * vertically on mobile. Each step is labelled with a command-line
 * style header so the page feels like the operator console it sells.
 */
export default function HowItWorks() {
  return (
    <section
      data-testid="marketing-how-it-works"
      style={{
        padding: '64px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .operatoros-howitworks-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(4, 1fr);
        }
        @media (max-width: 900px) {
          .operatoros-howitworks-grid { grid-template-columns: 1fr; }
        }
      `}} />
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2
          data-testid="how-it-works-title"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          How OperatorOS works.
        </h2>
        <p style={{ fontSize: 16, color: brand.textSecondary, margin: 0 }}>
          Four steps to one connected home base for your whole operation.
        </p>
      </div>
      <ol
        className="operatoros-howitworks-grid"
        style={{ listStyle: 'none', padding: 0, margin: 0 }}
      >
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            data-testid={`how-it-works-step-${i + 1}`}
            style={{
              padding: 22,
              borderRadius: 14,
              background: brand.bgElevated,
              border: `1px solid ${brand.borderSoft}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              position: 'relative',
            }}
          >
            <span
              style={{
                fontFamily: brand.fontDisplay,
                fontSize: 12,
                fontWeight: 700,
                color: brand.accentCyan,
                letterSpacing: '0.08em',
              }}
            >
              STEP {String(i + 1).padStart(2, '0')}
            </span>
            <code
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                color: brand.textMuted,
                padding: '6px 8px',
                borderRadius: 6,
                background: brand.bgSecondary,
                border: `1px solid ${brand.borderSoft}`,
                alignSelf: 'flex-start',
              }}
            >
              {step.cmd}
            </code>
            <h3
              style={{
                fontFamily: brand.fontDisplay,
                fontSize: 17,
                fontWeight: 600,
                color: brand.textPrimary,
                margin: 0,
              }}
            >
              {step.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
