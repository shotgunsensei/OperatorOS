'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, LockKeyhole, MonitorCog, ShieldCheck } from 'lucide-react';
import { fieldNodeIntroductionPath } from '../../../../../packages/modules/fieldnode.js';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import styles from './FieldNodeManagement.module.css';

/** The enclosing module host verifies the signed-in user's active tenant grant. */
export default function FieldNodeShell() {
  const [introduction, setIntroduction] = useState('https://fieldnode.operatoros.net/');
  useEffect(() => {
    setIntroduction(fieldNodeIntroductionPath(window.location.hostname, window.location.pathname));
  }, []);
  return (
    <section id="fieldnode-management" className={`fieldnode-management ${styles.management}`} data-testid="fieldnode-management-unavailable">
      <Link className={styles.back} href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}><ArrowLeft size={16} aria-hidden="true" /> My Apps</Link>
      <header className={styles.header}>
        <span className={styles.icon}><MonitorCog size={28} aria-hidden="true" /></span>
        <div><span className={styles.eyebrow}>Your hardware workspace</span><h1>Manage my FieldNodes</h1><p>One place for your organization&apos;s paired appliances.</p></div>
      </header>
      <div className={styles.status} role="status">
        <LockKeyhole size={21} aria-hidden="true" />
        <div><strong>Remote management is not connected yet</strong><p>Devices appear here only after an approved pairing service verifies ownership for your organization.</p></div>
      </div>
      <div className={styles.facts}>
        <article><ShieldCheck size={21} aria-hidden="true" /><h2>Free with your account</h2><p>The FieldNode application is available to free and paid OperatorOS accounts.</p></article>
        <article><LockKeyhole size={21} aria-hidden="true" /><h2>Ownership comes first</h2><p>A paid plan or software license does not replace device pairing and access grants.</p></article>
        <article><MonitorCog size={21} aria-hidden="true" /><h2>Keep local access</h2><p>Continue using your appliance&apos;s local console while remote pairing is unavailable.</p></article>
      </div>
      <Link className={styles.introduction} href={introduction}>About FieldNode and hardware purchasing <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </section>
  );
}
