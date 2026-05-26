'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight, ExternalLink, Download, Mail, Github, Linkedin, MapPin,
  Server, Shield, Wrench, HeartPulse, Network, Bot, Briefcase, FolderGit2,
  AlertTriangle, ScrollText, Compass, FileWarning,
} from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { brand } from '@/lib/brand';
import {
  PERSON, HERO_CTAS, KEY_METRICS, OPERATING_PRINCIPLES, SPECIALIZATIONS,
  PROJECTS, CASE_STUDIES, RESUME_VARIANTS, AVAILABLE_FOR,
} from './portfolio-content';

/**
 * John Travis Williams Jr. portfolio — Task #113 + refinement pass.
 *
 * Hidden technical-authority page reachable at /portfolio and /john.
 * Reuses MarketingLayout so the public navbar + footer chrome stays
 * consistent with the rest of the marketing surface, but is excluded
 * from /robots.txt so the URL doesn't leak into search.
 *
 * All copy lives in `./portfolio-content.ts` — never edit JSX strings.
 *
 * Server-rendered routes pass `resumesAvailability` so the resume hub
 * shows a download button when the PDF exists on disk and a "Request
 * by email" fallback when it doesn't. This prevents the buttons from
 * ever serving a 404 in production.
 */

const SPEC_ICONS = [Server, Shield, Wrench, HeartPulse, Network, Bot];

export type ResumesAvailability = Record<string, boolean>;

interface PortfolioPageProps {
  /**
   * Map of resume PDF filename → whether the file exists in
   * apps/web/public/resumes/. Optional — when omitted, every resume
   * is treated as available (legacy callers / Storybook).
   */
  resumesAvailability?: ResumesAvailability;
}

// ─── Shared primitives ────────────────────────────────────────────

