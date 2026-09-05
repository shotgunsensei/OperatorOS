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
      eyebrow: 'Content is late',
      title: item.title,
      detail: `${item.channel ?? item.itemType} · scheduled for ${dateLabel(item.scheduledAt)} · review, reschedule, or record publication`,
      href: '/calendar',
      severity: 'critical',
    });
  }
  for (const campaign of lateCampaigns) {
    actions.push({
      id: `campaign-late-${campaign.id}`,
      eyebrow: 'Campaign deadline',
      title: campaign.name,
      detail: `${campaign.status} campaign · target date was ${dateLabel(campaign.endAt)} · finish, reschedule, or close it`,
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
    title: state === 'setup' ? 'Build your first campaign without starting from scratch' : state === 'clear' ? 'Campaign work is on schedule' : 'Finish the next campaign task',
    summary: state === 'setup'
      ? 'Capture one reusable brand kit and audience, then use guided strategy or a template to produce the first campaign.'
      : state === 'clear'
        ? 'No overdue content, late campaign, approval handoff, or unscheduled active campaign needs attention.'
        : `${selectedActions.length} campaign task${selectedActions.length === 1 ? ' is' : 's are'} ready, ranked by deadline and review status.`,
    metrics: [
      { label: 'Approval queue', value: String(campaignReviews.length), detail: 'Campaigns awaiting review', severity: campaignReviews.length ? 'attention' : 'steady' },
      { label: 'Past-due content', value: String(overdueContent.length), detail: 'Not published or cancelled', severity: overdueContent.length ? 'critical' : 'steady' },
      { label: 'Active production', value: String(activeProduction.length), detail: 'Planning through active', severity: activeProduction.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: numeric(counts.brands) === 0 ? 'Create the brand kit' : numeric(counts.personas) === 0 ? 'Define the audience' : 'Start the campaign', href: firstSetupHref }
      : selectedActions[0]
        ? { label: 'Open top campaign task', href: selectedActions[0].href }
        : { label: 'Open campaigns', href: '/campaigns' },
    setupSteps: [
      { label: 'Save the reusable brand', detail: 'Record voice, colors, guidelines, and approved assets once.', href: '/brands' },
      { label: 'Choose the audience and offer', detail: 'Reuse a persona and offer instead of rewriting the brief.', href: '/personas' },
      { label: 'Build the campaign plan', detail: 'Use guided creation to prepare a draft, then review it before use.', href: '/ai-workflows' },
    ],
    automations: [
      { label: 'Use guided AI workflows', detail: 'Turn the saved brand, audience, offer, and channels into a review-ready campaign plan.', href: '/ai-workflows' },
      { label: 'Keep content moving', detail: 'Use the calendar to spot late drafts and missing approvals. Scheduling plans the work; it does not publish it.', href: '/calendar' },
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
    actions.push({ id: `evidence-review-${item.id}`, eyebrow: 'Proof review', title: item.title, detail: `${item.caseReference ?? 'Job'} · accept or reject the submitted photos and files`, href: '/review', severity: 'attention' });
  }
  for (const report of reviewReports) {
    actions.push({ id: `report-review-${report.id}`, eyebrow: 'Report approval', title: report.title, detail: `${report.caseReference ?? 'Job'} · confirm the report matches the completed work and attached proof`, href: '/review', severity: 'attention' });
  }
  for (const item of emptyCollectingCases) {
    actions.push({ id: `empty-case-${item.id}`, eyebrow: 'Capture proof', title: `${item.reference} · ${item.title}`, detail: 'This job does not have any photos or files attached yet.', href: `/cases/${item.id}`, severity: 'attention' });
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
    title: state === 'setup' ? 'Turn your first job into a customer-ready proof package' : state === 'clear' ? 'Every proof package is caught up' : 'Finish the next proof package',
    summary: state === 'setup'
      ? 'Create the customer and job once, capture evidence from the field, then let the review trail carry it into a report.'
      : state === 'clear'
        ? 'No overdue job, empty collecting case, evidence review, report approval, or open finding needs attention.'
        : `${selectedActions.length} proof task${selectedActions.length === 1 ? ' is' : 's are'} ready, with a direct link to the job, files, findings, or review.`,
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
      { label: 'Prepare the customer report', detail: 'Create a branded report and expiring share link from approved job records.', href: '/reports' },
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
    actions.push({ id: 'quiz-score', eyebrow: 'Knowledge gap', title: `Average quiz score is ${workspace.metrics.averageQuizScore}%`, detail: 'Review missed answers, then take another quiz based on your saved material.', href: '/quizzes', severity: 'attention' });
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
    title: state === 'setup' ? 'Turn your notes into a complete study plan' : state === 'clear' ? 'Your learning plan is on track' : 'Study what needs attention next',
    summary: state === 'setup'
      ? 'Paste the notes you already have. StudyForge can create the study set, flashcards, quiz, answer review, and plan in one step.'
      : state === 'clear'
        ? 'No near exam, low quiz average, incomplete preferences, or interrupted active set needs attention.'
        : `${selectedActions.length} learning ${selectedActions.length === 1 ? 'priority is' : 'priorities are'} ranked from saved sets, scores, countdowns, and streak activity.`,
    metrics: [
      { label: 'Active sets', value: String(workspace.metrics.activeSets), detail: 'Study sets in progress', severity: workspace.metrics.activeSets ? 'steady' : 'attention' },
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
      { label: 'Paste your notes', detail: 'Create a complete set from existing learning material instead of entering every card.', href: '/sets' },
      { label: 'Follow the generated plan', detail: 'Use the saved quiz, flashcards, and exam countdown to choose each session.', href: '/sessions' },
    ],
    automations: [
      { label: 'Generate the complete set', detail: 'Create cards, a quiz, review material, and a plan from your notes in one step.', href: '/sets' },
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
    actions.push({ id: 'overdue-readiness', eyebrow: 'Launch risk', title: `${overdue} overdue launch item${overdue === 1 ? '' : 's'}`, detail: 'Open the launch workspace and resolve the blocked phase, milestone, or task.', href: '/review', severity: 'critical' });
  }
  if (unfinishedKits.length > 0) {
    actions.push({ id: 'unfinished-packages', eyebrow: 'Finish the package', title: `${unfinishedKits.length} campaign package${unfinishedKits.length === 1 ? '' : 's'} still in progress`, detail: 'Complete the brief and required files before the launch review.', href: '/projects', severity: 'attention' });
  }
  if (kitCount > 0 && exportCount === 0) {
    actions.push({ id: 'package-export', eyebrow: 'Prepare the team files', title: 'No shareable export has been created', detail: 'Review the package, then create an export for the people handling the campaign.', href: '/exports', severity: 'attention' });
  }
  if (executionSummary && executionSummary.launches > executionSummary.launched && overdue === 0) {
    actions.push({ id: 'readiness-review', eyebrow: 'Launch checklist', title: `${executionSummary.launches - executionSummary.launched} campaign launch${executionSummary.launches - executionSummary.launched === 1 ? '' : 'es'} awaiting confirmation`, detail: 'Review the checklist and supporting files before recording the launch complete. Publishing still happens outside Deploy Ops.', href: '/review', severity: 'steady' });
  }

  const hasRecords = kitCount > 0 || numeric(executionSummary?.launches) > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';

  return {
    state,
    title: state === 'setup' ? 'Prepare your first campaign package' : state === 'clear' ? 'Campaign work is ready for the next launch' : 'Prepare the next campaign',
    summary: state === 'setup'
      ? 'Choose a reviewed template, answer the brief once, and use the generated files to work through the launch checklist.'
      : state === 'clear'
        ? 'No overdue launch item, unfinished package, missing export, or unconfirmed campaign needs attention.'
        : `${selectedActions.length} campaign task${selectedActions.length === 1 ? ' is' : 's are'} ready. Deploy Ops prepares the package; publishing remains a deliberate step in your external tools.`,
    metrics: [
      { label: 'Campaign packages', value: String(kitCount), detail: 'Active and archived packages', severity: kitCount ? 'steady' : 'attention' },
      { label: 'Overdue checks', value: executionSummary ? String(overdue) : '—', detail: executionSummary ? 'Campaign launch workspaces' : 'Campaign summary unavailable', severity: overdue ? 'critical' : 'steady' },
      { label: 'Ready-to-share exports', value: String(exportCount), detail: 'Saved campaign packages', severity: kitCount && !exportCount ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Choose a launch template', href: '/templates' }
      : selectedActions[0]
        ? { label: 'Open top campaign task', href: selectedActions[0].href }
        : { label: 'Open campaign packages', href: '/projects' },
    setupSteps: [
      { label: 'Choose the launch structure', detail: 'Start from a reviewed template instead of a blank checklist.', href: '/templates' },
      { label: 'Answer the brief once', detail: 'Capture the offer, audience, channels, deadline, and brand inputs.', href: '/brief' },
      { label: 'Review before delivery', detail: 'Check the claims, prices, dates, links, files, and approvals before export.', href: '/review' },
    ],
    automations: [
      { label: 'Generate the package', detail: 'Turn one reviewed brief into the coordinated launch deliverables.', href: '/brief' },
      { label: 'Complete the launch review', detail: 'Use phases, tasks, milestones, and attached files to find blockers. Publishing stays manual.', href: '/review' },
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
      eyebrow: 'Connection issue',
      title: String(issue.issueType ?? 'Phone-number issue').replaceAll('_', ' '),
      detail: issue.safeAutoRepair === true ? 'An administrator can review a suggested fix.' : 'An administrator needs to review this connection before calls can proceed.',
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
  const readinessTitles: Record<string, string> = {
    'AI receptionist assigned': 'Choose an AI receptionist',
    'Phone number connected': 'Connect a phone number',
    'Published workflow assigned': 'Choose the live call workflow',
    'Incoming call route verified': 'Confirm incoming calls reach the receptionist',
    'Managed-number billing entitled': 'Finish phone-number billing setup',
    'Telephony provider ready': 'Finish calling-service setup',
    'OpenAI Realtime SIP configured': 'Finish the AI voice connection',
  };
  for (const item of readiness.filter(item => !item.ready)) {
    actions.push({ id: `readiness-${item.label}`, eyebrow: 'Setup requirement', title: readinessTitles[item.label] ?? item.label, detail: item.detail, href: readinessRoutes[item.label] ?? '/health', severity: ['Incoming call route verified', 'Managed-number billing entitled', 'Telephony provider ready', 'OpenAI Realtime SIP configured'].includes(item.label) ? 'critical' : 'attention' });
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
    title: state === 'setup' ? 'Set up your AI receptionist' : state === 'clear' ? 'The receptionist is ready and follow-ups are caught up' : 'Get calls and follow-ups back on track',
    summary: state === 'setup'
      ? 'Connect one number, choose how the receptionist should respond, run a test call, and finish each live-service requirement.'
      : state === 'clear'
        ? 'Every current setup requirement is complete, and no urgent caller follow-up or connection issue needs attention.'
        : `${selectedActions.length} setup or caller task${selectedActions.length === 1 ? ' is' : 's are'} ready. Purchases and going live still require an administrator's confirmation.`,
    metrics: [
      { label: 'Setup ready', value: `${readyCount}/${readiness.length}`, detail: goLiveReady ? 'All live-call requirements complete' : 'Requirements completed', severity: goLiveReady ? 'steady' : 'attention' },
      { label: 'Caller follow-ups', value: String(unresolvedWork.length), detail: 'Open tickets, leads, and tasks', severity: urgentWork.length ? 'attention' : 'steady' },
      { label: 'Calls today', value: String(callsToday), detail: 'Calls handled for this organization', severity: 'steady' },
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
      { label: 'Prepare and test the workflow', detail: 'Start from a scenario template, confirm the destinations, and use the no-cost simulator.', href: '/workflows' },
    ],
    automations: [
      { label: 'Reuse call scenarios', detail: 'Start from receptionist, support, after-hours, or lead-capture workflows.', href: '/workflows' },
      { label: 'Turn calls into follow-up', detail: 'Let reviewed workflows create tickets, leads, and tasks for the team.', href: '/actions' },
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
    actions.push({ id: `review-script-${script.id}`, eyebrow: 'Approval queue', title: String(script.displayName ?? script.name ?? 'Script review'), detail: `${String(script.language ?? 'script')} · ${String(script.riskTier ?? 'unrated')} risk · review the saved version that will be downloaded`, href: `/scripts/${script.id}`, severity: 'attention' });
  }
  if (failedSyncs.length) {
    actions.push({ id: 'failed-catalog-sync', eyebrow: 'Library update', title: `${failedSyncs.length} library update${failedSyncs.length === 1 ? '' : 's'} failed`, detail: 'Review the latest import. Missing entries stay available for review instead of being deleted.', href: '/sources', severity: 'attention' });
  }
  if (numeric(workspace.metrics.scripts) > 0 && numeric(workspace.metrics.approved) === 0) {
    actions.push({ id: 'no-approved-scripts', eyebrow: 'Delivery blocked', title: 'No script version is approved for download', detail: 'Run static analysis and complete human review on the exact version needed.', href: '/library', severity: 'attention' });
  }

  const hasRecords = numeric(workspace.metrics.scripts) > 0;
  const selectedActions = ranked(actions);
  const state: WorkdayBrief['state'] = !hasRecords ? 'setup' : selectedActions.length ? 'active' : 'clear';

  return {
    state,
    title: state === 'setup' ? 'Find a reviewed script before building one' : state === 'clear' ? 'The reviewed script library is ready' : 'Prepare the next script for safe use',
    summary: state === 'setup'
      ? 'Search the reviewed AutomationPacks library first. Draft only what is missing, check it for risk, and require approval before download.'
      : state === 'clear'
        ? 'No critical finding, approval review, failed library update, or blocked approved download needs attention.'
        : `${selectedActions.length} script review or delivery task${selectedActions.length === 1 ? ' is' : 's are'} ready. Scripts are downloaded for external use; this app does not run them.`,
    metrics: [
      { label: 'Human review', value: String(numeric(workspace.metrics.inReview)), detail: 'Versions awaiting decision', severity: numeric(workspace.metrics.inReview) ? 'attention' : 'steady' },
      { label: 'Approved', value: String(numeric(workspace.metrics.approved)), detail: 'Current versions available', severity: hasRecords && !numeric(workspace.metrics.approved) ? 'attention' : 'steady' },
      { label: 'Import issues', value: String(failedSyncs.length), detail: 'Library updates needing review', severity: failedSyncs.length ? 'attention' : 'steady' },
    ],
    actions: selectedActions,
    primaryAction: state === 'setup'
      ? { label: 'Search the script library', href: '/library' }
      : selectedActions[0]
        ? { label: 'Open top review task', href: selectedActions[0].href }
        : { label: 'Open approved library', href: '/library' },
    setupSteps: [
      { label: 'Search before authoring', detail: 'Reuse a reviewed script when one already fits the job.', href: '/library' },
      { label: 'Draft only what is missing', detail: 'Create a manual or AI-assisted draft; generated output is never auto-approved.', href: '/generate' },
      { label: 'Review the version to use', detail: 'Check the script for risk and require human approval before download.', href: '/library' },
    ],
    automations: [
      { label: 'Keep the library current', detail: 'Import changed files, restore returning entries, and flag missing ones for review.', href: '/sources' },
      { label: 'Draft with review built in', detail: 'Use AI to reduce typing while keeping every draft unapproved until a person reviews it.', href: '/generate' },
    ],
  };
}
