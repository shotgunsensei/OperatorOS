import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AUDIENCE_LANES, lanePath, lanePricingPath, type AudienceLane } from '@/lib/audience-lanes';
import styles from './AudiencePages.module.css';

export default function AudienceDetail({ lane }: { lane: AudienceLane }) {
  return (
    <div className={styles.root} style={{ '--lane-accent': lane.accent } as React.CSSProperties} data-testid={`audience-page-${lane.slug}`}>
      <section className={`${styles.container} ${styles.detailHero}`}>
        <div className={styles.detailCopy}>
          <Link href="/" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" />All business types</Link>
          <p className={styles.eyebrow}>{lane.audience.toUpperCase()} / {lane.product}</p>
          <h1>{lane.headline.split('\n').map(line => <span key={line}>{line}</span>)}</h1>
          <p className={styles.lead}>{lane.intro}</p>
          <div className={styles.actions}>
            <Link href={lanePricingPath(lane)} className={styles.primaryButton} data-testid="lane-pricing-cta">See {lane.product} plans <ArrowRight size={18} aria-hidden="true" /></Link>
            <a href="#your-workday" className={styles.secondaryButton}>See your workday</a>
          </div>
          <p className={styles.detailFit}>{lane.examples}</p>
        </div>
        <div className={styles.detailVisual}>
          <Image src={lane.image} alt={lane.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 42vw" className={styles.detailImage} />
          <div className={styles.visualCaption}><span>POWERED BY OPERATOROS</span><strong>{lane.product}</strong><p>{lane.cardTitle}</p></div>
        </div>
      </section>
      <section className={`${styles.container} ${styles.benefits}`} aria-label={`What ${lane.product} helps you do`}>
        {lane.benefits.map((benefit, index) => <article key={benefit.title}><span className={styles.stepNumber}>0{index + 1}</span><h2>{benefit.title}</h2><p>{benefit.copy}</p></article>)}
      </section>
      {lane.slug === 'healthcare-legal' && <section className={`${styles.container} ${styles.fitSection}`} aria-labelledby="office-fit">
        <p className={styles.eyebrow}>THE RIGHT FIT FOR YOUR OFFICE</p><h2 id="office-fit">Operations support. A clear scope.</h2>
        <div className={styles.fitGrid}><article><h3>Healthcare operations</h3><p>Coordinate departments, facilities, equipment, supplies, and service requests. Keep patient charts and clinical decisions in your approved healthcare systems.</p></article><article><h3>Legal-office operations</h3><p>Coordinate office equipment, facilities, supplies, and vendor requests. Keep cases, court deadlines, trust accounting, and confidential client matters in your legal practice systems.</p></article></div>
      </section>}
      <section id="your-workday" className={`${styles.container} ${styles.workflow}`}>
        <div><p className={styles.eyebrow}>A WORKDAY WITH {lane.product.toUpperCase()}</p><h2>One clear next step.<br />Then the next.</h2><p>Start with one piece of real work. Keep its details and progress together.</p></div>
        <ol>{lane.steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></li>)}</ol>
      </section>
      <section className={`${styles.container} ${styles.companions}`} aria-labelledby="companion-heading">
        <p className={styles.eyebrow}>BUILD AROUND YOUR BUSINESS</p><h2 id="companion-heading">A few useful next additions.</h2><p>Start with {lane.product}. Add the tools that support your work, with access and pricing managed in OperatorOS.</p>
        <div className={styles.companionGrid}>{lane.companions.map(companion => <article key={companion.slug}><h3>{companion.name}</h3><p>{companion.copy}</p><Link href={`/modules#module-${companion.slug}`} className={styles.textLink}>Explore {companion.name}<ArrowRight size={16} aria-hidden="true" /></Link></article>)}</div>
        <aside className={styles.connectionNote}><Check size={20} aria-hidden="true" /><div><h3>Know what is ready before you connect</h3><p>{lane.connectionNote}</p></div></aside>
      </section>
      <section className={`${styles.container} ${styles.faq}`} aria-labelledby="lane-faq">
        <h2 id="lane-faq">A few things worth knowing.</h2>
        {lane.faq.map(faq => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}
      </section>
      <section className={`${styles.container} ${styles.detailClose}`}>
        <p className={styles.eyebrow}>YOUR NEXT STEP</p><h2>Make room for a better workday.</h2><p>Review {lane.product} plans and choose what fits your team.</p>
        <Link href={lanePricingPath(lane)} className={styles.primaryButton}>See {lane.product} plans <ArrowRight size={18} aria-hidden="true" /></Link>
        <Link href="/john" className={styles.textLink}>Talk through your needs</Link>
      </section>
      <nav className={`${styles.container} ${styles.otherLanes}`} aria-label="Other business types"><span>Explore another lane</span>{AUDIENCE_LANES.filter(other => other.slug !== lane.slug).map(other => <Link key={other.slug} href={lanePath(other)}>{other.audience}<ArrowRight size={15} aria-hidden="true" /></Link>)}</nav>
    </div>
  );
}
