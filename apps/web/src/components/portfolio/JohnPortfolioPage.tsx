import React from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Download,
  FileText, Github, Linkedin, Mail, MapPin, ShieldCheck,
} from 'lucide-react';
import {
  JOHN_APPROACH, JOHN_CAPABILITIES, JOHN_EXPERIENCE, JOHN_PROFILE, JOHN_PROOF,
} from './john-portfolio-content';
import styles from './john-portfolio.module.css';

function ExternalProof({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className={styles.proofLink} href={href} target="_blank" rel="noopener noreferrer">
    {children}<ArrowUpRight size={16} aria-hidden="true" />
  </a>;
}

function SectionHeading({ number, label, title, children }: {
  number: string; label: string; title: string; children?: React.ReactNode;
}) {
  return <div className={styles.sectionHeading}>
    <p className={styles.eyebrow}><span>{number}</span> {label}</p>
    <h2>{title}</h2>
    {children && <p className={styles.sectionLead}>{children}</p>}
  </div>;
}

export default function JohnPortfolioPage() {
  const person = {
    '@context': 'https://schema.org', '@type': 'Person',
    name: JOHN_PROFILE.name, jobTitle: JOHN_PROFILE.currentRole,
    url: 'https://operatoros.net/john', email: `mailto:${JOHN_PROFILE.email}`,
    sameAs: [JOHN_PROFILE.github, JOHN_PROFILE.linkedin],
  };

  return <div className={styles.page} data-testid="john-portfolio">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <a className={styles.identity} href="#top" aria-label="John Williams, back to top">
          <span className={styles.monogram} aria-hidden="true">JW<span>.</span></span>
          <span className={styles.identityText}>JOHN WILLIAMS<span>Systems · Automation · Applied AI</span></span>
        </a>
        <nav className={styles.nav} aria-label="Portfolio sections">
          <a href="#work">Work</a><a href="#expertise">Expertise</a>
          <a href="#experience">Experience</a><a href="#contact">Contact</a>
        </nav>
        <a className={styles.headerResume} href={JOHN_PROFILE.resume} download>
          Résumé <Download size={15} aria-hidden="true" />
        </a>
      </div>
    </header>

    <main id="main-content">
      <section className={styles.hero} id="top" aria-labelledby="hero-title">
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div>
            <p className={styles.availability}><span aria-hidden="true" />Open to remote engineering opportunities</p>
            <h1 id="hero-title">John Williams<span>.</span></h1>
            <p className={styles.heroRole}>Systems experience.<br /><strong>An engineer’s approach to AI.</strong></p>
            <p className={styles.heroDescription}>I solve complex infrastructure problems and turn practical IT knowledge into software, automation and tools that other people can use.</p>
            <p className={styles.currentRole}>{JOHN_PROFILE.currentRole} at {JOHN_PROFILE.employer}<br />Owner, Shotgun Ninjas Productions</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href={JOHN_PROFILE.resume} download>Download résumé<Download size={17} aria-hidden="true" /></a>
              <a className={styles.heroSecondary} href="#work">Explore selected work<ArrowDown size={17} aria-hidden="true" /></a>
            </div>
            <p className={styles.location}><MapPin size={14} aria-hidden="true" />{JOHN_PROFILE.location}<span>·</span>Remote roles</p>
          </div>
          <aside className={styles.proofPanel} aria-labelledby="proof-panel-title">
            <div className={styles.proofPanelTop}><ShieldCheck size={21} aria-hidden="true" /><span>PUBLIC ENGINEERING RECORD</span></div>
            <h2 id="proof-panel-title">Work you can inspect.</h2>
            <p>OperatorOS · source-linked verification</p>
            <dl className={styles.proofStats}>
              <div><dt>Release gates passed</dt><dd>14<span>/14</span></dd></div>
              <div><dt>Retrieval checks passed</dt><dd>32<span>/32</span></dd></div>
              <div><dt>Checks executed</dt><dd className={styles.proofDate}>23 NOV <span>2026</span></dd></div>
            </dl>
            <p className={styles.proofBoundary}>Executed GitHub CI at <code>9d9edc09</code>. Isolated test resources and synthetic external providers.</p>
            <ExternalProof href={JOHN_PROOF.release}>Inspect the release run</ExternalProof>
          </aside>
        </div>
        <div className={`${styles.container} ${styles.heroFoot}`}>
          <span>Infrastructure & escalation</span><span>Automation & tooling</span><span>Applied AI & delivery</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.container}`} id="work" aria-labelledby="work-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}><span>01</span> SELECTED WORK</p>
          <h2 id="work-title">Practical problems. Inspectable work.</h2>
          <p className={styles.sectionLead}>Three examples connect my systems background with AI-assisted implementation, careful testing and operational judgment.</p>
        </div>

        <article className={styles.featuredCase} aria-labelledby="operatoros-title">
          <div className={styles.caseIntro}>
            <div className={styles.caseMeta}><span>01 / APPLIED AI & PLATFORM ENGINEERING</span><span className={styles.verifiedBadge}><Check size={13} aria-hidden="true" />Public source + CI</span></div>
            <h3 id="operatoros-title">OperatorOS &<br />TechDeck resolution intelligence</h3>
            <p className={styles.caseSummary}>Make operational knowledge searchable without losing tenant boundaries, source context or useful fallback behavior.</p>
            <div className={styles.tags}><span>TypeScript</span><span>Next.js</span><span>PostgreSQL</span><span>pgvector</span></div>
          </div>
          <div className={styles.caseBody}>
            <div><h4>The engineering work</h4><p>Directed AI-assisted development of a shared operations platform and retrieval workflow. The implementation combines role-filtered search, reviewed content before embedding, asynchronous indexing and literal-search fallback.</p></div>
            <div className={styles.caseResult}><span>VERIFICATION</span><p><strong>14 release gates and 32 retrieval tests passed</strong> at the linked revision. Checks exercise tenant isolation, stale sources, role revocation, provider failures and request caps.</p></div>
            <details className={styles.details}>
              <summary>Technical decisions and evidence<ChevronDown size={16} aria-hidden="true" /></summary>
              <div className={styles.detailsContent}>
                <p>Real PostgreSQL and pgvector are exercised with synthetic embedding responses. This verifies retrieval mechanics and access boundaries; live model relevance and customer impact are separate measures.</p>
                <p>The release receipts also report 2,999 API-package, 108 integration and 53 unit/script test results. These are separate suite totals, with possible overlap.</p>
                <div className={styles.evidenceLinks}><ExternalProof href={JOHN_PROOF.retrieval}>Retrieval tests</ExternalProof><ExternalProof href={JOHN_PROOF.regression}>Reviewed regression fix</ExternalProof></div>
              </div>
            </details>
            <div className={styles.evidenceLinks}><ExternalProof href={JOHN_PROOF.release}>Release evidence</ExternalProof><ExternalProof href={JOHN_PROOF.vector}>Vector test run</ExternalProof><ExternalProof href={JOHN_PROOF.source}>Source revision</ExternalProof></div>
          </div>
        </article>

        <div className={styles.caseGrid}>
          <article className={styles.secondaryCase} aria-labelledby="windows-title">
            <div className={styles.caseMeta}><span>02 / WINDOWS ENGINEERING</span><span>Private project</span></div>
            <h3 id="windows-title">Safer Office lifecycle planning</h3>
            <p className={styles.caseSummary}>Turn software inventory and migration decisions into a repeatable assessment and packaged technician workflow.</p>
            <p>AI-assisted work spans a native Windows application, CLI, MSI/EXE packaging and migration safeguards. Unknown Office or add-in architecture keeps the plan unready and prevents removal XML.</p>
            <div className={styles.caseResult}><span>RECORDED ACCEPTANCE</span><p><strong>16 local installer checks</strong> passed in disposable Windows 11 guests, including install, uninstall, upgrade, report preservation and SYSTEM CLI behavior.</p></div>
            <details className={styles.details}><summary>Validation scope<ChevronDown size={16} aria-hidden="true" /></summary><div className={styles.detailsContent}><p>Historical receipts dated 14 October 2026 apply to the recorded unsigned evaluation fixtures. Commercial signing, live providers and vendor-RMM acceptance remain separate. This is local acceptance evidence, not a claim of current green hosted CI.</p></div></details>
            <div className={styles.tags}><span>C# / .NET</span><span>WPF</span><span>PowerShell</span><span>WiX</span></div>
          </article>
          <article className={styles.secondaryCase} aria-labelledby="appliance-title">
            <div className={styles.caseMeta}><span>03 / SYSTEMS TOOLING</span><span>Private project</span></div>
            <h3 id="appliance-title">A portable Linux field appliance</h3>
            <p className={styles.caseSummary}>Bring diagnostics, evidence capture and controlled field workflows into one technician interface.</p>
            <p>AI-assisted implementation combines a Python service and web interface with role-aware access, explicit unavailable states, guarded operations and recovery procedures.</p>
            <div className={styles.caseResult}><span>RECORDED ACCEPTANCE</span><p><strong>Installed ARM64 guest lifecycle validation</strong> covers installation, upgrades, recovery and rollback. Tests also challenge revoked access and unsafe restore archives.</p></div>
            <details className={styles.details}><summary>Validation scope<ChevronDown size={16} aria-hidden="true" /></summary><div className={styles.detailsContent}><p>Software and QEMU guest evidence is recorded in the project. Physical Raspberry Pi, USB, radio, sustained operation and power-loss behavior need separate hardware acceptance. Current production MFA and hosted CI are not certified by these records.</p></div></details>
            <div className={styles.tags}><span>Python</span><span>Linux / ARM64</span><span>TypeScript</span><span>Recovery</span></div>
          </article>
        </div>
        <p className={styles.privateNote}><ShieldCheck size={16} aria-hidden="true" />Private projects are summarized without client data or repository access. Sanitized evidence is included in the <a href={JOHN_PROFILE.portfolio} download>portfolio PDF</a>.</p>
      </section>

      <section className={styles.expertiseSection} id="expertise">
        <div className={styles.container}>
          <SectionHeading number="02" label="CAPABILITIES" title="The systems background behind the software.">Hands-on operations experience informs what I build, how I test it and what I consider ready to hand over.</SectionHeading>
          <div className={styles.capabilityGrid}>{JOHN_CAPABILITIES.map((item, index) => <article className={styles.capability} key={item.title}>
            <span className={styles.capabilityNumber}>0{index + 1}</span><h3>{item.title}</h3><p>{item.description}</p><p className={styles.technologies}>{item.technologies}</p><p className={styles.capabilityEvidence}><strong>Evidence:</strong> {item.evidence}</p>
          </article>)}</div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.container} ${styles.experienceGrid}`} id="experience">
        <div><SectionHeading number="03" label="EXPERIENCE" title="Built on years of real support work." />
          <p className={styles.experienceIntro}>My career combines IT leadership, systems administration and senior MSP support. Alongside that work, I build software and reusable tooling through Shotgun Ninjas Productions.</p>
          <div className={styles.education}><span>EDUCATION</span><p><strong>B.S. Software Systems Engineering</strong><br />Colorado Technical University · 2007</p><p><strong>Associate of Science</strong><br />Sampson Community College · 2006</p></div>
        </div>
        <div className={styles.timeline}>{JOHN_EXPERIENCE.map(item => <article className={styles.timelineItem} key={item.period}>
          <p className={styles.period}>{item.period}</p><h3>{item.role}</h3><p className={styles.organization}>{item.organization}</p><p>{item.description}</p>
        </article>)}<p className={styles.careerNote}>Career background supplied by John. Detailed project claims are linked to their validation records.</p></div>
      </section>

      <section className={styles.approachSection} id="approach">
        <div className={styles.container}>
          <SectionHeading number="04" label="WORKING WITH AI" title="Faster iteration. Accountable engineering.">I use AI to expand what I can build. Scope, technical judgment and acceptance criteria still need an owner.</SectionHeading>
          <div className={styles.approachGrid}>{JOHN_APPROACH.map(item => <article key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
          <details className={styles.usageDetails}><summary>AI usage context<ChevronDown size={16} aria-hidden="true" /></summary><p>I report approximately 23.7 billion lifetime tokens over roughly 36 weeks, with about 11 weeks around one billion or higher. The provider export and counting method have not yet been verified. Usage describes practice volume; the linked engineering work is the evidence of capability.</p></details>
        </div>
      </section>

      <section className={`${styles.section} ${styles.container}`} id="resume">
        <div className={styles.downloadPanel}>
          <div><p className={styles.eyebrow}>FOR RECRUITERS & HIRING TEAMS</p><h2>The short version.<br />And the supporting evidence.</h2><p>Start with the résumé, then explore the technical portfolio for project decisions, verification and scope.</p></div>
          <div className={styles.downloads}>
            <a href={JOHN_PROFILE.resume} download><span className={styles.documentIcon}><FileText size={23} aria-hidden="true" /></span><span><strong>Systems & AI résumé</strong><span>Career background and selected engineering work · PDF</span></span><Download size={19} aria-hidden="true" /></a>
            <a href={JOHN_PROFILE.portfolio} download><span className={styles.documentIcon}><ShieldCheck size={23} aria-hidden="true" /></span><span><strong>Engineering portfolio</strong><span>Case studies, evidence and validation boundaries · PDF</span></span><Download size={19} aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section className={styles.contactSection} id="contact" aria-labelledby="contact-title">
        <div className={`${styles.container} ${styles.contactGrid}`}>
          <div><p className={styles.eyebrow}>LET’S TALK</p><h2 id="contact-title">Have a complex environment<br />or a practical problem?</h2><p>I’m interested in remote senior systems, automation and cloud solutions opportunities where operational experience and the ability to build both matter.</p><a className={styles.contactEmail} href={`mailto:${JOHN_PROFILE.email}`}>{JOHN_PROFILE.email}<ArrowUpRight size={23} aria-hidden="true" /></a></div>
          <div className={styles.contactLinks}><a href={`mailto:${JOHN_PROFILE.email}?subject=Engineering%20opportunity`}><Mail size={19} aria-hidden="true" />Discuss an opportunity<ArrowRight size={16} aria-hidden="true" /></a><a href={JOHN_PROFILE.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin size={19} aria-hidden="true" />LinkedIn<ArrowUpRight size={16} aria-hidden="true" /></a><a href={JOHN_PROFILE.github} target="_blank" rel="noopener noreferrer"><Github size={19} aria-hidden="true" />GitHub<ArrowUpRight size={16} aria-hidden="true" /></a></div>
        </div>
      </section>
    </main>
    <footer className={styles.footer}><div className={styles.container}><span>{JOHN_PROFILE.name}</span><span>Evidence reviewed {JOHN_PROOF.reviewed}</span><a href="#top">Back to top ↑</a></div></footer>
  </div>;
}