function SectionHeader({
  eyebrow, title, subtitle,
}: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 40px' }}>
      <p style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: brand.accentCyan, margin: '0 0 10px',
      }}>{eyebrow}</p>
      <h2 style={{
        fontFamily: brand.fontDisplay,
        fontSize: 'clamp(24px, 3.4vw, 36px)', fontWeight: 700,
        color: brand.textPrimary, margin: '0 0 12px', letterSpacing: '-0.02em',
        lineHeight: 1.15,
      }}>{title}</h2>
      {subtitle && (
        <p style={{ fontSize: 16, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Card({
  children, accent, testId,
}: { children: React.ReactNode; accent?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="portfolio-card"
      style={{
        position: 'relative',
        padding: 24,
        borderRadius: 16,
        background: brand.bgElevated,
        border: `1px solid ${brand.borderSoft}`,
        boxShadow: '0 1px 0 rgba(255,255,255,0.02) inset, 0 20px 40px -28px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'border-color 0.2s ease, transform 0.2s ease',
      }}
    >
      {accent && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(120% 80% at 0% 0%, ${accent} 0%, transparent 55%)`,
            opacity: 0.08,
          }}
        />
      )}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
        {children}
      </div>
    </div>
  );
}

function Pill({
  children, tone = 'neutral',
}: { children: React.ReactNode; tone?: 'neutral' | 'accent' }) {
  const isAccent = tone === 'accent';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
      background: isAccent ? 'rgba(0, 229, 255, 0.10)' : brand.bgGlass,
      color: isAccent ? brand.accentCyan : brand.textSecondary,
      border: `1px solid ${isAccent ? 'rgba(0, 229, 255, 0.28)' : brand.borderSoft}`,
    }}>
      {children}
    </span>
  );
}

function CtaButton({
  cta, large = false,
}: { cta: { label: string; href: string; variant: 'primary' | 'secondary'; external?: boolean }; large?: boolean }) {
  const isPrimary = cta.variant === 'primary';
  const common: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: large ? '12px 20px' : '10px 16px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: large ? 14 : 13,
    textDecoration: 'none',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease',
    cursor: 'pointer',
  };
  const primaryStyle: React.CSSProperties = {
    ...common,
    background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
    color: brand.accentInk, border: 'none',
    boxShadow: brand.ctaGlowSoft,
  };
  const secondaryStyle: React.CSSProperties = {
    ...common,
    background: 'transparent', color: brand.textPrimary,
    border: `1px solid ${brand.borderSoft}`,
  };

  const props = {
    href: cta.href,
    style: isPrimary ? primaryStyle : secondaryStyle,
    'data-testid': `cta-portfolio-${cta.label.toLowerCase().replace(/\s+/g, '-')}`,
    ...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
  } as const;

  if (cta.href.startsWith('#') || cta.external) {
    return (
      <a {...props}>
        {cta.label}
        {isPrimary ? <ArrowRight size={14} /> : cta.external ? <ExternalLink size={12} /> : null}
      </a>
    );
  }
  return (
    <Link {...props}>
      {cta.label}
      {isPrimary && <ArrowRight size={14} />}
    </Link>
  );
}

// ─── Sections ─────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      data-testid="portfolio-hero"
      style={{
        position: 'relative',
        padding: 'clamp(64px, 9vw, 96px) clamp(20px, 4vw, 24px) clamp(40px, 6vw, 56px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        textAlign: 'center',
        width: '100%',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: brand.heroRadial,
        }}
      />
      <div style={{ position: 'relative' }}>
        <Pill tone="accent">
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: 999,
            background: brand.accentGreen,
            boxShadow: `0 0 8px ${brand.accentGreen}`,
          }} />
          Available for new roles & consulting
        </Pill>

        <h1 style={{
          fontFamily: brand.fontDisplay,
          fontSize: 'clamp(32px, 6.4vw, 60px)', fontWeight: 800,
          color: brand.textPrimary, margin: '20px 0 14px',
          letterSpacing: '-0.025em', lineHeight: 1.05,
        }}>
          {PERSON.name}
        </h1>

        <p style={{
          fontFamily: brand.fontDisplay, fontSize: 'clamp(15px, 2.2vw, 18px)', fontWeight: 600,
          color: brand.textPrimary, margin: '0 0 10px',
        }}>
          {PERSON.title}
        </p>

        <p style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.10em',
          textTransform: 'uppercase', color: brand.accentCyan,
          margin: '0 0 20px',
        }}>
          {PERSON.positioning}
        </p>

        <p style={{
          fontSize: 'clamp(15px, 1.8vw, 17px)', lineHeight: 1.6, color: brand.textSecondary,
          maxWidth: 720, margin: '0 auto 14px',
        }}>
          {PERSON.heroCopy}
        </p>

        <p style={{
          fontSize: 13, color: brand.textMuted, margin: '0 0 28px',
          display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <MapPin size={13} /> {PERSON.location} · {PERSON.founder}
        </p>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
          marginBottom: 36,
        }}>
          {HERO_CTAS.map((cta) => (
            <CtaButton key={cta.label} cta={cta} large />
          ))}
        </div>

        {/* At-a-glance credibility strip — gives recruiters a 2-second
            read on seniority without scrolling. Responsive 2x2 → 4-up. */}
        <div
          data-testid="portfolio-metrics"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          {KEY_METRICS.map((m) => (
            <div
              key={m.label}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: brand.bgGlass,
                border: `1px solid ${brand.borderSoft}`,
                textAlign: 'center',
              }}
            >
              <p style={{
                fontFamily: brand.fontDisplay, fontWeight: 700,
                fontSize: 22, margin: '0 0 4px',
                background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent', color: 'transparent',
                letterSpacing: '-0.01em',
              }}>{m.value}</p>
              <p style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: brand.textMuted, margin: 0,
              }}>{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OperatingPrinciples() {
  return (
    <section
      data-testid="portfolio-principles"
      style={{
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 24px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <SectionHeader
        eyebrow="How I operate"
        title="Three principles, every engagement."
        subtitle="The shorthand for how I think about infrastructure, security, and team workflows."
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16,
      }}>
        {OPERATING_PRINCIPLES.map((p, idx) => (
          <Card key={p.title} accent={brand.accentCyan} testId={`card-principle-${idx}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(0, 229, 255, 0.10)',
                border: `1px solid rgba(0, 229, 255, 0.25)`,
                color: brand.accentCyan,
                flexShrink: 0,
              }}>
                <Compass size={18} />
              </div>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: brand.textMuted, margin: 0,
              }}>Principle {String(idx + 1).padStart(2, '0')}</p>
            </div>
            <h3 style={{
              fontFamily: brand.fontDisplay, fontSize: 18, fontWeight: 700,
              color: brand.textPrimary, margin: 0,
            }}>{p.title}</h3>
            <p style={{
              fontSize: 14, lineHeight: 1.6, color: brand.textSecondary, margin: 0,
            }}>{p.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function SpecializationsGrid() {
  return (
    <section
      id="specializations"
      data-testid="portfolio-specializations"
      style={{
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 24px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <SectionHeader
        eyebrow="Technical specializations"
        title="Where I operate every day"
        subtitle="Twenty-plus years of hands-on IT, organized into the six surfaces I'm hired for most often."
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {SPECIALIZATIONS.map((spec, idx) => {
          const Icon = SPEC_ICONS[idx] ?? Server;
          return (
            <Card key={spec.title} accent={brand.accentCyan} testId={`card-spec-${idx}`}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 44, borderRadius: 10,
                background: 'rgba(0, 229, 255, 0.10)',
                border: `1px solid rgba(0, 229, 255, 0.25)`,
                color: brand.accentCyan,
              }}>
                <Icon size={20} />
              </div>
              <div>
                <h3 style={{
                  fontFamily: brand.fontDisplay, fontSize: 18, fontWeight: 700,
                  color: brand.textPrimary, margin: '0 0 6px',
                }}>{spec.title}</h3>
                <p style={{ fontSize: 13, color: brand.textSecondary, margin: 0, lineHeight: 1.5 }}>
                  {spec.blurb}
                </p>
              </div>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 'auto 0 0',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {spec.bullets.map((b) => (
                  <li key={b} style={{
                    fontSize: 13, color: brand.textSecondary,
                    paddingLeft: 14, position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 8,
                      width: 4, height: 4, borderRadius: 999,
                      background: brand.accentCyan,
                    }} />
                    {b}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function ProjectsGrid() {
  return (
    <section
      id="projects"
      data-testid="portfolio-projects"
      style={{
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 24px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <SectionHeader
        eyebrow="Featured systems & product architecture"
        title="Operator-grade products I've designed and shipped"
        subtitle="Each project below is part of a connected ecosystem — operations, automation, healthcare, automotive, and creative tooling."
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {PROJECTS.map((p, idx) => (
          <Card key={p.name} accent={brand.accentViolet} testId={`card-project-${idx}`}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(124, 58, 237, 0.10)',
                border: `1px solid rgba(124, 58, 237, 0.25)`,
                color: brand.accentViolet,
              }}>
                <FolderGit2 size={18} />
              </div>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-project-${idx}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 12, fontWeight: 600,
                    color: brand.accentCyan, textDecoration: 'none',
                  }}
                >
                  Visit <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div>
              <h3 style={{
                fontFamily: brand.fontDisplay, fontSize: 19, fontWeight: 700,
                color: brand.textPrimary, margin: '0 0 4px',
              }}>{p.name}</h3>
              <p style={{ fontSize: 13, color: brand.textSecondary, margin: 0, lineHeight: 1.5 }}>
                {p.tagline}
              </p>
            </div>
            <ul style={{
              listStyle: 'none', padding: 0, margin: 'auto 0 0',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {p.bullets.map((b) => (
                <li key={b} style={{
                  fontSize: 13, color: brand.textSecondary,
                  paddingLeft: 14, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: 8,
                    width: 4, height: 4, borderRadius: 999,
                    background: brand.accentViolet,
                  }} />
                  {b}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}

function CaseStudies() {
  return (
    <section
      id="case-studies"
      data-testid="portfolio-case-studies"
      style={{
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 24px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <SectionHeader
        eyebrow="Operational case studies"
        title="Real problems, real responses, real outcomes"
        subtitle="A sample of the kinds of incidents and infrastructure work I handle as escalation-tier engineer."
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {CASE_STUDIES.map((cs, idx) => (
          <Card key={cs.title} accent={brand.accentAmber} testId={`card-case-${idx}`}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.10)',
              border: `1px solid rgba(245, 158, 11, 0.25)`,
              color: brand.accentAmber,
            }}>
              <AlertTriangle size={18} />
            </div>
            <h3 style={{
              fontFamily: brand.fontDisplay, fontSize: 18, fontWeight: 700,
              color: brand.textPrimary, margin: 0,
            }}>{cs.title}</h3>
            {[
              { label: 'Problem', body: cs.problem },
              { label: 'Actions', body: cs.actions },
              { label: 'Outcome', body: cs.outcome },
            ].map((row) => (
              <div key={row.label}>
                <p style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: brand.accentCyan,
                  margin: '0 0 4px',
                }}>{row.label}</p>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
                  {row.body}
                </p>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </section>
  );
}

function ResumeHub({ availability }: { availability: ResumesAvailability }) {
  return (
    <section
      id="resumes"
      data-testid="portfolio-resumes"
      style={{
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 24px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <SectionHeader
        eyebrow="Resume variants"
        title="Pick the version that matches your role"
        subtitle="Three resumes, each tailored to a different hiring lane. Click to download — recruiters welcome."
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {RESUME_VARIANTS.map((r, idx) => {
          // Default to available when the prop is omitted (e.g. tests).
          // The route page passes the real fs check.
          const isAvailable = availability[r.filename] !== false;
          const mailtoSubject = encodeURIComponent(`Resume request: ${r.title}`);
          const mailtoBody = encodeURIComponent(
            `Hi John,\n\nCould you send the latest "${r.title}" resume? I found you via your portfolio page.\n\nThanks,`
          );
          return (
            <Card key={r.filename} accent={brand.accentBlue} testId={`card-resume-${idx}`}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 38, height: 38, borderRadius: 10,
                  background: 'rgba(37, 99, 235, 0.10)',
                  border: `1px solid rgba(37, 99, 235, 0.28)`,
                  color: brand.accentBlue,
                }}>
                  <ScrollText size={18} />
                </div>
                {!isAvailable && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px', borderRadius: 999,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: 'rgba(245, 158, 11, 0.10)',
                    color: brand.accentAmber,
                    border: `1px solid rgba(245, 158, 11, 0.28)`,
                  }}>
                    <FileWarning size={10} /> On request
                  </span>
                )}
              </div>
              <h3 style={{
                fontFamily: brand.fontDisplay, fontSize: 18, fontWeight: 700,
                color: brand.textPrimary, margin: 0,
              }}>{r.title}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
                {r.bestFor}
              </p>
              {isAvailable ? (
                <a
                  href={`/resumes/${r.filename}`}
                  download
                  data-testid={`download-resume-${idx}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 10,
                    marginTop: 'auto',
                    background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
                    color: brand.accentInk, fontWeight: 600, fontSize: 13,
                    textDecoration: 'none',
                    boxShadow: brand.ctaGlowSoft,
                  }}
                >
                  <Download size={14} /> Download PDF
                </a>
              ) : (
                // Graceful fallback if the maintainer hasn't dropped the
                // real PDF yet — keeps the CTA clickable, routes the
                // request straight to John's inbox with a pre-filled
                // subject so he knows which variant to send back.
                <a
                  href={`mailto:${PERSON.email}?subject=${mailtoSubject}&body=${mailtoBody}`}
                  data-testid={`request-resume-${idx}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 10,
                    marginTop: 'auto',
                    background: 'transparent',
                    color: brand.textPrimary, fontWeight: 600, fontSize: 13,
                    textDecoration: 'none',
                    border: `1px solid ${brand.borderStrong}`,
                  }}
                >
                  <Mail size={14} /> Request by email
                </a>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function AvailableFor() {
  return (
    <section
      data-testid="portfolio-available-for"
      style={{
        padding: 'clamp(24px, 4vw, 32px) clamp(20px, 4vw, 24px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
      }}
    >
      <p style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: brand.accentCyan, margin: '0 0 14px',
      }}>Available for</p>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
      }}>
        {AVAILABLE_FOR.map((a) => (
          <Pill key={a}>
            <Briefcase size={11} /> {a}
          </Pill>
        ))}
      </div>
    </section>
  );
}

function ContactPanel() {
  const items: { Icon: typeof Mail; label: string; href: string; external?: boolean }[] = [
    { Icon: Mail, label: PERSON.email, href: `mailto:${PERSON.email}` },
    { Icon: Github, label: 'github.com/shotgunsensei', href: PERSON.github, external: true },
    { Icon: Linkedin, label: 'linkedin.com/in/shotgunsensei', href: PERSON.linkedin, external: true },
  ];
  return (
    <section
      id="contact"
      data-testid="portfolio-contact"
      style={{
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 4vw, 24px) clamp(64px, 9vw, 96px)',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <Card accent={brand.accentCyan} testId="card-contact">
        <SectionHeader
          eyebrow="Get in touch"
          title="Let's talk about the role, the project, or the problem."
          subtitle="Best reached by email — replies typically within one business day."
        />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginTop: 8,
        }}>
          {items.map(({ Icon, label, href, external }) => (
            <a
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              data-testid={`contact-${label}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 16px', borderRadius: 12,
                background: brand.bgGlass,
                border: `1px solid ${brand.borderSoft}`,
                color: brand.textPrimary, textDecoration: 'none',
                fontSize: 14, fontWeight: 500,
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0, 229, 255, 0.10)',
                border: `1px solid rgba(0, 229, 255, 0.25)`,
                color: brand.accentCyan,
              }}>
                <Icon size={14} />
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </span>
              {external && <ExternalLink size={12} style={{ marginLeft: 'auto', color: brand.textMuted }} />}
            </a>
          ))}
        </div>
      </Card>
    </section>
  );
}

// ─── Page composition ─────────────────────────────────────────────

function PersonJsonLd() {
  // schema.org Person markup — gives LinkedIn/Google a structured
  // profile to read so recruiter previews and rich-result panels show
  // the right role, location, and links.
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: PERSON.name,
    jobTitle: PERSON.title,
    description: PERSON.heroCopy,
    url: 'https://operatoros.net/portfolio',
    email: `mailto:${PERSON.email}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Salemburg',
      addressRegion: 'NC',
      addressCountry: 'US',
    },
    knowsAbout: [
      'Infrastructure Engineering', 'Security Operations', 'MSP Operations',
      'Healthcare IT', 'Networking', 'Automation', 'Cloud Architecture',
      'Microsoft 365', 'Entra ID', 'Active Directory', 'Datto RMM',
      'HIPAA', 'Intelerad', 'PowerScribe', 'PowerShell',
    ],
    sameAs: [PERSON.github, PERSON.linkedin],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function PortfolioPage({
  resumesAvailability = {},
}: PortfolioPageProps) {
  return (
    <MarketingLayout testId="page-portfolio">
      <PersonJsonLd />
      <style dangerouslySetInnerHTML={{ __html: `
        .portfolio-card:hover {
          border-color: ${brand.borderStrong};
          transform: translateY(-2px);
        }
        @media (prefers-reduced-motion: reduce) {
          .portfolio-card { transition: none; }
          .portfolio-card:hover { transform: none; }
        }
      ` }} />
      <Hero />
      <OperatingPrinciples />
      <SpecializationsGrid />
      <ProjectsGrid />
      <CaseStudies />
      <ResumeHub availability={resumesAvailability} />
      <AvailableFor />
      <ContactPanel />
    </MarketingLayout>
  );
}
