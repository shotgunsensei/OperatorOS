'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { brand } from '@/lib/brand';
import { marketingPricingFaqs, type MarketingPricingFaq } from '@/lib/marketing-pricing';

/**
 * PricingFaq — accessible accordion of the most common pricing questions.
 *
 * Uses native <details>/<summary> so:
 *   - keyboard, screen-reader, and reduced-motion support come for free,
 *   - the section is still scannable with JavaScript disabled,
 *   - each question is independently expandable without managing state.
 *
 * Styling sticks to the Phase 3 brand tokens (`brand.*`) so the block
 * reads as part of the same surface as the tier grid and add-on table.
 */
export default function PricingFaq({
  testId = 'marketing-pricing-faq',
}: { testId?: string } = {}) {
  return (
    <section
      data-testid={testId}
      aria-labelledby="pricing-faq-heading"
      style={{
        padding: '24px 24px 88px',
        maxWidth: 880,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 32 }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: brand.accentCyan,
          margin: '0 0 10px',
        }}>
          Frequently asked
        </p>
        <h2
          id="pricing-faq-heading"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(24px, 3.4vw, 32px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          Answers before you have to ask.
        </h2>
        <p style={{
          fontSize: 15,
          lineHeight: 1.55,
          color: brand.textSecondary,
          maxWidth: 560,
          margin: '0 auto',
        }}>
          The questions our team hears most often about seats, billing, and
          how OperatorOS treats your data.
        </p>
      </header>

      <style>{`
        .faq-item {
          border: 1px solid ${brand.borderSoft};
          border-radius: 12px;
          background: ${brand.bgSecondary};
          overflow: hidden;
          transition: border-color 200ms ease;
        }
        .faq-item + .faq-item { margin-top: 10px; }
        .faq-item[open] { border-color: ${brand.borderStrong}; }
        .faq-summary {
          list-style: none;
          cursor: pointer;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          font-size: 15px;
          font-weight: 600;
          color: ${brand.textPrimary};
        }
        .faq-summary::-webkit-details-marker { display: none; }
        .faq-summary:focus-visible {
          outline: 2px solid ${brand.accentCyan};
          outline-offset: -2px;
          border-radius: 12px;
        }
        .faq-chevron {
          flex-shrink: 0;
          color: ${brand.textMuted};
          transition: transform 200ms ease;
        }
        .faq-item[open] .faq-chevron { transform: rotate(180deg); }
        .faq-answer {
          padding: 0 20px 20px;
          color: ${brand.textSecondary};
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .faq-item, .faq-chevron { transition: none; }
        }
      `}</style>

      <div role="list">
        {marketingPricingFaqs.map((faq) => (
          <FaqItem key={faq.slug} faq={faq} />
        ))}
      </div>

      <p style={{
        marginTop: 24,
        textAlign: 'center',
        fontSize: 13,
        color: brand.textMuted,
      }}>
        Still unsure? Sign in and reach the team from the in-app help menu.
      </p>
    </section>
  );
}

function FaqItem({ faq }: { faq: MarketingPricingFaq }) {
  const answerId = `faq-answer-${faq.slug}`;
  return (
    <details
      className="faq-item"
      data-testid={`faq-item-${faq.slug}`}
      role="listitem"
    >
      <summary
        className="faq-summary"
        data-testid={`faq-question-${faq.slug}`}
        aria-controls={answerId}
      >
        <span>{faq.question}</span>
        <ChevronDown className="faq-chevron" size={18} aria-hidden />
      </summary>
      <p
        id={answerId}
        className="faq-answer"
        data-testid={`faq-answer-${faq.slug}`}
      >
        {faq.answer}
      </p>
    </details>
  );
}
