import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './CoreSuiteWorkflow.module.css';

/** Native disclosure keeps fields mounted, preserving edits and FormData. */
export default function CoreSuiteSection({ title, description, children, defaultOpen = false, testId }: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return <details className={styles.section} open={defaultOpen || undefined} data-testid={testId}>
    <summary><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ChevronDown size={17} aria-hidden="true" /></summary>
    <div className={styles.sectionBody}>{children}</div>
  </details>;
}
