'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Repeat2 } from 'lucide-react';
import type { WorkdayBrief } from '@/lib/core-suite-workday';
import styles from './CoreSuiteWorkdayBrief.module.css';

export default function CoreSuiteWorkdayBrief({
  moduleId,
  eyebrow,
  brief,
  hrefFor,
}: {
  moduleId: 'tradeflowkit' | 'techdeck' | 'pulsedesk';
  eyebrow: string;
  brief: WorkdayBrief;
  hrefFor: (href: string) => string;
}) {
  return (
    <section className={styles.brief} data-module={moduleId} data-state={brief.state} data-testid={`${moduleId}-workday-brief`}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2>{brief.title}</h2>
          <p>{brief.summary}</p>
        </div>
        <Link className={styles.primaryAction} href={hrefFor(brief.primaryAction.href)}>
          {brief.primaryAction.label}<ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <div className={styles.metrics} aria-label={`${eyebrow} metrics`}>
        {brief.metrics.map(metric => (
          <article className={styles.metric} data-severity={metric.severity} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      {brief.state === 'setup' ? (
        <div className={styles.setup} aria-label="Quick start steps">
          {brief.setupSteps.map((step, index) => (
            <Link className={styles.setupStep} href={hrefFor(step.href)} key={step.label}>
              <span>{index + 1}</span><strong>{step.label}</strong><p>{step.detail}</p>
            </Link>
          ))}
        </div>
      ) : brief.actions.length ? (
        <ol className={styles.actions} aria-label="Ranked next actions">
          {brief.actions.map((action, index) => (
            <li key={action.id}>
              <Link className={styles.action} href={hrefFor(action.href)} data-severity={action.severity}>
                <span className={styles.rank}>{index + 1}</span>
                <div className={styles.actionBody}>
                  <span className={styles.actionEyebrow}>{action.eyebrow}</span>
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                </div>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyActions} role="status"><CheckCircle2 size={17} aria-hidden="true" />Nothing urgent needs manual triage. Keep the normal workflow moving.</div>
      )}

      <h3 className={styles.automationLabel}>Safe ways to remove repeat work</h3>
      <div className={styles.automations}>
        {brief.automations.map(automation => (
          <Link className={styles.automation} href={hrefFor(automation.href)} key={automation.label}>
            <Repeat2 size={17} aria-hidden="true" />
            <div><strong>{automation.label}</strong><p>{automation.detail}</p></div>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
