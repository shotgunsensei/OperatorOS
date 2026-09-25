'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole, Users, Layers3 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { AUDIENCE_LANES, lanePath } from '@/lib/audience-lanes';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import styles from './AudiencePages.module.css';

export default function AudienceHome() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && user) window.location.replace(DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl);
  }, [loading, user]);

  return (
    <div className={styles.root}>
      <section className={`${styles.container} ${styles.homeHero}`} data-testid="marketing-hero" aria-labelledby="audience-title">
        <div className={styles.homeIntro}>
          <p className={styles.eyebrow}>YOUR BUSINESS. YOUR WAY FORWARD.</p>
          <h1 id="audience-title" data-testid="marketing-hero-title">You run the business.<br /><span>Choose your lane.</span></h1>
          <p className={styles.lead}>Start with the work you do. Find the tools that move it forward.</p>
        </div>
        <div className={styles.laneGrid} data-testid="audience-lanes">
          {AUDIENCE_LANES.map((lane, index) => (
            <Link key={lane.slug} href={lanePath(lane)} className={styles.laneCard} style={{ '--lane-accent': lane.accent } as React.CSSProperties} data-testid={`audience-lane-${lane.slug}`} aria-label={`Explore ${lane.audience} with ${lane.product}`}>
              <Image src={lane.image} alt="" fill priority sizes="(max-width: 700px) 100vw, 33vw" className={styles.laneImage} />
              <div className={styles.cardShade} />
              <div className={styles.cardTop}><span>0{index + 1}</span><span>{lane.product}</span></div>
              <div className={styles.cardBody}>
                <h2>{lane.audience}</h2>
                <p className={styles.cardPromise}>{lane.cardTitle}</p>
                <p className={styles.cardCopy}>{lane.cardCopy}</p>
                <span className={styles.cardLink}>Explore {lane.product}<ArrowRight size={19} aria-hidden="true" /></span>
              </div>
            </Link>
          ))}
        </div>
        <div className={styles.underCards}>
          <p><Check size={16} aria-hidden="true" />One OperatorOS account. Tools chosen for your business.</p>
          <Link href="/modules">Looking for something else? See all apps <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
      <section className={`${styles.container} ${styles.sharedSection}`} aria-labelledby="shared-heading">
        <div>
          <p className={styles.eyebrow}>ONE BUSINESS. LESS REPEAT WORK.</p>
          <h2 id="shared-heading">Your customer details.<br />Already there.</h2>
          <p>Save a customer once in your shared business directory. Select the same customer in TradeFlowKit, BrandForge OS, and SnapProofOS as you add those apps.</p>
          <p className={styles.smallCopy}>Your team’s access still applies. Linked details stay current; approved reports keep their original information.</p>
          <Link href="/for/trades" className={styles.textLink}>See how the work connects <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className={styles.sharedExample} aria-label="Example of one shared customer used in three applications">
          <span className={styles.exampleLabel}>HOW IT WORKS · EXAMPLE</span>
          <div className={styles.customerRow}><Users size={25} aria-hidden="true" /><div><strong>Your saved customer</strong><span>Name, contact details, and address</span></div><span className={styles.savedLabel}>Saved once</span></div>
          <ul>{['TradeFlowKit · Plan the job', 'SnapProofOS · Document the work', 'BrandForge OS · Prepare the campaign'].map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
          <p>Choose the shared customer in each connected app.</p>
        </div>
      </section>
      <section className={`${styles.container} ${styles.foundation}`} aria-label="The OperatorOS foundation">
        {[{ Icon: LockKeyhole, title: 'One sign-in', copy: 'Your own account across the apps you can use.' }, { Icon: Users, title: 'Your team, your access', copy: 'Keep each business and its permissions separate.' }, { Icon: Layers3, title: 'Start focused. Add as needed.', copy: 'Review your plan and useful add-ons in one place.' }].map(({ Icon, title, copy }) => <div key={title}><Icon size={21} aria-hidden="true" /><h3>{title}</h3><p>{copy}</p></div>)}
      </section>
      <section className={`${styles.container} ${styles.homeClose}`}>
        <h2>A clearer day starts with the right tools.</h2>
        <a href="#audience-title" className={styles.primaryButton}>Find your fit <ArrowRight size={18} aria-hidden="true" /></a>
        <Link href="/pricing" className={styles.textLink}>Compare plans</Link>
      </section>
    </div>
  );
}
