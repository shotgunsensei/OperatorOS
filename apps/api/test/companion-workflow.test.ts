import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandForgeWorkflowFocus,
  buildCallCommandWorkflowFocus,
  buildDeployOpsWorkflowFocus,
  buildScriptOpsWorkflowFocus,
  buildSnapProofWorkflowFocus,
  buildStudyForgeWorkflowFocus,
} from '../../web/src/lib/companion-workflow.ts';

const now = Date.UTC(2026, 8, 2, 16, 0, 0);

test('BrandForgeOS replaces blank-dashboard hunting with a three-step setup path', () => {
  const brief = buildBrandForgeWorkflowFocus({}, [], [], now);
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/brands');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/brands', '/personas', '/ai-workflows']);
});

test('BrandForgeOS ranks overdue publishing and approval handoffs', () => {
  const brief = buildBrandForgeWorkflowFocus(
    { brands: 1, personas: 1, campaigns: 1, calendar_items: 1 },
    [{ id: 'campaign-1', name: 'Fall launch', status: 'review', endAt: null } as any],
    [{ id: 'calendar-1', title: 'Launch email', itemType: 'email', channel: 'Email', status: 'scheduled', scheduledAt: '2026-09-01T12:00:00.000Z' } as any],
    now,
  );
  assert.equal(brief.state, 'active');
  assert.equal(brief.actions[0]?.id, 'content-calendar-1');
  assert.ok(brief.actions.some(action => action.id === 'campaign-review-campaign-1'));
  assert.equal(brief.primaryAction.href, '/calendar');
});

test('SnapProofOS starts with customer, job, and proof rather than the full menu', () => {
  const brief = buildSnapProofWorkflowFocus({}, [], [], []);
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/customers');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/customers', '/jobs', '/capture']);
});

test('SnapProofOS ranks overdue field work before evidence and report review', () => {
  const brief = buildSnapProofWorkflowFocus(
    { customers: 1, cases: 1, activeJobs: 1, evidence: 1, overdueJobs: 1, openFindings: 1 },
    [{ id: 'case-1', reference: 'JOB-1', title: 'Roof inspection', status: 'collecting', evidenceCount: 0 } as any],
    [{ id: 'evidence-1', title: 'Roof photo', status: 'in_review', caseReference: 'JOB-1' } as any],
    [{ id: 'report-1', title: 'Inspection report', status: 'in_review', caseReference: 'JOB-1' } as any],
  );
  assert.equal(brief.state, 'active');
  assert.equal(brief.actions[0]?.id, 'overdue-jobs');
  assert.equal(brief.metrics[1]?.value, '2');
  assert.ok(brief.actions.some(action => action.href === '/cases/case-1'));
});

test('StudyForge AI creates a complete-set first-value path', () => {
  const brief = buildStudyForgeWorkflowFocus({
    preferences: { onboardingComplete: false },
    metrics: { activeSets: 0, totalStudyMinutes: 0, cardsReviewed: 0, averageQuizScore: null, currentStreak: 0, longestStreak: 0 },
    sets: [],
    countdowns: [],
  });
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/settings');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/settings', '/sets', '/sessions']);
});

test('StudyForge AI ranks the nearest exam and weak quiz result', () => {
  const brief = buildStudyForgeWorkflowFocus({
    preferences: { onboardingComplete: true },
    metrics: { activeSets: 2, totalStudyMinutes: 90, cardsReviewed: 45, averageQuizScore: 64, currentStreak: 0, longestStreak: 3 },
    sets: [{ id: 'set-1', status: 'active' }],
    countdowns: [{ id: 'exam-1', title: 'Security+', daysRemaining: 2 }],
  });
  assert.equal(brief.state, 'active');
  assert.equal(brief.actions[0]?.id, 'exam-exam-1');
  assert.ok(brief.actions.some(action => action.id === 'quiz-score'));
  assert.equal(brief.metrics[1]?.value, '2d');
});

test('Deploy Ops starts with a template and keeps deployment outside the shortcut', () => {
  const brief = buildDeployOpsWorkflowFocus({ metrics: { kits: 0, archived: 0, aiRefined: 0 }, kits: [], exports: [] }, null);
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/templates');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/templates', '/brief', '/review']);
  assert.ok(brief.automations.every(item => item.href !== '/deploy'));
});

test('Deploy Ops ranks overdue readiness before package and export handoffs', () => {
  const brief = buildDeployOpsWorkflowFocus(
    { metrics: { kits: 1, archived: 0, aiRefined: 1 }, kits: [{ id: 'kit-1', status: 'draft' }], exports: [] },
    { launches: 1, launched: 0, overdue: 2 },
  );
  assert.equal(brief.state, 'active');
  assert.equal(brief.actions[0]?.id, 'overdue-readiness');
  assert.ok(brief.actions.some(action => action.id === 'package-export'));
  assert.equal(brief.primaryAction.href, '/review');
});

test('CallCommand AI starts with guided setup and never hides purchase authority', () => {
  const brief = buildCallCommandWorkflowFocus(
    { channels: [], profiles: [], flows: [], calls: [], tickets: [], leads: [], tasks: [], actionRuns: [] },
    [{ label: 'Phone number connected', ready: false, detail: 'Connect a number.' }],
    [],
    false,
    true,
    now,
  );
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/setup');
  assert.match(brief.setupSteps[0]?.detail ?? '', /purchase requires explicit confirmation/i);
});

test('CallCommand AI turns readiness and reconciliation facts into review links only', () => {
  const brief = buildCallCommandWorkflowFocus(
    { channels: [{ id: 'channel-1' }], profiles: [{ id: 'profile-1' }], flows: [{ id: 'flow-1' }], calls: [], tickets: [], leads: [], tasks: [], actionRuns: [] },
    [{ label: 'Incoming call route verified', ready: false, detail: 'Run health validation.' }],
    [{ id: 'issue-1', issueType: 'provider_orphan', status: 'manual_review', safeAutoRepair: false }],
    false,
    true,
    now,
  );
  assert.equal(brief.state, 'active');
  assert.equal(brief.actions[0]?.id, 'reconciliation-issue-1');
  assert.ok(brief.actions.every(action => action.href === '/health'));
});

test('Script Ops starts with search, guarded drafting, and human review', () => {
  const brief = buildScriptOpsWorkflowFocus({ metrics: {}, syncRuns: [], recentScripts: [] });
  assert.equal(brief.state, 'setup');
  assert.equal(brief.primaryAction.href, '/library');
  assert.deepEqual(brief.setupSteps.map(step => step.href), ['/library', '/generate', '/library']);
  assert.match(brief.automations[1]?.detail ?? '', /unapproved until a person reviews it/i);
});

test('Script Ops ranks critical findings before approval and sync work', () => {
  const brief = buildScriptOpsWorkflowFocus({
    metrics: { scripts: 2, approved: 0, inReview: 1 },
    syncRuns: [{ id: 'sync-1', status: 'failed' }],
    recentScripts: [
      { id: 'script-1', displayName: 'Repair DNS', status: 'draft', staticAnalysis: { status: 'critical_findings' } },
      { id: 'script-2', displayName: 'Collect logs', status: 'in_review', language: 'powershell', riskTier: 'low' },
    ],
  });
  assert.equal(brief.state, 'active');
  assert.equal(brief.actions[0]?.id, 'critical-script-script-1');
  assert.ok(brief.actions.some(action => action.id === 'failed-catalog-sync'));
  assert.match(brief.summary, /this app does not run them/i);
});
