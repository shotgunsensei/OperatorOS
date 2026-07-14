'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  TicketCheck,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import {
  moduleShellApi,
  type TechDeckTicket,
  type TechDeckTicketPriority,
  type TechDeckTicketStatus,
} from '@/lib/auth';

interface TechDeckTicketQueueProps {
  tenantKey: string;
  currentUserId: string;
  canManageTickets: boolean;
}

type AssignmentFilter = 'all' | 'mine' | 'unassigned';

const PRIORITY_OPTIONS: Array<{ value: TechDeckTicketPriority; label: string }> = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_OPTIONS: Array<{ value: TechDeckTicketStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_client', label: 'Waiting on client' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const initialForm = {
  title: '',
  description: '',
  priority: 'medium' as TechDeckTicketPriority,
  responseDeadline: '',
  resolutionDeadline: '',
  assignToMe: true,
};

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    if ('error' in error && typeof error.error === 'string') return error.error;
    if ('message' in error && typeof error.message === 'string') return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function statusLabel(status: TechDeckTicketStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function priorityLabel(priority: TechDeckTicketPriority): string {
  return PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

function ticketDeadline(ticket: TechDeckTicket): { label: string; value: string; overdue: boolean } | null {
  if (!ticket.respondedAt && ticket.responseDeadline) {
    return {
      label: 'Respond by',
      value: ticket.responseDeadline,
      overdue: new Date(ticket.responseDeadline).getTime() < Date.now(),
    };
  }

  if (!['resolved', 'closed'].includes(ticket.status) && ticket.resolutionDeadline) {
    return {
      label: 'Resolve by',
      value: ticket.resolutionDeadline,
      overdue: new Date(ticket.resolutionDeadline).getTime() < Date.now(),
    };
  }

  return null;
}

export default function TechDeckTicketQueue({
  tenantKey,
  currentUserId,
  canManageTickets,
}: TechDeckTicketQueueProps) {
  const [tickets, setTickets] = useState<TechDeckTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ ticketId?: string; message: string } | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TechDeckTicketStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TechDeckTicketPriority | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setActionError(null);

    moduleShellApi.techdeck.list()
      .then((response) => {
        if (!cancelled) setTickets(Array.isArray(response?.tickets) ? response.tickets : []);
      })
      .catch((requestError) => {
        if (!cancelled) setLoadError(errorMessage(requestError, 'Could not load the technician ticket queue.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantKey, reloadVersion]);

  const visibleTickets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
      if (assignmentFilter === 'mine' && ticket.assignedToUserId !== currentUserId) return false;
      if (assignmentFilter === 'unassigned' && ticket.assignedToUserId !== null) return false;
      if (!needle) return true;
      return [String(ticket.number), ticket.title, ticket.description]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [assignmentFilter, currentUserId, priorityFilter, search, statusFilter, tickets]);

  const metrics = useMemo(() => ({
    active: tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length,
    critical: tickets.filter((ticket) => ticket.priority === 'critical' && !['resolved', 'closed'].includes(ticket.status)).length,
    mine: tickets.filter((ticket) => ticket.assignedToUserId === currentUserId && !['resolved', 'closed'].includes(ticket.status)).length,
    overdue: tickets.filter((ticket) => ticketDeadline(ticket)?.overdue).length,
  }), [currentUserId, tickets]);

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssignmentFilter('all');
  }

  async function createTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !form.title.trim()) return;

    const responseDeadline = toIso(form.responseDeadline);
    const resolutionDeadline = toIso(form.resolutionDeadline);
    if (responseDeadline && resolutionDeadline && new Date(responseDeadline) > new Date(resolutionDeadline)) {
      setActionError({ message: 'The response deadline must be before the resolution deadline.' });
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      const created = await moduleShellApi.techdeck.create({
        title: form.title,
        description: form.description,
        priority: form.priority,
        assignedToUserId: form.assignToMe ? currentUserId : null,
        responseDeadline,
        resolutionDeadline,
      });
      setTickets((current) => [created, ...current]);
      setForm(initialForm);
    } catch (requestError) {
      setActionError({ message: errorMessage(requestError, 'Could not create the ticket.') });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(ticket: TechDeckTicket, status: TechDeckTicketStatus) {
    if (ticket.status === status || updatingId) return;
    setUpdatingId(ticket.id);
    setActionError(null);
    try {
      const updated = await moduleShellApi.techdeck.updateStatus(ticket.id, status);
      setTickets((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setActionError({
        ticketId: ticket.id,
        message: errorMessage(requestError, 'Could not update the ticket status.'),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function updatePriority(ticket: TechDeckTicket, priority: TechDeckTicketPriority) {
    if (ticket.priority === priority || updatingId) return;
    setUpdatingId(ticket.id);
    setActionError(null);
    try {
      const updated = await moduleShellApi.techdeck.update(ticket.id, { priority });
      setTickets((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setActionError({
        ticketId: ticket.id,
        message: errorMessage(requestError, 'Could not update the ticket priority.'),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateAssignment(ticket: TechDeckTicket) {
    if (updatingId) return;
    setUpdatingId(ticket.id);
    setActionError(null);
    const assignedToUserId = ticket.assignedToUserId === currentUserId ? null : currentUserId;
    try {
      const updated = await moduleShellApi.techdeck.update(ticket.id, { assignedToUserId });
      setTickets((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setActionError({
        ticketId: ticket.id,
        message: errorMessage(requestError, 'Could not update the ticket assignment.'),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function archiveTicket(ticket: TechDeckTicket) {
    if (updatingId || !canManageTickets) return;
    const confirmed = window.confirm(`Archive TechDeck ticket #${ticket.number}: ${ticket.title}?`);
    if (!confirmed) return;

    setUpdatingId(ticket.id);
    setActionError(null);
    try {
      await moduleShellApi.techdeck.delete(ticket.id);
      setTickets((current) => current.filter((item) => item.id !== ticket.id));
    } catch (requestError) {
      setActionError({
        ticketId: ticket.id,
        message: errorMessage(requestError, 'Could not archive the ticket.'),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section id="techdeck-tickets" className="techdeck-panel techdeck-ticket-queue" data-testid="techdeck-ticket-queue">
      <style>{ticketQueueCss}</style>

      <div className="techdeck-ticket-heading">
        <div>
          <div className="techdeck-ticket-eyebrow">Live tenant workflow</div>
          <h2>Technician Ticket Queue</h2>
          <p>
            Triage, prioritize, assign, and close tenant support work. OperatorOS owns identity, module access, and the active tenant boundary.
          </p>
        </div>
        <div className="techdeck-ticket-metrics" aria-label="Ticket queue summary">
          <Metric label="Active" value={String(metrics.active)} />
          <Metric label="Critical" value={String(metrics.critical)} />
          <Metric label="Assigned to me" value={String(metrics.mine)} />
          <Metric label="Overdue" value={String(metrics.overdue)} />
        </div>
      </div>

      {loadError && (
        <div className="techdeck-ticket-error" role="alert" data-testid="techdeck-ticket-error">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Ticket queue unavailable</strong>
            <span>{loadError}</span>
          </div>
          <button type="button" onClick={() => setReloadVersion((current) => current + 1)}>
            <RefreshCw size={15} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <form className="techdeck-ticket-form" onSubmit={createTicket} data-testid="techdeck-ticket-create-form">
        <div className="techdeck-ticket-form-title">
          <Plus size={17} aria-hidden="true" />
          <strong>Open a technician ticket</strong>
          <span>Tenant, creator, and access are assigned by OperatorOS.</span>
        </div>

        {actionError && !actionError.ticketId && (
          <div className="techdeck-ticket-inline-error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            {actionError.message}
          </div>
        )}

        <label className="techdeck-ticket-form-wide">
          <span>Title *</span>
          <input
            ref={titleInputRef}
            required
            maxLength={180}
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Workstation offline after security update"
            data-testid="techdeck-ticket-title"
          />
        </label>
        <label>
          <span>Priority</span>
          <select
            value={form.priority}
            onChange={(event) => setForm((current) => ({
              ...current,
              priority: event.target.value as TechDeckTicketPriority,
            }))}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Response deadline</span>
          <input
            type="datetime-local"
            value={form.responseDeadline}
            onChange={(event) => setForm((current) => ({ ...current, responseDeadline: event.target.value }))}
          />
        </label>
        <label>
          <span>Resolution deadline</span>
          <input
            type="datetime-local"
            value={form.resolutionDeadline}
            onChange={(event) => setForm((current) => ({ ...current, resolutionDeadline: event.target.value }))}
          />
        </label>
        <label className="techdeck-ticket-form-wide">
          <span>Description</span>
          <textarea
            maxLength={6000}
            rows={3}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Symptoms, impact, troubleshooting already completed, and the next useful action."
          />
        </label>
        <label className="techdeck-ticket-self-assign">
          <input
            type="checkbox"
            checked={form.assignToMe}
            onChange={(event) => setForm((current) => ({ ...current, assignToMe: event.target.checked }))}
          />
          <span>Assign this ticket to me</span>
        </label>
        <div className="techdeck-ticket-form-action">
          <button type="submit" disabled={submitting || !form.title.trim()} data-testid="techdeck-ticket-create">
            <Plus size={16} aria-hidden="true" />
            {submitting ? 'Opening ticket…' : 'Open ticket'}
          </button>
        </div>
      </form>

      <div className="techdeck-ticket-toolbar" aria-label="Ticket filters">
        <label className="techdeck-ticket-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search tickets</span>
          <input
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ticket number, title, or description"
            data-testid="techdeck-ticket-search"
          />
        </label>
        <label>
          <span className="sr-only">Filter tickets by status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TechDeckTicketStatus | 'all')}
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter tickets by priority</span>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TechDeckTicketPriority | 'all')}
          >
            <option value="all">All priorities</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter tickets by assignment</span>
          <select
            value={assignmentFilter}
            onChange={(event) => setAssignmentFilter(event.target.value as AssignmentFilter)}
          >
            <option value="all">All assignments</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="techdeck-ticket-list" aria-busy="true" data-testid="techdeck-ticket-loading">
          {[1, 2, 3].map((item) => (
            <div className="techdeck-ticket-skeleton" key={item} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ))}
          <span className="sr-only">Loading tenant tickets…</span>
        </div>
      ) : !loadError && visibleTickets.length === 0 ? (
        <div className="techdeck-ticket-empty" data-testid="techdeck-ticket-empty">
          <TicketCheck size={22} aria-hidden="true" />
          <div>
            <strong>{tickets.length === 0 ? 'No technician tickets yet' : 'No tickets match this view'}</strong>
            <span>
              {tickets.length === 0
                ? 'Open the first tenant ticket and assign clear ownership.'
                : 'Clear the current search and filters to restore the full queue.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (tickets.length === 0) titleInputRef.current?.focus();
              else clearFilters();
            }}
          >
            {tickets.length === 0 ? 'Create first ticket' : 'Clear filters'}
          </button>
        </div>
      ) : !loadError ? (
        <div className="techdeck-ticket-list" data-testid="techdeck-ticket-list">
          {visibleTickets.map((ticket) => {
            const deadline = ticketDeadline(ticket);
            const isMine = ticket.assignedToUserId === currentUserId;
            const assignmentOwnedByAnother = ticket.assignedToUserId !== null && !isMine;
            const canChangeAssignment = !assignmentOwnedByAnother || canManageTickets;
            const isUpdating = updatingId === ticket.id;
            return (
              <article className="techdeck-ticket-card" key={ticket.id} data-testid={`techdeck-ticket-${ticket.id}`}>
                <div className="techdeck-ticket-card-main">
                  <div className="techdeck-ticket-card-flags">
                    <span className={`techdeck-ticket-priority techdeck-ticket-priority-${ticket.priority}`}>
                      {priorityLabel(ticket.priority)}
                    </span>
                    <span className={`techdeck-ticket-status-pill techdeck-ticket-status-${ticket.status}`}>
                      {statusLabel(ticket.status)}
                    </span>
                  </div>
                  <h3><span>#{ticket.number}</span> {ticket.title}</h3>
                  <p>{ticket.description || 'No diagnostic notes have been added.'}</p>
                  <div className="techdeck-ticket-context">
                    <span>
                      {isMine ? <UserCheck size={14} aria-hidden="true" /> : <UserMinus size={14} aria-hidden="true" />}
                      {isMine ? 'Assigned to you' : ticket.assignedToUserId ? 'Assigned to another technician' : 'Unassigned'}
                    </span>
                    <span>
                      <CalendarClock size={14} aria-hidden="true" />
                      Opened {formatDate(ticket.createdAt)}
                    </span>
                    {deadline ? (
                      <span className={deadline.overdue ? 'techdeck-ticket-overdue' : undefined}>
                        <CalendarClock size={14} aria-hidden="true" />
                        {deadline.overdue ? 'Overdue' : deadline.label} {formatDate(deadline.value)}
                      </span>
                    ) : (
                      <span>
                        <CheckCircle2 size={14} aria-hidden="true" />
                        {ticket.status === 'resolved' || ticket.status === 'closed' ? 'SLA work completed' : 'No active SLA deadline'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="techdeck-ticket-card-controls">
                  <label>
                    <span>Status</span>
                    <select
                      value={ticket.status}
                      disabled={Boolean(updatingId)}
                      onChange={(event) => updateStatus(ticket, event.target.value as TechDeckTicketStatus)}
                      data-testid={`techdeck-ticket-status-${ticket.id}`}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Priority</span>
                    <select
                      value={ticket.priority}
                      disabled={Boolean(updatingId)}
                      onChange={(event) => updatePriority(ticket, event.target.value as TechDeckTicketPriority)}
                      data-testid={`techdeck-ticket-priority-${ticket.id}`}
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={Boolean(updatingId) || !canChangeAssignment}
                    onClick={() => updateAssignment(ticket)}
                    data-testid={`techdeck-ticket-assignment-${ticket.id}`}
                  >
                    {isMine ? <UserMinus size={15} aria-hidden="true" /> : <UserCheck size={15} aria-hidden="true" />}
                    {isUpdating
                      ? 'Updating…'
                      : isMine
                        ? 'Unassign me'
                        : assignmentOwnedByAnother && !canManageTickets
                          ? 'Assigned'
                          : 'Assign to me'}
                  </button>
                  {canManageTickets && (
                    <button
                      type="button"
                      className="techdeck-ticket-archive"
                      disabled={Boolean(updatingId)}
                      onClick={() => archiveTicket(ticket)}
                      data-testid={`techdeck-ticket-archive-${ticket.id}`}
                    >
                      <Archive size={15} aria-hidden="true" />
                      {isUpdating ? 'Working…' : 'Archive'}
                    </button>
                  )}
                </div>

                {actionError?.ticketId === ticket.id && (
                  <div className="techdeck-ticket-inline-error" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    {actionError.message}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const ticketQueueCss = `
  .techdeck-ticket-queue { padding: 18px; display: grid; gap: 16px; }
  .techdeck-ticket-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 16px; }
  .techdeck-ticket-heading h2 { margin: 4px 0 0; color: #e5eefc; font-size: 20px; text-wrap: balance; }
  .techdeck-ticket-heading p { margin: 6px 0 0; max-width: 720px; color: #8fa3bd; font-size: 13px; line-height: 1.5; text-wrap: pretty; }
  .techdeck-ticket-eyebrow { color: #38bdf8; font-size: 11px; font-weight: 900; text-transform: uppercase; }
  .techdeck-ticket-metrics { display: grid; grid-template-columns: repeat(4, minmax(82px, auto)); gap: 8px; }
  .techdeck-ticket-metrics > div { border: 1px solid rgba(56,189,248,.2); border-radius: 7px; padding: 9px 11px; background: #080d16; display: grid; gap: 2px; }
  .techdeck-ticket-metrics span { color: #8fa3bd; font-size: 10px; text-transform: uppercase; font-weight: 800; }
  .techdeck-ticket-metrics strong { color: #e5eefc; font-size: 14px; font-variant-numeric: tabular-nums; }
  .techdeck-ticket-error { border: 1px solid rgba(239,68,68,.38); background: rgba(127,29,29,.2); color: #fecaca; border-radius: 7px; padding: 11px 12px; display: flex; gap: 10px; align-items: center; font-size: 13px; }
  .techdeck-ticket-error > div { flex: 1; display: grid; gap: 3px; }
  .techdeck-ticket-error span { color: #fca5a5; }
  .techdeck-ticket-error button, .techdeck-ticket-empty button { border: 1px solid rgba(56,189,248,.3); background: #101826; color: #e5eefc; border-radius: 6px; padding: 8px 10px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: inherit; font-weight: 800; cursor: pointer; }
  .techdeck-ticket-form { border: 1px solid rgba(56,189,248,.26); background: #080d16; border-radius: 8px; padding: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
  .techdeck-ticket-form-title { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; color: #e5eefc; }
  .techdeck-ticket-form-title > svg { color: #38bdf8; }
  .techdeck-ticket-form-title span { color: #8fa3bd; font-size: 12px; margin-left: auto; }
  .techdeck-ticket-form label, .techdeck-ticket-toolbar label, .techdeck-ticket-card-controls label { display: grid; gap: 5px; min-width: 0; }
  .techdeck-ticket-form label > span, .techdeck-ticket-card-controls label > span { color: #8fa3bd; font-size: 11px; font-weight: 800; }
  .techdeck-ticket-form input, .techdeck-ticket-form select, .techdeck-ticket-form textarea, .techdeck-ticket-toolbar input, .techdeck-ticket-toolbar select, .techdeck-ticket-card-controls select { width: 100%; box-sizing: border-box; border: 1px solid rgba(148,163,184,.24); background: #101826; color: #e5eefc; border-radius: 6px; padding: 9px 10px; color-scheme: dark; font: inherit; font-size: 13px; }
  .techdeck-ticket-form input:focus, .techdeck-ticket-form select:focus, .techdeck-ticket-form textarea:focus, .techdeck-ticket-toolbar input:focus, .techdeck-ticket-toolbar select:focus, .techdeck-ticket-card-controls select:focus, .techdeck-ticket-card-controls button:focus-visible, .techdeck-ticket-error button:focus-visible, .techdeck-ticket-empty button:focus-visible { outline: 2px solid rgba(56,189,248,.46); outline-offset: 1px; border-color: #38bdf8; }
  .techdeck-ticket-form textarea { resize: vertical; }
  .techdeck-ticket-form-wide { grid-column: span 2; }
  .techdeck-ticket-inline-error { grid-column: 1 / -1; border: 1px solid rgba(239,68,68,.32); background: rgba(127,29,29,.18); color: #fecaca; border-radius: 6px; padding: 9px 10px; display: flex; gap: 8px; align-items: center; font-size: 12px; }
  .techdeck-ticket-self-assign { display: flex !important; align-items: center; align-self: end; grid-template-columns: auto 1fr; min-height: 38px; }
  .techdeck-ticket-self-assign input { width: 16px; height: 16px; padding: 0; accent-color: #38bdf8; }
  .techdeck-ticket-self-assign span { color: #c4d3e7 !important; font-size: 12px !important; }
  .techdeck-ticket-form-action { display: flex; align-items: end; }
  .techdeck-ticket-form-action button { width: 100%; min-height: 38px; border: 0; border-radius: 6px; background: #0284c7; color: #fff; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: inherit; font-weight: 800; cursor: pointer; }
  .techdeck-ticket-form-action button:disabled, .techdeck-ticket-card-controls button:disabled, .techdeck-ticket-card-controls select:disabled { opacity: .55; cursor: not-allowed; }
  .techdeck-ticket-toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) repeat(3, minmax(145px, auto)); gap: 10px; }
  .techdeck-ticket-search { position: relative; }
  .techdeck-ticket-search > svg { position: absolute; top: 10px; left: 10px; color: #8fa3bd; z-index: 1; }
  .techdeck-ticket-search input { padding-left: 34px; }
  .techdeck-ticket-list { display: grid; gap: 9px; }
  .techdeck-ticket-card { border: 1px solid rgba(148,163,184,.18); border-radius: 8px; background: #0b111d; padding: 13px; display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 14px; align-items: start; }
  .techdeck-ticket-card-main { min-width: 0; }
  .techdeck-ticket-card-flags { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .techdeck-ticket-priority, .techdeck-ticket-status-pill { display: inline-flex; width: fit-content; border-radius: 999px; padding: 3px 7px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .techdeck-ticket-priority { color: #bae6fd; background: rgba(2,132,199,.2); }
  .techdeck-ticket-priority-critical { color: #fecaca; background: rgba(220,38,38,.22); }
  .techdeck-ticket-priority-high { color: #fed7aa; background: rgba(234,88,12,.22); }
  .techdeck-ticket-priority-low { color: #bbf7d0; background: rgba(22,163,74,.2); }
  .techdeck-ticket-status-pill { color: #cbd5e1; background: rgba(100,116,139,.22); }
  .techdeck-ticket-status-in_progress { color: #bae6fd; background: rgba(2,132,199,.2); }
  .techdeck-ticket-status-waiting_on_client { color: #fde68a; background: rgba(202,138,4,.2); }
  .techdeck-ticket-status-resolved, .techdeck-ticket-status-closed { color: #bbf7d0; background: rgba(22,163,74,.2); }
  .techdeck-ticket-card h3 { margin: 8px 0 0; color: #e5eefc; font-size: 15px; line-height: 1.35; overflow-wrap: anywhere; text-wrap: balance; }
  .techdeck-ticket-card h3 span { color: #38bdf8; font-variant-numeric: tabular-nums; }
  .techdeck-ticket-card p { margin: 6px 0 0; color: #8fa3bd; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
  .techdeck-ticket-context { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px 14px; color: #8fa3bd; font-size: 11px; }
  .techdeck-ticket-context span { display: inline-flex; align-items: center; gap: 5px; }
  .techdeck-ticket-context .techdeck-ticket-overdue { color: #fca5a5; font-weight: 800; }
  .techdeck-ticket-card-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .techdeck-ticket-card-controls button { min-height: 35px; border: 1px solid rgba(56,189,248,.24); background: #101826; color: #c4d3e7; border-radius: 6px; padding: 7px 9px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
  .techdeck-ticket-card-controls .techdeck-ticket-archive { color: #fca5a5; border-color: rgba(239,68,68,.28); }
  .techdeck-ticket-card > .techdeck-ticket-inline-error { grid-column: 1 / -1; }
  .techdeck-ticket-empty { border: 1px dashed rgba(56,189,248,.3); border-radius: 8px; min-height: 108px; padding: 16px; display: flex; align-items: center; justify-content: center; gap: 12px; color: #8fa3bd; font-size: 13px; }
  .techdeck-ticket-empty > svg { color: #38bdf8; }
  .techdeck-ticket-empty > div { flex: 1; display: grid; gap: 4px; }
  .techdeck-ticket-empty strong { color: #e5eefc; }
  .techdeck-ticket-empty span { display: block; }
  .techdeck-ticket-skeleton { border: 1px solid rgba(148,163,184,.14); border-radius: 8px; background: #0b111d; min-height: 92px; padding: 14px; display: grid; align-content: center; gap: 9px; }
  .techdeck-ticket-skeleton span { display: block; height: 10px; border-radius: 4px; background: #1d2939; }
  .techdeck-ticket-skeleton span:first-child { width: 24%; }
  .techdeck-ticket-skeleton span:nth-child(2) { width: 66%; }
  .techdeck-ticket-skeleton span:last-child { width: 42%; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  @media (max-width: 1000px) {
    .techdeck-ticket-heading { grid-template-columns: 1fr; }
    .techdeck-ticket-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .techdeck-ticket-toolbar { grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(125px, auto)); }
    .techdeck-ticket-card { grid-template-columns: 1fr; }
    .techdeck-ticket-card-controls { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 700px) {
    .techdeck-ticket-queue { padding: 14px; }
    .techdeck-ticket-form { grid-template-columns: 1fr; }
    .techdeck-ticket-form-wide { grid-column: auto; }
    .techdeck-ticket-form-title { align-items: flex-start; flex-wrap: wrap; }
    .techdeck-ticket-form-title span { width: 100%; margin-left: 25px; }
    .techdeck-ticket-toolbar { grid-template-columns: 1fr; }
    .techdeck-ticket-card-controls { grid-template-columns: 1fr 1fr; }
    .techdeck-ticket-empty { align-items: flex-start; flex-wrap: wrap; }
    .techdeck-ticket-empty > div { min-width: calc(100% - 42px); }
    .techdeck-ticket-empty button { width: 100%; }
  }
  @media (max-width: 480px) {
    .techdeck-ticket-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .techdeck-ticket-card-controls { grid-template-columns: 1fr; }
  }
`;
