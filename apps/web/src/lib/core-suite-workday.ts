import type {
  PulseDeskServiceDashboard,
  PulseDeskServiceTicket,
  TechDeckTicket,
  TechDeckWorkspaceResponse,
  TradeFlowKitOperationsResponse,
  TradeFlowKitRevenueResponse,
} from './auth';

export type WorkdaySeverity = 'critical' | 'attention' | 'steady';

export interface WorkdayAction {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  severity: WorkdaySeverity;
}

export interface WorkdayMetric {
  label: string;
  value: string;
  detail: string;
  severity: WorkdaySeverity;
}

export interface WorkdayAutomation {
  label: string;
  detail: string;
  href: string;
}

export interface WorkdayBrief {
  state: 'setup' | 'active' | 'clear';
  title: string;
  summary: string;
  metrics: WorkdayMetric[];
  actions: WorkdayAction[];
  primaryAction: { label: string; href: string };
  setupSteps: Array<{ label: string; detail: string; href: string }>;
  automations: WorkdayAutomation[];
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function money(cents: number): string {
  return currency.format(cents / 100);
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value: string | null | undefined): string {
  const parsed = timestamp(value);
  if (parsed === null) return 'no deadline recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

function numberLabel(value: number | null | undefined, fallback: string): string {
  return value === null || value === undefined ? fallback : `#${value}`;
}

function take(actions: WorkdayAction[]): WorkdayAction[] {
  const rank: Record<WorkdaySeverity, number> = { critical: 0, attention: 1, steady: 2 };
  return actions.sort((left, right) => rank[left.severity] - rank[right.severity]).slice(0, 6);
}

export function buildTradeFlowKitWorkday(
  operations: TradeFlowKitOperationsResponse,
  revenue: TradeFlowKitRevenueResponse,
  now = Date.now(),
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const activeTasks = operations.tasks.filter(task => !['completed', 'canceled'].includes(task.status));
  const overdueTasks = activeTasks.filter(task => {
    const dueAt = timestamp(task.dueAt);
    return dueAt !== null && dueAt < now;
  });
  const blockedTasks = activeTasks.filter(task => task.status === 'blocked');
  const openInvoices = revenue.invoices.filter(invoice => invoice.balanceCents > 0 && !['paid', 'void', 'canceled'].includes(invoice.status));
  const overdueInvoices = openInvoices.filter(invoice => {
    const dueAt = timestamp(invoice.dueDate);
    return dueAt !== null && dueAt < now;
  });
  const invoicedQuoteIds = new Set(revenue.invoices.map(invoice => invoice.sourceQuoteId).filter(Boolean));
  const acceptedQuotes = revenue.quotes.filter(quote => quote.status === 'accepted' && !invoicedQuoteIds.has(quote.id));
  const invoicedJobIds = new Set(revenue.invoices.map(invoice => invoice.jobId).filter(Boolean));
  const finishedJobs = revenue.jobs.filter(job => ['done', 'completed'].includes(job.status) && !invoicedJobIds.has(job.id));

  for (const invoice of overdueInvoices) {
    actions.push({
      id: `invoice-${invoice.id}`,
      eyebrow: 'Collect cash',
      title: `Invoice ${numberLabel(invoice.number, 'draft')} is overdue`,
      detail: `${money(invoice.balanceCents)} still open · due ${dateLabel(invoice.dueDate)}`,
      href: `/invoices/${invoice.id}`,
      severity: 'critical',
    });
  }
  for (const quote of acceptedQuotes) {
    actions.push({
      id: `quote-${quote.id}`,
      eyebrow: 'Close the handoff',
      title: `Accepted quote ${numberLabel(quote.number, 'draft')} is ready to invoice`,
      detail: `${money(quote.totalCents)} accepted · invoice from the quote to preserve the audit trail`,
      href: `/quotes/${quote.id}`,
      severity: 'attention',
    });
  }
  for (const job of finishedJobs) {
    actions.push({
      id: `job-${job.id}`,
      eyebrow: 'Protect revenue',
      title: `${job.title} is finished but not invoiced`,
      detail: `Job ${numberLabel(job.number, 'without a number')} · review the work before billing`,
      href: `/jobs/${job.id}`,
      severity: 'attention',
    });
  }
  for (const task of overdueTasks) {
    actions.push({
      id: `task-overdue-${task.id}`,
      eyebrow: 'Delivery risk',
      title: task.title,
      detail: `${task.jobTitle ?? 'Linked job'} · due ${dateLabel(task.dueAt)}`,
      href: `/tasks/${task.id}`,
      severity: task.priority === 'urgent' ? 'critical' : 'attention',
    });
  }
  for (const task of blockedTasks.filter(task => !overdueTasks.some(overdue => overdue.id === task.id))) {
    actions.push({
      id: `task-blocked-${task.id}`,
      eyebrow: 'Unblock work',
      title: task.title,
      detail: `${task.jobTitle ?? 'Linked job'} · marked blocked`,
      href: `/tasks/${task.id}`,
      severity: 'attention',
    });
  }

  const hasRecords = revenue.customers.length + revenue.jobs.length + revenue.quotes.length + revenue.invoices.length + operations.tasks.length + operations.metrics.leads > 0;
  const revenueHandoffs = acceptedQuotes.length + finishedJobs.length;
  const selectedActions = take(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';

  return {
    state,
    title: state === 'setup' ? 'Reach first value in three short steps' : state === 'clear' ? 'Revenue loops are caught up' : 'Revenue Rescue',
    summary: state === 'setup'
      ? 'Start with the records you already have. TradeFlowKit will keep the lead-to-cash trail connected from there.'
      : state === 'clear'
        ? 'No overdue invoice, unbilled finished work, accepted-quote handoff, or late task needs attention right now.'
        : `${selectedActions.length} highest-value handoff${selectedActions.length === 1 ? '' : 's'} are ready now. Work top to bottom instead of hunting through menus.`,
    metrics: [
      { label: 'Cash waiting', value: money(Number(operations.metrics.outstanding_cents) || 0), detail: 'Open invoice balance', severity: overdueInvoices.length ? 'critical' : openInvoices.length ? 'attention' : 'steady' },
      { label: 'Revenue handoffs', value: String(revenueHandoffs), detail: 'Accepted or finished, not invoiced', severity: revenueHandoffs ? 'attention' : 'steady' },
      { label: 'Delivery blockers', value: String(new Set([...overdueTasks, ...blockedTasks].map(task => task.id)).size), detail: 'Late or blocked active tasks', severity: overdueTasks.length ? 'critical' : blockedTasks.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Add or import customers', href: '/customers' }
      : selectedActions[0]
        ? { label: 'Open top priority', href: selectedActions[0].href }
        : { label: 'Open lead pipeline', href: '/leads' },
    setupSteps: [
      { label: 'Bring in customers', detail: 'Add one customer or paste a bounded CSV import.', href: '/customers' },
      { label: 'Create the next paid step', detail: 'Start a quote or a customer job with only the essentials.', href: '/quotes/new' },
      { label: 'Remove repeat admin', detail: 'Turn repeat service into audited recurring jobs.', href: '/recurring-jobs' },
    ],
    automations: [
      { label: 'Automate repeat work', detail: 'Schedule recurring jobs with a customer, owner, next run, and pause control.', href: '/recurring-jobs' },
      { label: 'Reduce follow-up gaps', detail: 'Use consent-aware lead templates and reviewed follow-up scheduling.', href: '/leads' },
    ],
  };
}

export function buildTechDeckWorkday(
  workspace: TechDeckWorkspaceResponse,
  tickets: TechDeckTicket[],
  now = Date.now(),
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const openTickets = tickets.filter(ticket => !['resolved', 'closed'].includes(ticket.status));
  const overdueTickets = openTickets.filter(ticket => {
    const dueAt = timestamp(ticket.resolutionDeadline);
    return dueAt !== null && dueAt < now;
  });
  const urgentUnassigned = openTickets.filter(ticket => !ticket.assignedToUserId && ['critical', 'high'].includes(ticket.priority));
  const riskyAssets = workspace.configurationItems.filter(asset => ['critical', 'offline'].includes(asset.health));
  const reviewDocuments = workspace.documents.filter(document => ['draft', 'in_review', 'approved'].includes(document.status));

  for (const ticket of overdueTickets) {
    actions.push({
      id: `ticket-overdue-${ticket.id}`,
      eyebrow: 'SLA exposure',
      title: `${numberLabel(ticket.number, 'Ticket')} · ${ticket.title}`,
      detail: `${ticket.priority} priority · resolution target ${dateLabel(ticket.resolutionDeadline)}`,
      href: `/tickets/${ticket.id}`,
      severity: 'critical',
    });
  }
  for (const ticket of urgentUnassigned.filter(ticket => !overdueTickets.some(overdue => overdue.id === ticket.id))) {
    actions.push({
      id: `ticket-unassigned-${ticket.id}`,
      eyebrow: 'Dispatch now',
      title: `${numberLabel(ticket.number, 'Ticket')} · ${ticket.title}`,
      detail: `${ticket.priority} priority · no technician assigned`,
      href: `/tickets/${ticket.id}`,
      severity: ticket.priority === 'critical' ? 'critical' : 'attention',
    });
  }
  for (const asset of riskyAssets) {
    actions.push({
      id: `asset-risk-${asset.id}`,
      eyebrow: 'Technical risk',
      title: asset.name,
      detail: `${asset.health} · ${asset.type.replaceAll('_', ' ')} · open the evidence-linked record`,
      href: `/assets/${asset.id}`,
      severity: asset.health === 'offline' ? 'critical' : 'attention',
    });
  }
  for (const asset of workspace.lifecycleDue.filter(asset => !riskyAssets.some(risky => risky.id === asset.id))) {
    actions.push({
      id: `asset-lifecycle-${asset.id}`,
      eyebrow: 'Lifecycle due',
      title: asset.name,
      detail: `${asset.type.replaceAll('_', ' ')} · renewal, expiration, or warranty attention`,
      href: `/assets/${asset.id}`,
      severity: 'attention',
    });
  }
  for (const document of reviewDocuments.slice(0, 2)) {
    actions.push({
      id: `document-${document.id}`,
      eyebrow: document.status === 'draft' ? 'Finish the procedure' : 'Review queue',
      title: document.title,
      detail: `${document.pageType.replaceAll('_', ' ')} · ${document.status.replaceAll('_', ' ')} · version ${document.version}`,
      href: document.pageType === 'runbook' ? `/runbooks/${document.id}` : `/documentation/${document.id}`,
      severity: 'steady',
    });
  }

  const hasRecords = tickets.length + workspace.configurationItems.length + workspace.documents.length + workspace.evidence.length > 0;
  const selectedActions = take(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';
  const criticalRisk = new Set([
    ...overdueTickets.map(row => `ticket:${row.id}`),
    ...urgentUnassigned.filter(row => row.priority === 'critical').map(row => `ticket:${row.id}`),
    ...riskyAssets.map(row => `asset:${row.id}`),
  ]).size;

  return {
    state,
    title: state === 'setup' ? 'Stand up the service desk without a consulting project' : state === 'clear' ? 'No urgent technical risk is waiting' : 'Risk-to-Proof Brief',
    summary: state === 'setup'
      ? 'Start with one client, one managed item, and one real ticket. Add depth only when the work calls for it.'
      : state === 'clear'
        ? 'No overdue ticket, unassigned urgent request, critical asset, lifecycle deadline, or document review is currently waiting.'
        : `${selectedActions.length} ranked service risks connect directly to the ticket, configuration, or documentation record needed to act and prove the work.`,
    metrics: [
      { label: 'Open tickets', value: String(openTickets.length), detail: 'Not resolved or closed', severity: overdueTickets.length ? 'critical' : openTickets.length ? 'attention' : 'steady' },
      { label: 'Critical risk', value: String(criticalRisk), detail: 'SLA, dispatch, or asset exposure', severity: criticalRisk ? 'critical' : 'steady' },
      { label: 'Review queue', value: String(reviewDocuments.length), detail: 'Procedures awaiting publication', severity: reviewDocuments.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Add a managed client', href: '/clients' }
      : selectedActions[0]
        ? { label: 'Open top risk', href: selectedActions[0].href }
        : { label: 'Open ticket queue', href: '/tickets' },
    setupSteps: [
      { label: 'Add a managed client', detail: 'Reuse the shared organization and site directory.', href: '/clients' },
      { label: 'Record what you support', detail: 'Add the first server, network item, application, or credential reference.', href: '/assets' },
      { label: 'Work one real request', detail: 'Open a ticket and keep ownership, time, notes, and evidence together.', href: '/tickets' },
    ],
    automations: [
      { label: 'Schedule repeat service', detail: 'Use recurring ticket templates and appointments for routine maintenance.', href: '/calendar' },
      { label: 'Package proof automatically', detail: 'Create deterministic compliance and evidence exports without remote execution.', href: '/compliance' },
    ],
  };
}

export function buildPulseDeskWorkday(
  dashboard: PulseDeskServiceDashboard,
  tickets: PulseDeskServiceTicket[],
  canManage: boolean,
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const openTickets = tickets.filter(ticket => !['resolved', 'closed'].includes(ticket.status));
  const overdue = openTickets.filter(ticket => ticket.sla.state === 'overdue');
  const atRisk = openTickets.filter(ticket => ticket.sla.state === 'at_risk');
  const urgentUnassigned = openTickets.filter(ticket => !ticket.assignedToUserId && ['critical', 'high'].includes(ticket.priority));

  for (const ticket of overdue) {
    actions.push({
      id: `request-overdue-${ticket.id}`,
      eyebrow: 'SLA overdue',
      title: `${ticket.humanId} · ${ticket.summary}`,
      detail: `${ticket.priority} priority · ${ticket.locationLabel ?? 'no operational location recorded'}`,
      href: `/requests/${ticket.id}`,
      severity: 'critical',
    });
  }
  for (const ticket of atRisk.filter(ticket => !overdue.some(overdueTicket => overdueTicket.id === ticket.id))) {
    actions.push({
      id: `request-risk-${ticket.id}`,
      eyebrow: 'Prevent a miss',
      title: `${ticket.humanId} · ${ticket.summary}`,
      detail: `${ticket.priority} priority · SLA is at risk`,
      href: `/requests/${ticket.id}`,
      severity: 'attention',
    });
  }
  for (const ticket of urgentUnassigned.filter(ticket => ![...overdue, ...atRisk].some(risk => risk.id === ticket.id))) {
    actions.push({
      id: `request-unassigned-${ticket.id}`,
      eyebrow: 'Route the work',
      title: `${ticket.humanId} · ${ticket.summary}`,
      detail: `${ticket.priority} priority · no operational owner assigned`,
      href: `/requests/${ticket.id}`,
      severity: ticket.priority === 'critical' ? 'critical' : 'attention',
    });
  }
  if (dashboard.metrics.pendingSupplyRequests > 0) {
    actions.push({
      id: 'pending-supplies',
      eyebrow: 'Supply pressure',
      title: `${dashboard.metrics.pendingSupplyRequests} supply request${dashboard.metrics.pendingSupplyRequests === 1 ? '' : 's'} waiting`,
      detail: 'Review operational demand before it becomes an escalation.',
      href: '/operations',
      severity: 'attention',
    });
  }
  if (dashboard.metrics.openFacilityRequests > 0) {
    actions.push({
      id: 'facility-requests',
      eyebrow: 'Facility pressure',
      title: `${dashboard.metrics.openFacilityRequests} facility request${dashboard.metrics.openFacilityRequests === 1 ? '' : 's'} open`,
      detail: 'Coordinate facilities, vendors, locations, and linked requests from one operational view.',
      href: '/operations',
      severity: 'attention',
    });
  }

  const selectedActions = take(actions);
  const hasRecords = dashboard.metrics.tickets + dashboard.metrics.operationalAssets + dashboard.metrics.pendingSupplyRequests + dashboard.metrics.openFacilityRequests > 0;
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';

  return {
    state,
    title: state === 'setup' ? 'Start operational coordination in minutes' : state === 'clear' ? 'Operations are inside their current guardrails' : 'Operational Pulse',
    summary: state === 'setup'
      ? 'Capture one PHI-minimized request, route it to an accountable team, and add an SLA only where the operation needs one.'
      : state === 'clear'
        ? 'No overdue, at-risk, unassigned urgent, supply, or facility pressure needs immediate coordination.'
        : `${selectedActions.length} operational pressure point${selectedActions.length === 1 ? '' : 's'} are ranked without exposing patient charts or clinical details.`,
    metrics: [
      { label: 'Open requests', value: String(dashboard.metrics.openTickets), detail: 'Operational work in progress', severity: dashboard.metrics.openTickets ? 'attention' : 'steady' },
      { label: 'SLA pressure', value: String(dashboard.metrics.atRisk + dashboard.metrics.overdue), detail: 'At risk or overdue', severity: dashboard.metrics.overdue ? 'critical' : dashboard.metrics.atRisk ? 'attention' : 'steady' },
      { label: 'Urgent unassigned', value: String(urgentUnassigned.length), detail: 'Critical or high without an owner', severity: urgentUnassigned.some(ticket => ticket.priority === 'critical') ? 'critical' : urgentUnassigned.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Submit the first request', href: '/requests' }
      : selectedActions[0]
        ? { label: 'Open top pressure point', href: selectedActions[0].href }
        : { label: 'Open request queue', href: '/requests' },
    setupSteps: [
      { label: 'Capture the need', detail: 'Use a short operational summary with no patient data or unnecessary PHI.', href: '/requests' },
      { label: 'Give it an owner', detail: 'Route the request by department, queue, team, and accountable operator.', href: '/assignments' },
      { label: canManage ? 'Set the response guardrail' : 'Review the response guardrail', detail: 'Use elapsed-time SLA targets and notifications instead of memory and inbox hunting.', href: canManage ? '/settings' : '/requests' },
    ],
    automations: [
      canManage
        ? { label: 'Automate intake safely', detail: 'Connect approved mail intake with replay protection, health state, and PHI-minimized summaries.', href: '/inbound' }
        : { label: 'Use one intake queue', detail: 'Submit and track operational work from the shared request queue.', href: '/requests' },
      canManage
        ? { label: 'Prevent SLA surprises', detail: 'Set default response and resolution policies, then let the dashboard rank pressure.', href: '/settings' }
        : { label: 'Coordinate escalations', detail: 'Use the department and escalation view to keep handoffs visible.', href: '/assignments' },
    ],
  };
}
