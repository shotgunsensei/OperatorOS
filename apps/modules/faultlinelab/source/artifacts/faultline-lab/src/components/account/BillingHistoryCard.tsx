import { AlertCircle, ExternalLink, FileText, Receipt } from 'lucide-react';
import type { BillingHistoryEntry } from '@/lib/api';
import { entryLabel, formatAmount, formatShortDate, statusStyles } from './formatters';

interface BillingHistoryCardProps {
  history: BillingHistoryEntry[];
  historyLoading: boolean;
  historyError: string | null;
  portalLoading: boolean;
  onManageBilling: () => void;
}

export function BillingHistoryCard({
  history,
  historyLoading,
  historyError,
  portalLoading,
  onManageBilling,
}: BillingHistoryCardProps) {
  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <Receipt size={12} />
          Recent Invoices
        </h2>
        {history.some((e) => e.kind === 'invoice') && (
          <button
            onClick={onManageBilling}
            disabled={portalLoading}
            className="text-[11px] font-mono uppercase text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            View all in Stripe
            <ExternalLink size={10} />
          </button>
        )}
      </div>

      {historyLoading ? (
        <p className="text-xs text-zinc-500">Loading billing history…</p>
      ) : historyError ? (
        <div className="flex items-start gap-2 p-2.5 rounded border border-red-500/30 bg-red-500/10">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{historyError}</p>
        </div>
      ) : history.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No invoices or purchases yet. Anything you buy will show up here.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/60">
          {history.slice(0, 5).map((entry) => {
            const link = entry.hostedInvoiceUrl || entry.invoicePdf;
            return (
              <li
                key={`${entry.kind}-${entry.id}`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-200 truncate">{entryLabel(entry)}</p>
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${statusStyles(entry.status)}`}
                    >
                      {entry.status || 'unknown'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {formatShortDate(entry.createdAt)}
                    {entry.kind === 'purchase' && (
                      <span className="ml-2 text-zinc-600">One-time</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-mono text-zinc-200">
                    {formatAmount(entry.amount, entry.currency)}
                  </span>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      title="Open receipt"
                    >
                      <FileText size={12} />
                      <span className="hidden sm:inline">Receipt</span>
                    </a>
                  ) : (
                    <span className="text-[11px] text-zinc-600 hidden sm:inline">
                      No receipt
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
