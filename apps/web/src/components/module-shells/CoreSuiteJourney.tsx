'use client';

import Link from 'next/link';
import { getCoreSuiteJourney, type CoreSuiteModule } from '@/lib/core-suite-journey';
import styles from './CoreSuiteWorkflow.module.css';

export default function CoreSuiteJourney({ moduleId, path, hrefFor }: {
  moduleId: CoreSuiteModule;
  path: string;
  hrefFor: (path: string) => string;
}) {
  const journey = getCoreSuiteJourney(moduleId, path);
  if (!journey) return null;
  return <nav className={styles.journey} aria-label={journey.label} data-testid={`${moduleId}-journey`}>
    <ol>
      {journey.steps.map((step, index) => <li key={step.href}>
        <Link href={hrefFor(step.href)} aria-current={index === journey.activeIndex ? 'step' : undefined}>
          <span aria-hidden="true">{index + 1}</span>{step.label}
        </Link>
      </li>)}
    </ol>
    <p><strong>{journey.steps[journey.activeIndex].label}:</strong> {journey.steps[journey.activeIndex].guidance}</p>
  </nav>;
}
