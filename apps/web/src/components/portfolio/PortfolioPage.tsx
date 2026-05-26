'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight, ExternalLink, Download, Mail, Github, Linkedin, MapPin,
  Server, Shield, Wrench, HeartPulse, Network, Bot, Briefcase, FolderGit2,
  AlertTriangle, ScrollText,
} from 'lucide-react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { brand } from '@/lib/brand';
import {
  PERSON, HERO_CTAS, SPECIALIZATIONS, PROJECTS, CASE_STUDIES,
  RESUME_VARIANTS, AVAILABLE_FOR,
} from './portfolio-content';

/**
 * John Travis Williams Jr. portfolio — Task #113.
 *
 * Hidden technical-authority page reachable at /portfolio and /john.
 * Reuses MarketingLayout so the public navbar + footer chrome stays
 * consistent with the rest of the marketing surface, but is excluded
 * from /robots.txt so the URL doesn't leak into search.
 *
 * All copy lives in `./portfolio-content.ts` — never edit JSX strings.
 */

const SPEC_ICONS = [Server, Shield, Wrench, HeartPulse, Network, Bot];

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
        fontSize: 'clamp(26px, 3.6vw, 38px)', fontWeight: 700,
        color: brand.textPrimary, margin: '0 0 12px', letterSpacing: '-0.02em',
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

  // Anchor link or external — use plain <a>. Internal route uses Link.
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
        padding: '88px 24px 64px',
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
          fontSize: 'clamp(36px, 6vw, 60px)', fontWeight: 800,
          color: brand.textPrimary, margin: '20px 0 14px',
          letterSpacing: '-0.025em', lineHeight: 1.05,
        }}>
          {PERSON.name}
        </h1>

        <p style={{
          fontFamily: brand.fontDisplay, fontSize: 18, fontWeight: 600,
          color: brand.textPrimary, margin: '0 0 10px',
        }}>
          {PERSON.title}
        </p>

        <p style={{
          fontSize: 13, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: brand.accentCyan,
          margin: '0 0 20px',
        }}>
          {PERSON.positioning}
        </p>

        <p style={{
          fontSize: 17, lineHeight: 1.6, color: brand.textSecondary,
          maxWidth: 720, margin: '0 auto 14px',
        }}>
          {PERSON.heroCopy}
        </p>

        <p style={{
          fontSize: 13, color: brand.textMuted, margin: '0 0 32px',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <MapPin size={13} /> {PERSON.location} · {PERSON.founder}
        </p>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
        }}>
          {HERO_CTAS.map((cta) => (
            <CtaButton key={cta.label} cta={cta} large />
          ))}
        </div>
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
        padding: '48px 24px',
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
        padding: '48px 24px',
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
        padding: '48px 24px',
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

function ResumeHub() {
  return (
    <section
      id="resumes"
      data-testid="portfolio-resumes"
      style={{
        padding: '48px 24px',
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
        {RESUME_VARIANTS.map((r, idx) => (
          <Card key={r.filename} accent={brand.accentBlue} testId={`card-resume-${idx}`}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(37, 99, 235, 0.10)',
              border: `1px solid rgba(37, 99, 235, 0.28)`,
              color: brand.accentBlue,
            }}>
              <ScrollText size={18} />
            </div>
            <h3 style={{
              fontFamily: brand.fontDisplay, fontSize: 18, fontWeight: 700,
              color: brand.textPrimary, margin: 0,
            }}>{r.title}</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
              {r.bestFor}
            </p>
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
          </Card>
        ))}
      </div>
    </section>
  );
}

function AvailableFor() {
  return (
    <section
      data-testid="portfolio-available-for"
      style={{
        padding: '32px 24px',
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
        padding: '48px 24px 96px',
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

export default function PortfolioPage() {
  return (
    <MarketingLayout testId="page-portfolio">
      <Hero />
      <SpecializationsGrid />
      <ProjectsGrid />
      <CaseStudies />
      <ResumeHub />
      <AvailableFor />
      <ContactPanel />
    </MarketingLayout>
  );
}
