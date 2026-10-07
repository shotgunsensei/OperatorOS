import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { lanePricingPath, type AudienceLane } from '@/lib/audience-lanes';
import { withCampaign } from '@/lib/campaign-query';
import type { BillingCatalog } from '@/lib/pricing-catalog';
import LandingPricing from './LandingPricing';
import styles from './AudiencePages.module.css';

export default function AudienceDetail({ lane, catalog, campaign = '' }: { lane: AudienceLane; catalog: BillingCatalog | null; campaign?: string }) {
  const pricingPath = withCampaign(lanePricingPath(lane), campaign);
  return (
    <div className={styles.root} style={{ '--lane-accent': lane.accent } as React.CSSProperties} data-lane={lane.productKey} data-testid={`audience-page-${lane.slug}`}>
      <section className={`${styles.container} ${styles.detailHero}`}>
        <div className={styles.detailCopy}>
          <Link href="/" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" />All business types</Link>
          <p className={styles.eyebrow}>{lane.audience.toUpperCase()} / {lane.product}</p>
          <h1>{lane.headline.split('\n').map(line => <span key={line}>{line}</span>)}</h1>
          <p className={styles.lead}>{lane.intro}</p>
          <div className={styles.actions}>
            <Link href={pricingPath} className={styles.primaryButton} data-testid="lane-pricing-cta">Review {lane.product} pricing <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <p className={styles.detailFit}>{lane.examples}</p>
          <p className={styles.purchaseNote}>One monthly flagship for your organization. Five seats and one eligible companion included.</p>
        </div>
        <div className={styles.detailVisual}>
          <Image src={lane.image} alt={lane.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 42vw" className={styles.detailImage} />
          <div className={styles.visualCaption}><span>POWERED BY OPERATOROS</span><strong>{lane.product}</strong><p>{lane.cardTitle}</p></div>
        </div>
      </section>
      <section className={styles.container}><LandingPricing productKey={lane.productKey} product={lane.product} initialCatalog={catalog} /></section>
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
      <section className={`${styles.container} ${styles.scenario}`} aria-labelledby="scenario-title">
        <div><p className={styles.eyebrow}>ILLUSTRATIVE WORKDAY</p><h2 id="scenario-title">{lane.example.title}</h2><p>{lane.example.problem}</p></div>
        <div><ol>{lane.example.actions.map(action => <li key={action}>{action}</li>)}</ol><p className={styles.scenarioResult}>{lane.example.result}</p></div>
      </section>
      <section className={`${styles.container} ${styles.companions}`} aria-labelledby="companion-heading">
        <p className={styles.eyebrow}>ROOM TO SUPPORT YOUR WORK</p><h2 id="companion-heading">Keep {lane.product} at the center.</h2><p>Your Stack includes one eligible companion. Review the available choices in pricing; free account apps do not use that selection.</p>
        <div className={styles.companionGrid}>{lane.companions.map(companion => <article key={companion.slug}><h3>{companion.name}</h3><p>{companion.copy}</p></article>)}</div>
        <aside className={styles.connectionNote}><Check size={20} aria-hidden="true" /><div><h3>Know what is ready before you connect</h3><p>{lane.connectionNote}</p></div></aside>
      </section>
      <section className={`${styles.container} ${styles.faq}`} aria-labelledby="lane-faq">
        <h2 id="lane-faq">A few things worth knowing.</h2>
        {lane.faq.map(faq => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}
      </section>
      <section className={`${styles.container} ${styles.detailClose}`}>
        <p className={styles.eyebrow}>YOUR NEXT STEP</p><h2>Start with {lane.product}.</h2><p>Review monthly pricing, choose your companion, and continue through OperatorOS.</p>
        <Link href={pricingPath} className={styles.primaryButton}>Review {lane.product} pricing <ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
    </div>
  );
}
