import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { AuthoringIssue } from '@/data/cases/authoring';

export const inputCls =
  'w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50';

export function issuesForPath(
  issues: AuthoringIssue[],
  pathPrefix: string
): AuthoringIssue[] {
  return issues.filter(
    (i) => i.path === pathPrefix || i.path?.startsWith(`${pathPrefix}`)
  );
}

export function topLevelIssues(issues: AuthoringIssue[]): AuthoringIssue[] {
  return issues.filter((i) => !i.path);
}

export function FieldIssues({ issues }: { issues: AuthoringIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, idx) => (
        <li
          key={`${i.code}-${idx}`}
          className={`text-[11px] font-mono flex items-start gap-1 ${
            i.level === 'error' ? 'text-red-400' : 'text-amber-300'
          }`}
        >
          {i.level === 'error' ? (
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          )}
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {description && (
            <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
        {label}
        {hint && <span className="ml-2 text-zinc-600 normal-case font-sans">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
