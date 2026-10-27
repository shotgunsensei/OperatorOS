'use client';

import type { ReactNode } from 'react';
import { Check, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import OperatorLogo from '../brand/OperatorLogo';
import styles from './AccountFlowFrame.module.css';

export default function AccountFlowFrame({ title, description, children }: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={styles.screen}>
      <aside className={styles.story} aria-label="About your OperatorOS account">
        <OperatorLogo href="/" size={36} wordmarkSize={22} />
        <div className={styles.storyContent}>
          <p className={styles.eyebrow}>ONE ACCOUNT. YOUR WAY FORWARD.</p>
          <h2>Your work deserves<br />a clearer home.</h2>
          <p>Keep your organization, team access, and connected tools together. Start with what helps you today.</p>
          <ul>
            <li><Check size={18} aria-hidden="true" />One sign-in for the apps you can use</li>
            <li><Check size={18} aria-hidden="true" />Your organization&apos;s roles and access</li>
            <li><Check size={18} aria-hidden="true" />An account you can manage and recover</li>
          </ul>
        </div>
        <Link href="/" className={styles.back}><ArrowLeft size={16} aria-hidden="true" />Back to OperatorOS</Link>
      </aside>
      <section className={styles.formPanel} aria-labelledby="account-flow-title">
        <div className={styles.formCard}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>YOUR OPERATOROS ACCOUNT</p>
            <h1 id="account-flow-title">{title}</h1>
            <p>{description}</p>
          </header>
          {children}
          <p className={styles.help}>Need a hand? <Link href="/help">Visit the Help Center</Link></p>
        </div>
      </section>
    </main>
  );
}
