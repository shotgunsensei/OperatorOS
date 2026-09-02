import type {
  BrandForgeCalendarItem,
  BrandForgeCampaign,
  SnapProofCase,
  SnapProofEvidence,
  SnapProofReport,
} from './auth';
import type { WorkdayAction, WorkdayBrief, WorkdaySeverity } from './core-suite-workday';

type Row = Record<string, any>;

export interface StudyForgeWorkflowWorkspace {
  preferences: Row;
  metrics: {
    activeSets: number;
    totalStudyMinutes: number;
    cardsReviewed: number;
    averageQuizScore: number | null;
    currentStreak: number;
    longestStreak: number;
  };
  sets: Row[];
  countdowns: Row[];
}

export interface DeployOpsWorkflowOverview {
  metrics: { kits: number; archived: number; aiRefined: number };
  kits: Row[];
  exports: Row[];
}

export interface DeployOpsExecutionSummary {
  launches: number;
  launched: number;
  overdue: number;
}

export interface ScriptOpsWorkflowWorkspace {
  metrics: Row;
  syncRuns: Row[];
  recentScripts: Row[];
}

export interface CallCommandWorkflowProduct {
  channels: Row[];
  profiles: Row[];
  flows: Row[];
  calls: Row[];
  tickets: Row[];
  leads: Row[];
  tasks: Row[];
  actionRuns: Row[];
}

const severityRank: Record<WorkdaySeverity, number> = { critical: 0, attention: 1, steady: 2 };

