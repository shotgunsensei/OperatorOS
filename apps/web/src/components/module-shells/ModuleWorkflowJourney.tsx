import Link from 'next/link';
import { getModuleWorkflowJourney, moduleWorkflowPath } from '@/lib/module-workflow-journey';
import styles from './CoreSuiteWorkflow.module.css';

export default function ModuleWorkflowJourney({ moduleSlug, path, routes }: {
  moduleSlug: string;
  path: string;
  routes: readonly { canonicalPath: string }[];
}) {
  const journey = getModuleWorkflowJourney(moduleSlug, path);
  if (!journey) return null;
  const stages = journey.stages.flatMap((step, index) => {
    const route = routes.find(item => moduleWorkflowPath(item.canonicalPath) === step.path);
    return route ? [{ ...step, href: route.canonicalPath, index }] : [];
  });
  if (stages.length < 2) return null;
  const current = stages.find(step => step.index === journey.activeIndex);
  return <nav className={styles.journey} aria-label={journey.label} data-testid={`${moduleSlug}-workflow-journey`}>
    <ol>{stages.map((step, index) => <li key={step.path}>
      <Link href={step.href} aria-current={step.index === journey.activeIndex ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{step.label}</Link>
    </li>)}</ol>
    <p>{current ? <><strong>{current.label}:</strong> {current.guidance}</> : journey.label}</p>
  </nav>;
}
