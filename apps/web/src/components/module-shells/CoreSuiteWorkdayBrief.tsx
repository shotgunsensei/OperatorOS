'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Repeat2 } from 'lucide-react';
import type { WorkdayBrief } from '@/lib/core-suite-workday';
import styles from './CoreSuiteWorkdayBrief.module.css';
import CoreSuiteSection from './CoreSuiteSection';

export default function CoreSuiteWorkdayBrief({
  moduleId,
  eyebrow,
  brief,
  hrefFor,
}: {
  moduleId:
    | 'tradeflowkit'
    | 'techdeck'
    | 'pulsedesk'
    | 'brandforgeos'
    | 'snapproofos'
    | 'studyforge-ai'
    | 'ninja-launch-kit'
    | 'callcommand-ai'
    | 'ninjamation';
  eyebrow: string;
  brief: WorkdayBrief;
  hrefFor: (href: string) => string;
}) {
  const guided = ['tradeflowkit', 'techdeck', 'pulsedesk'].includes(moduleId);
  const visibleActions = guided ? brief.actions.slice(0, 3) : brief.actions;
  const renderAction = (action: WorkdayBrief['actions'][number], index: number) => (
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
  );
  const automationLinks = <div className={styles.automations}>
    {brief.automations.map(automation => (
      <Link className={styles.automation} href={hrefFor(automation.href)} key={automation.label}>
        <Repeat2 size={17} aria-hidden="true" />
        <div><strong>{automation.label}</strong><p>{automation.detail}</p></div>
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    ))}
  </div>;
  return (
    <section className={styles.brief} data-module={moduleId} data-guided={guided || undefined} data-state={brief.state} data-testid={`${moduleId}-workday-brief`}>
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

      {(!guided || brief.state !== 'setup') && <div className={styles.metrics} aria-label={`${eyebrow} metrics`}>
        {brief.metrics.map(metric => (
          <article className={styles.metric} data-severity={metric.severity} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>}

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
          {visibleActions.map(renderAction)}
        </ol>
      ) : (
        <div className={styles.emptyActions} role="status"><CheckCircle2 size={17} aria-hidden="true" />No urgent items in the records shown here. You can continue your planned work.</div>
      )}

      {guided && brief.actions.length > 3 && <CoreSuiteSection title={`${brief.actions.length - 3} more priorities`} testId={`${moduleId}-more-priorities`}>
        <ol className={styles.actions} start={4} aria-label="More ranked actions">{brief.actions.slice(3).map((action, index) => renderAction(action, index + 3))}</ol>
      </CoreSuiteSection>}
      {guided ? <CoreSuiteSection title="Save time on repeat tasks" description="Review recurring work and follow-up options." testId={`${moduleId}-automation-options`}>
        {automationLinks}
      </CoreSuiteSection> : <><h3 className={styles.automationLabel}>Save time on repeat tasks</h3>{automationLinks}</>}
    </section>
  );
}