function ranked(actions: WorkdayAction[]): WorkdayAction[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => severityRank[left.action.severity] - severityRank[right.action.severity] || left.index - right.index)
    .slice(0, 6)
    .map(item => item.action);
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value: unknown): string {
  const parsed = timestamp(value);
  if (parsed === null) return 'no date recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

function openStatus(value: unknown): boolean {
  return !['completed', 'resolved', 'closed', 'archived', 'cancelled', 'canceled'].includes(String(value ?? '').toLowerCase());
}

export function buildBrandForgeWorkflowFocus(
  counts: Row,
  campaigns: BrandForgeCampaign[],
  calendar: BrandForgeCalendarItem[],
  now = Date.now(),
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const overdueContent = calendar.filter(item => {
    const scheduledAt = timestamp(item.scheduledAt);
    return scheduledAt !== null && scheduledAt < now && !['published', 'cancelled'].includes(item.status);
  });
  const campaignReviews = campaigns.filter(item => item.status === 'review');
  const lateCampaigns = campaigns.filter(item => {
    const endAt = timestamp(item.endAt);
    return endAt !== null && endAt < now && !['completed', 'archived'].includes(item.status);
  });
  const activeProduction = campaigns.filter(item => ['planning', 'producing', 'scheduled', 'active'].includes(item.status));

  for (const item of overdueContent) {
    actions.push({
      id: `content-${item.id}`,
      eyebrow: 'Publishing gap',
      title: item.title,
      detail: `${item.channel ?? item.itemType} · was scheduled ${dateLabel(item.scheduledAt)} · review before publishing`,
      href: '/calendar',
      severity: 'critical',
    });
  }
  for (const campaign of lateCampaigns) {
    actions.push({
      id: `campaign-late-${campaign.id}`,
      eyebrow: 'Campaign deadline',
      title: campaign.name,
      detail: `${campaign.status} · target ended ${dateLabel(campaign.endAt)} · decide the next reviewed state`,
      href: '/campaigns',
      severity: 'critical',
    });
  }
  for (const campaign of campaignReviews.filter(item => !lateCampaigns.some(late => late.id === item.id))) {
    actions.push({
      id: `campaign-review-${campaign.id}`,
      eyebrow: 'Approval queue',
      title: campaign.name,
      detail: 'Campaign production is waiting for a human review decision.',
      href: '/campaigns',
      severity: 'attention',
    });
  }
  if (activeProduction.length && numeric(counts.calendar_items) === 0) {
    actions.push({
      id: 'campaign-calendar-handoff',
      eyebrow: 'Schedule the work',
      title: `${activeProduction.length} active campaign${activeProduction.length === 1 ? '' : 's'} have no calendar items`,
      detail: 'Turn the approved plan into a visible production schedule.',
      href: '/calendar',
      severity: 'attention',
    });
  }

  const hasRecords = numeric(counts.brands) + numeric(counts.personas) + numeric(counts.campaigns)
    + numeric(counts.copy_assets) + numeric(counts.calendar_items) > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';
  const firstSetupHref = numeric(counts.brands) === 0 ? '/brands' : numeric(counts.personas) === 0 ? '/personas' : '/campaigns';

  return {
    state,
    title: state === 'setup' ? 'Build the first campaign without starting from a blank page' : state === 'clear' ? 'Campaign production is inside its current guardrails' : 'Campaign Flow Brief',
    summary: state === 'setup'
      ? 'Capture one reusable brand kit and audience, then use guided strategy or a template to produce the first campaign.'
      : state === 'clear'
        ? 'No overdue content, late campaign, approval handoff, or unscheduled active campaign needs attention.'
        : `${selectedActions.length} campaign handoff${selectedActions.length === 1 ? '' : 's'} are ranked from the persisted production calendar and review state.`,
    metrics: [
      { label: 'Approval queue', value: String(campaignReviews.length), detail: 'Campaigns awaiting review', severity: campaignReviews.length ? 'attention' : 'steady' },
      { label: 'Past-due content', value: String(overdueContent.length), detail: 'Not published or cancelled', severity: overdueContent.length ? 'critical' : 'steady' },
      { label: 'Active production', value: String(activeProduction.length), detail: 'Planning through active', severity: activeProduction.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: numeric(counts.brands) === 0 ? 'Create the brand kit' : numeric(counts.personas) === 0 ? 'Define the audience' : 'Start the campaign', href: firstSetupHref }
      : selectedActions[0]
        ? { label: 'Open top handoff', href: selectedActions[0].href }
        : { label: 'Open campaigns', href: '/campaigns' },
    setupSteps: [
      { label: 'Save the reusable brand', detail: 'Record voice, colors, guidelines, and approved assets once.', href: '/brands' },
      { label: 'Choose the audience and offer', detail: 'Reuse a persona and offer instead of rewriting the brief.', href: '/personas' },
      { label: 'Generate a controlled plan', detail: 'Start from the provider-aware workflow, then approve the output.', href: '/ai-workflows' },
    ],
    automations: [
      { label: 'Use guided AI workflows', detail: 'Turn the saved brand, audience, offer, and channels into a review-ready campaign plan.', href: '/ai-workflows' },
      { label: 'Let the calendar expose gaps', detail: 'Keep draft, review, schedule, and publish state visible without auto-publishing.', href: '/calendar' },
    ],
  };
}

export function buildSnapProofWorkflowFocus(
  counts: Row,
  cases: SnapProofCase[],
  evidence: SnapProofEvidence[],
  reports: SnapProofReport[],
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const reviewEvidence = evidence.filter(item => item.status === 'in_review');
  const reviewReports = reports.filter(item => item.status === 'in_review');
  const emptyCollectingCases = cases.filter(item => item.status === 'collecting' && item.evidenceCount === 0);

  if (numeric(counts.overdueJobs) > 0) {
    actions.push({ id: 'overdue-jobs', eyebrow: 'Field deadline', title: `${numeric(counts.overdueJobs)} overdue job${numeric(counts.overdueJobs) === 1 ? '' : 's'}`, detail: 'Open the job queue and capture the missing work, cost, or proof state.', href: '/jobs', severity: 'critical' });
  }
  for (const item of reviewEvidence) {
    actions.push({ id: `evidence-review-${item.id}`, eyebrow: 'Proof review', title: item.title, detail: `${item.caseReference ?? 'Evidence case'} · verify or reject the captured evidence`, href: '/review', severity: 'attention' });
  }
  for (const report of reviewReports) {
    actions.push({ id: `report-review-${report.id}`, eyebrow: 'Report approval', title: report.title, detail: `${report.caseReference ?? 'Evidence case'} · approve only after the evidence and findings match`, href: '/review', severity: 'attention' });
  }
  for (const item of emptyCollectingCases) {
    actions.push({ id: `empty-case-${item.id}`, eyebrow: 'Capture proof', title: `${item.reference} · ${item.title}`, detail: 'This collecting case has no evidence attached yet.', href: `/cases/${item.id}`, severity: 'attention' });
  }
  if (numeric(counts.openFindings) > 0) {
    actions.push({ id: 'open-findings', eyebrow: 'Resolve findings', title: `${numeric(counts.openFindings)} open finding${numeric(counts.openFindings) === 1 ? '' : 's'}`, detail: 'Resolve or document each exception before final report approval.', href: '/findings', severity: 'attention' });
  }

  const hasRecords = numeric(counts.customers) + numeric(counts.cases) + numeric(counts.activeJobs) + numeric(counts.evidence) > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';
  const reviewTotal = reviewEvidence.length + reviewReports.length;

  return {
    state,
    title: state === 'setup' ? 'Turn the first job into defensible proof' : state === 'clear' ? 'Proof workflows are caught up' : 'Proof-to-Delivery Brief',
    summary: state === 'setup'
      ? 'Create the customer and job once, capture evidence from the field, then let the review trail carry it into a report.'
      : state === 'clear'
        ? 'No overdue job, empty collecting case, evidence review, report approval, or open finding needs attention.'
        : `${selectedActions.length} proof handoff${selectedActions.length === 1 ? '' : 's'} connect directly to the job, evidence, finding, or review queue.`,
    metrics: [
      { label: 'Overdue jobs', value: String(numeric(counts.overdueJobs)), detail: 'Field work past target', severity: numeric(counts.overdueJobs) ? 'critical' : 'steady' },
      { label: 'Review queue', value: String(reviewTotal), detail: 'Evidence and reports', severity: reviewTotal ? 'attention' : 'steady' },
      { label: 'Open findings', value: String(numeric(counts.openFindings)), detail: 'Exceptions before delivery', severity: numeric(counts.openFindings) ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Add the first customer', href: '/customers' }
      : selectedActions[0]
        ? { label: 'Open top proof task', href: selectedActions[0].href }
        : { label: 'Open active jobs', href: '/jobs' },
    setupSteps: [
      { label: 'Add the customer', detail: 'Save the customer once so every project, job, and report stays connected.', href: '/customers' },
      { label: 'Create the field job', detail: 'Use the shortest required job brief and assign the proof template.', href: '/jobs' },
      { label: 'Capture and review proof', detail: 'Collect private evidence, resolve findings, and approve before sharing.', href: '/capture' },
    ],
    automations: [
      { label: 'Standardize field capture', detail: 'Reuse job templates and required proof steps instead of rebuilding checklists.', href: '/templates' },
      { label: 'Package approved evidence', detail: 'Generate integrity-hashed reports and controlled shares from reviewed records.', href: '/reports' },
    ],
  };
}

export function buildStudyForgeWorkflowFocus(
  workspace: StudyForgeWorkflowWorkspace,
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const upcoming = workspace.countdowns
    .filter(item => {
      const days = optionalNumber(item.daysRemaining);
      return days !== null && days >= 0 && days <= 7;
    })
    .sort((left, right) => numeric(left.daysRemaining) - numeric(right.daysRemaining));
  const onboardingComplete = workspace.preferences?.onboardingComplete === true;

  if (!onboardingComplete) {
    actions.push({ id: 'learning-preferences', eyebrow: 'One-time setup', title: 'Set your learning rhythm', detail: 'Confirm time zone, daily goal, and default difficulty so plans and countdowns stay accurate.', href: '/settings', severity: 'attention' });
  }
  for (const countdown of upcoming) {
    actions.push({ id: `exam-${countdown.id}`, eyebrow: 'Exam window', title: String(countdown.title ?? 'Upcoming exam'), detail: `${numeric(countdown.daysRemaining)} day${numeric(countdown.daysRemaining) === 1 ? '' : 's'} remaining · focus the next session on the weakest material`, href: '/sessions', severity: numeric(countdown.daysRemaining) <= 2 ? 'critical' : 'attention' });
  }
  if (workspace.metrics.averageQuizScore !== null && workspace.metrics.averageQuizScore < 70) {
    actions.push({ id: 'quiz-score', eyebrow: 'Knowledge gap', title: `Average quiz score is ${workspace.metrics.averageQuizScore}%`, detail: 'Review missed answers, then run another source-grounded quiz.', href: '/quizzes', severity: 'attention' });
  }
  if (workspace.metrics.activeSets > 0 && workspace.metrics.currentStreak === 0) {
    actions.push({ id: 'resume-study', eyebrow: 'Resume the plan', title: `${workspace.metrics.activeSets} active study set${workspace.metrics.activeSets === 1 ? '' : 's'} are waiting`, detail: 'Start a short session rather than rebuilding a plan.', href: '/flashcards', severity: 'steady' });
  }

  const hasSets = workspace.sets.length > 0 || workspace.metrics.activeSets > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasSets ? 'setup' : selectedActions.length ? 'active' : 'clear';
  const nextExam = workspace.countdowns
    .filter(item => {
      const days = optionalNumber(item.daysRemaining);
      return days !== null && days >= 0;
    })
    .sort((left, right) => numeric(left.daysRemaining) - numeric(right.daysRemaining))[0];

  return {
    state,
    title: state === 'setup' ? 'Turn existing notes into a complete study plan' : state === 'clear' ? 'The learning plan is on track' : 'Learning Focus Brief',
    summary: state === 'setup'
      ? 'Paste the notes you already have once. StudyForge can create the set, flashcards, quiz, answer review, and plan as one durable transaction.'
      : state === 'clear'
        ? 'No near exam, low quiz average, incomplete preferences, or interrupted active set needs attention.'
        : `${selectedActions.length} learning ${selectedActions.length === 1 ? 'priority is' : 'priorities are'} ranked from saved sets, scores, countdowns, and streak activity.`,
    metrics: [
      { label: 'Active sets', value: String(workspace.metrics.activeSets), detail: 'Durable learning workspaces', severity: workspace.metrics.activeSets ? 'steady' : 'attention' },
      { label: 'Next exam', value: nextExam ? `${numeric(nextExam.daysRemaining)}d` : '—', detail: nextExam ? String(nextExam.title ?? 'Saved countdown') : 'No countdown recorded', severity: nextExam && numeric(nextExam.daysRemaining) <= 2 ? 'critical' : nextExam && numeric(nextExam.daysRemaining) <= 7 ? 'attention' : 'steady' },
      { label: 'Current streak', value: `${workspace.metrics.currentStreak}d`, detail: `${workspace.metrics.totalStudyMinutes} total study minutes`, severity: hasSets && workspace.metrics.currentStreak === 0 ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: onboardingComplete ? 'Create the first study set' : 'Set the learning rhythm', href: onboardingComplete ? '/sets' : '/settings' }
      : selectedActions[0]
        ? { label: 'Open next learning step', href: selectedActions[0].href }
        : { label: 'Resume a study set', href: '/sets' },
    setupSteps: [
      { label: 'Set the learning rhythm', detail: 'Confirm the time zone, difficulty, and daily goal once.', href: '/settings' },
      { label: 'Paste the source notes', detail: 'Create a complete set from existing notes instead of entering every card.', href: '/sets' },
      { label: 'Follow the generated plan', detail: 'Use the saved quiz, flashcards, and exam countdown to choose each session.', href: '/sessions' },
    ],
    automations: [
      { label: 'Generate the complete set', detail: 'Create source-grounded cards, quiz, review material, and plan in one transaction.', href: '/sets' },
      { label: 'Let progress drive review', detail: 'Use saved attempts and countdowns to return to the material that needs work.', href: '/sessions' },
    ],
  };
}

export function buildDeployOpsWorkflowFocus(
  overview: DeployOpsWorkflowOverview,
  executionSummary: DeployOpsExecutionSummary | null,
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const kitCount = numeric(overview.metrics.kits);
  const exportCount = overview.exports.length;
  const overdue = numeric(executionSummary?.overdue);
  const unfinishedKits = overview.kits.filter(item => !['completed', 'archived'].includes(String(item.status ?? '').toLowerCase()));

  if (overdue > 0) {
    actions.push({ id: 'overdue-readiness', eyebrow: 'Release risk', title: `${overdue} overdue readiness item${overdue === 1 ? '' : 's'}`, detail: 'Open the execution workspace and resolve the blocked phase, milestone, or task.', href: '/review', severity: 'critical' });
  }
  if (unfinishedKits.length > 0) {
    actions.push({ id: 'unfinished-packages', eyebrow: 'Finish the package', title: `${unfinishedKits.length} release package${unfinishedKits.length === 1 ? '' : 's'} still in production`, detail: 'Complete the brief and deliverables before recording readiness.', href: '/projects', severity: 'attention' });
  }
  if (kitCount > 0 && exportCount === 0) {
    actions.push({ id: 'package-export', eyebrow: 'Delivery handoff', title: 'No client-ready export has been recorded', detail: 'Review the generated package, then create an integrity-recorded export.', href: '/exports', severity: 'attention' });
  }
  if (executionSummary && executionSummary.launches > executionSummary.launched && overdue === 0) {
    actions.push({ id: 'readiness-review', eyebrow: 'Readiness gate', title: `${executionSummary.launches - executionSummary.launched} launch workspace${executionSummary.launches - executionSummary.launched === 1 ? '' : 's'} not marked launched`, detail: 'Check server-computed readiness and supporting evidence. Deployment remains a separate human action.', href: '/review', severity: 'steady' });
  }

  const hasRecords = kitCount > 0 || numeric(executionSummary?.launches) > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';

  return {
    state,
    title: state === 'setup' ? 'Build the first launch package from a proven structure' : state === 'clear' ? 'Release work is inside its recorded gates' : 'Launch Readiness Brief',
    summary: state === 'setup'
      ? 'Choose a compiler-derived template, answer the core brief once, and carry the generated deliverables into a separate evidence-based readiness workspace.'
      : state === 'clear'
        ? 'No overdue readiness item, unfinished package, missing export, or unlaunched workspace needs attention.'
        : `${selectedActions.length} package or readiness handoff${selectedActions.length === 1 ? '' : 's'} are ranked without claiming that anything was deployed.`,
    metrics: [
      { label: 'Release packages', value: String(kitCount), detail: 'Active and archived kits', severity: kitCount ? 'steady' : 'attention' },
      { label: 'Overdue gates', value: executionSummary ? String(overdue) : '—', detail: executionSummary ? 'Execution workspaces' : 'Execution summary unavailable', severity: overdue ? 'critical' : 'steady' },
      { label: 'Recorded exports', value: String(exportCount), detail: 'Integrity-tracked handoffs', severity: kitCount && !exportCount ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Choose a launch template', href: '/templates' }
      : selectedActions[0]
        ? { label: 'Open top release task', href: selectedActions[0].href }
        : { label: 'Open release packages', href: '/projects' },
    setupSteps: [
      { label: 'Choose the launch structure', detail: 'Start from a compiler-derived template instead of a blank checklist.', href: '/templates' },
      { label: 'Answer the brief once', detail: 'Capture the offer, audience, channels, deadline, and brand inputs.', href: '/brief' },
      { label: 'Review before delivery', detail: 'Verify the generated package and evidence-based readiness before export.', href: '/review' },
    ],
    automations: [
      { label: 'Generate the package', detail: 'Turn one reviewed brief into the coordinated launch deliverables.', href: '/brief' },
      { label: 'Compute readiness from evidence', detail: 'Let persisted phases, tasks, milestones, and artifacts expose blockers; deployment stays manual.', href: '/review' },
    ],
  };
}

export function buildCallCommandWorkflowFocus(
  product: CallCommandWorkflowProduct,
  readiness: Array<{ label: string; ready: boolean; detail: string }>,
  reconciliationIssues: Row[],
  goLiveReady: boolean,
  canAdmin: boolean,
  now = Date.now(),
): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const unresolvedWork = [...product.tickets, ...product.leads, ...product.tasks]
    .filter(item => openStatus(item.status));
  const urgentWork = unresolvedWork.filter(item => ['critical', 'urgent', 'high'].includes(String(item.priority ?? '').toLowerCase()));

  for (const issue of reconciliationIssues.filter(item => openStatus(item.status))) {
    actions.push({
      id: `reconciliation-${issue.id ?? issue.resourceKey ?? actions.length}`,
      eyebrow: 'Provider reconciliation',
      title: String(issue.issueType ?? 'Phone-number issue').replaceAll('_', ' '),
      detail: issue.safeAutoRepair === true ? 'A bounded safe repair is available after administrator review.' : 'Manual review is required; no destructive provider action will run automatically.',
      href: '/health',
      severity: issue.safeAutoRepair === true ? 'attention' : 'critical',
    });
  }
  const readinessRoutes: Record<string, string> = {
    'AI receptionist assigned': '/agents',
    'Phone number connected': '/setup',
    'Published workflow assigned': '/workflows',
    'Incoming call route verified': '/health',
    'Managed-number billing entitled': '/usage',
    'Telephony provider ready': '/health',
    'OpenAI Realtime SIP configured': '/health',
  };
  for (const item of readiness.filter(item => !item.ready)) {
    actions.push({ id: `readiness-${item.label}`, eyebrow: 'Go-live gate', title: item.label, detail: item.detail, href: readinessRoutes[item.label] ?? '/health', severity: ['Incoming call route verified', 'Managed-number billing entitled', 'Telephony provider ready', 'OpenAI Realtime SIP configured'].includes(item.label) ? 'critical' : 'attention' });
  }
  for (const item of urgentWork.slice(0, 2)) {
    const kind = product.tickets.includes(item) ? 'ticket' : product.leads.includes(item) ? 'lead' : 'follow-up';
    actions.push({ id: `followup-${item.id}`, eyebrow: 'Caller follow-up', title: String(item.title ?? item.summary ?? `Urgent ${kind}`), detail: `${String(item.priority ?? 'high')} priority · created from a saved call workflow`, href: '/actions', severity: 'attention' });
  }

  const hasConfiguration = product.channels.length + product.profiles.length + product.flows.length > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasConfiguration ? 'setup' : selectedActions.length ? 'active' : 'clear';
  const readyCount = readiness.filter(item => item.ready).length;
  const today = new Date(now).toISOString().slice(0, 10);
  const callsToday = product.calls.filter(item => String(item.createdAt ?? '').slice(0, 10) === today).length;

  return {
    state,
    title: state === 'setup' ? 'Stand up the receptionist with one guided setup' : state === 'clear' ? 'The receptionist is ready and follow-ups are caught up' : 'Receptionist Readiness Brief',
    summary: state === 'setup'
      ? 'Use the setup path to connect one number, create or select the receptionist and workflow, run the simulator, and verify every provider gate.'
      : state === 'clear'
        ? 'Every current go-live fact is verified and no urgent caller follow-up or reconciliation issue needs attention.'
        : `${selectedActions.length} configuration or caller handoff${selectedActions.length === 1 ? '' : 's'} are ranked. Purchases and go-live remain explicit administrator decisions.`,
    metrics: [
      { label: 'Readiness', value: `${readyCount}/${readiness.length}`, detail: goLiveReady ? 'All live-call gates verified' : 'Server-verified checklist', severity: goLiveReady ? 'steady' : 'attention' },
      { label: 'Caller follow-ups', value: String(unresolvedWork.length), detail: 'Open tickets, leads, and tasks', severity: urgentWork.length ? 'attention' : 'steady' },
      { label: 'Calls today', value: String(callsToday), detail: 'Tenant general-purpose calls', severity: 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: canAdmin ? 'Start guided setup' : 'Review setup requirements', href: '/setup' }
      : selectedActions[0]
        ? { label: canAdmin ? 'Open top next step' : 'Review top next step', href: selectedActions[0].href }
        : { label: 'Open call workspace', href: '/calls' },
    setupSteps: [
      { label: 'Choose the business number', detail: 'Connect an existing line or review live inventory; any purchase requires explicit confirmation.', href: '/setup' },
      { label: 'Create the receptionist', detail: 'Save the business context, greeting, hours, languages, and fallback once.', href: '/agents' },
      { label: 'Publish and test the workflow', detail: 'Start from a scenario template, verify destinations, and use the no-cost simulator.', href: '/workflows' },
    ],
    automations: [
      { label: 'Reuse call scenarios', detail: 'Start from receptionist, support, after-hours, or lead-capture workflows.', href: '/workflows' },
      { label: 'Turn calls into follow-up', detail: 'Let reviewed workflows create durable tickets, leads, and tasks for the team.', href: '/actions' },
    ],
  };
}

export function buildScriptOpsWorkflowFocus(workspace: ScriptOpsWorkflowWorkspace): WorkdayBrief {
  const actions: WorkdayAction[] = [];
  const failedSyncs = workspace.syncRuns.filter(item => item.status === 'failed');
  const reviewScripts = workspace.recentScripts.filter(item => item.status === 'in_review');
  const criticalScripts = workspace.recentScripts.filter(item => item.staticAnalysis?.risk === 'critical' || item.staticAnalysis?.status === 'critical_findings');

  for (const script of criticalScripts) {
    actions.push({ id: `critical-script-${script.id}`, eyebrow: 'Static analysis', title: String(script.displayName ?? script.name ?? 'Script needs review'), detail: 'Critical findings require human review before this version can be approved or downloaded.', href: `/scripts/${script.id}`, severity: 'critical' });
  }
  for (const script of reviewScripts.filter(item => !criticalScripts.some(critical => critical.id === item.id))) {
    actions.push({ id: `review-script-${script.id}`, eyebrow: 'Approval queue', title: String(script.displayName ?? script.name ?? 'Script review'), detail: `${String(script.language ?? 'script')} · ${String(script.riskTier ?? 'unrated')} risk · review the exact immutable version`, href: `/scripts/${script.id}`, severity: 'attention' });
  }
  if (failedSyncs.length) {
    actions.push({ id: 'failed-catalog-sync', eyebrow: 'Catalog health', title: `${failedSyncs.length} failed catalog sync${failedSyncs.length === 1 ? '' : 's'}`, detail: 'Review the incremental source result. Missing paths are deprecated, never destructively deleted.', href: '/sources', severity: 'attention' });
  }
  if (numeric(workspace.metrics.scripts) > 0 && numeric(workspace.metrics.approved) === 0) {
    actions.push({ id: 'no-approved-scripts', eyebrow: 'Delivery blocked', title: 'No script version is approved for download', detail: 'Run static analysis and complete human review on the exact version needed.', href: '/library', severity: 'attention' });
  }

  const hasRecords = numeric(workspace.metrics.scripts) > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';

  return {
    state,
    title: state === 'setup' ? 'Start with a reviewed script instead of rebuilding it' : state === 'clear' ? 'The reviewed script library is ready' : 'Script Delivery Brief',
    summary: state === 'setup'
      ? 'Search the pinned AutomationPacks catalog first. Draft only what is missing, run static analysis, and require human approval before download.'
      : state === 'clear'
        ? 'No critical finding, approval review, failed catalog sync, or blocked approved-version handoff needs attention.'
        : `${selectedActions.length} script safety or delivery handoff${selectedActions.length === 1 ? '' : 's'} are ranked. OperatorOS never executes the script.`,
    metrics: [
      { label: 'Human review', value: String(numeric(workspace.metrics.inReview)), detail: 'Versions awaiting decision', severity: numeric(workspace.metrics.inReview) ? 'attention' : 'steady' },
      { label: 'Approved', value: String(numeric(workspace.metrics.approved)), detail: 'Current versions available', severity: hasRecords && !numeric(workspace.metrics.approved) ? 'attention' : 'steady' },
      { label: 'Sync failures', value: String(failedSyncs.length), detail: 'Incremental catalog imports', severity: failedSyncs.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Search the script library', href: '/library' }
      : selectedActions[0]
        ? { label: 'Open top review task', href: selectedActions[0].href }
        : { label: 'Open approved library', href: '/library' },
    setupSteps: [
      { label: 'Search before authoring', detail: 'Reuse a pinned, provenance-tracked script when one already fits.', href: '/library' },
      { label: 'Draft only what is missing', detail: 'Create a manual or AI-assisted draft; generated output is never auto-approved.', href: '/generate' },
      { label: 'Review the exact version', detail: 'Use static analysis and human approval before controlled download.', href: '/library' },
    ],
    automations: [
      { label: 'Synchronize incrementally', detail: 'Import changed catalog files, restore reappearing paths, and deprecate missing ones safely.', href: '/sources' },
      { label: 'Draft with guardrails', detail: 'Use AI to reduce typing while keeping the output unapproved until human review.', href: '/generate' },
    ],
  };
}
