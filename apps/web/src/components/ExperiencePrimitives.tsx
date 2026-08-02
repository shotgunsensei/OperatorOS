import type { ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ops-page-header">
      <div>
        {eyebrow && <div className="ops-page-eyebrow">{eyebrow}</div>}
        <h1 className="ops-page-title">{title}</h1>
        {description && <p className="ops-page-description">{description}</p>}
      </div>
      {actions && <div className="ops-page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ops-state-panel">
      <div>
        <Inbox size={24} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{description}</p>
        {action && <div style={{ marginTop: 18 }}>{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
  technicalDetails,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  technicalDetails?: ReactNode;
}) {
  return (
    <div className="ops-state-panel" role="alert">
      <div>
        <AlertCircle size={24} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{description}</p>
        {action && <div style={{ marginTop: 18 }}>{action}</div>}
        {technicalDetails && (
          <details className="ops-technical-details">
            <summary>Technical details</summary>
            <div style={{ marginTop: 8 }}>{technicalDetails}</div>
          </details>
        )}
      </div>
    </div>
  );
}

export function FieldMessage({ children }: { children: ReactNode }) {
  return (
    <div role="alert" aria-live="polite" style={{ marginBottom: 12, color: 'var(--ops-danger)', fontSize: 13, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}
