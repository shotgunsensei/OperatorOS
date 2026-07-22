'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Beaker,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Code2,
  Download,
  Eye,
  FileJson2,
  FlaskConical,
  Gauge,
  History,
  Lightbulb,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useTenant } from '../TenantProvider';
import {
  moduleShellApi,
  type FaultlineAssignment,
  type FaultlineChallengeSummary,
  type FaultlineSessionBundle,
} from '@/lib/auth';

type Tab = 'catalog' | 'session' | 'assignments' | 'progress' | 'authoring';

const AUTHOR_TEMPLATE = {
  schemaVersion: 1,
  description: 'Describe the observable failure without revealing the answer.',
  briefing: 'Provide the operator context, constraints, and known impact.',
  symptoms: [
    { id: 'symptom-1', description: 'Primary observable symptom', severity: 'high' },
    { id: 'symptom-2', description: 'Secondary corroborating symptom', severity: 'medium' },
  ],
  rootCause: {
    id: 'root-cause-correct',
    title: 'Canonical root cause',
    description: 'Explain the actual failure mechanism.',
    technicalDetail: 'Document the technical chain of causation and why alternatives do not fit.',
  },
  rootCauseOptions: [
    { id: 'root-cause-correct', title: 'Canonical root cause' },
    { id: 'root-cause-alternative', title: 'Plausible alternative' },
  ],
  evidence: [
    { id: 'evidence-1', title: 'Critical measurement', description: 'Measured value that identifies the cause.', category: 'clue', importance: 'critical' },
    { id: 'evidence-2', title: 'Supporting log', description: 'Log evidence that corroborates the measurement.', category: 'clue', importance: 'high' },
    { id: 'evidence-3', title: 'Environmental context', description: 'Useful context that does not prove the cause.', category: 'contextual', importance: 'low' },
    { id: 'evidence-4', title: 'Distracting coincidence', description: 'A plausible but misleading observation.', category: 'red-herring', importance: 'medium' },
  ],
  hints: [
    { level: 1, label: 'Nudge', text: 'Start with the strongest measurable symptom.', scorePenalty: 5 },
    { level: 2, label: 'Direction', text: 'Compare the evidence against each candidate cause.', scorePenalty: 10 },
    { level: 3, label: 'Strong clue', text: 'The critical measurement is decisive.', scorePenalty: 20 },
    { level: 4, label: 'Reveal path', text: 'Inspect the first evidence item and validate the mechanism.', scorePenalty: 35 },
  ],
  commands: [
    { command: 'inspect system', aliases: ['inspect'], description: 'Inspect the affected system.', output: 'Bounded diagnostic output.', revealsEvidence: ['evidence-1'], risky: false },
  ],
  events: [
    { id: 'event-1', timestamp: '2026-01-01T00:00:00Z', source: 'System log', level: 'error', message: 'Corroborating failure recorded', details: 'The supporting log confirms the measured failure.', revealsEvidence: ['evidence-2'] },
  ],
  tickets: [
    { id: 'ticket-1', author: 'Affected operator', role: 'Reporter', timestamp: '2026-01-01T00:05:00Z', content: 'The distracting coincidence occurred after the primary symptom.', redHerring: true, revealsEvidence: ['evidence-4'] },
  ],
  availableTools: ['terminal'],
  redHerrings: ['The distracting coincidence is not causal.'],
  remediation: 'Correct the root cause and verify the system under the original failure conditions.',
  remediationKeywords: ['correct', 'verify'],
  preventativeMeasures: ['Add a detection control for the critical measurement.'],
  maxScore: 100,
};

function errorText(error: any): string {
  if (error?.code === 'FAULTLINE_VERSION_CONFLICT') return 'This record changed elsewhere. Reloaded the latest version.';
  return error?.error || error?.message || 'FaultlineLab request failed.';
}

function actionKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export default function FaultlineLabWorkspace(_props: { baseUrl?: string }) {
  const { user } = useAuth();
  const { activeRole } = useTenant();
  const [tab, setTab] = useState<Tab>('catalog');
  const [challenges, setChallenges] = useState<FaultlineChallengeSummary[]>([]);
  const [sessions, setSessions] = useState<FaultlineSessionBundle['session'][]>([]);
  const [assignments, setAssignments] = useState<FaultlineAssignment[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [daily, setDaily] = useState<Record<string, any>>({});
  const [analytics, setAnalytics] = useState<Record<string, any> | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [challengeDetail, setChallengeDetail] = useState<Record<string, any> | null>(null);
  const [session, setSession] = useState<FaultlineSessionBundle | null>(null);
  const [attachments, setAttachments] = useState<Array<Record<string, any>>>([]);
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [authorContent, setAuthorContent] = useState(JSON.stringify(AUTHOR_TEMPLATE, null, 2));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canManage =
    user?.platformRole === 'super_admin' ||
    activeRole === 'owner' ||
    activeRole === 'admin' ||
    analytics !== null;
  const canAttempt = activeRole !== 'viewer';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, recent, nextProgress, nextAssignments, nextDaily] = await Promise.all([
        moduleShellApi.faultlinelab.listChallenges(true),
        moduleShellApi.faultlinelab.listSessions(),
        moduleShellApi.faultlinelab.progress(),
        moduleShellApi.faultlinelab.listAssignments(),
        moduleShellApi.faultlinelab.daily(),
      ]);
      setChallenges(catalog.challenges);
      setSessions(recent.sessions);
      setProgress(nextProgress);
      setAssignments(nextAssignments.assignments);
      setDaily(nextDaily);
      const [managerAnalytics, managerMembers] = await Promise.all([
        moduleShellApi.faultlinelab.analytics().catch(() => null),
        moduleShellApi.faultlinelab.listMembers().catch(() => ({ members: [] })),
      ]);
      setAnalytics(managerAnalytics);
      setMembers(managerMembers.members);
    } catch (next) {
      setError(errorText(next));
    } finally {
      setLoading(false);
    }
  }, []);

  const openChallenge = useCallback(async (id: string) => {
    setBusy('challenge');
    setError('');
    try {
      setChallengeDetail(await moduleShellApi.faultlinelab.getChallenge(id));
      setTab('catalog');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }, []);

  const openSession = useCallback(async (id: string) => {
    setBusy('session');
    setError('');
    try {
      const bundle = await moduleShellApi.faultlinelab.getSession(id);
      setSession(bundle);
      setTab('session');
      const files = await moduleShellApi.faultlinelab.listSessionAttachments(id).catch(() => ({ attachments: [] }));
      setAttachments(files.attachments);
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const path = window.location.pathname;
    const challenge = path.match(/\/challenges\/([a-z0-9-]+)\/?$/i);
    const attempt = path.match(/\/sessions\/([a-z0-9-]+)\/?$/i);
    if (challenge?.[1]) void openChallenge(challenge[1]);
    else if (attempt?.[1]) void openSession(attempt[1]);
    else if (/\/sessions(?:\/|$)/.test(path)) setTab('session');
    else if (/\/assignments(?:\/|$)/.test(path)) setTab('assignments');
    else if (/\/(?:progress|analytics)(?:\/|$)/.test(path)) setTab('progress');
    else if (/\/authoring(?:\/|$)/.test(path)) setTab('authoring');
    else if (/\/(?:dashboard|challenges|daily)(?:\/|$)/.test(path)) setTab('catalog');
  }, [openChallenge, openSession]);

  const published = useMemo(() => challenges.filter((item) => item.status === 'published'), [challenges]);
  const drafts = useMemo(() => challenges.filter((item) => item.status !== 'published'), [challenges]);

  async function startSession(input: Record<string, unknown>) {
    setBusy('start');
    setError('');
    setNotice('');
    try {
      const bundle = await moduleShellApi.faultlinelab.startSession({
        ...input,
        clientStartKey: actionKey('start'),
      });
      setSession(bundle);
      setAttachments([]);
      setTab('session');
      setNotice('Investigation started. Every action and score is recorded by the server.');
      await load();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function runAction(kind: 'command' | 'event' | 'ticket' | 'hint', target: string | number) {
    if (!session) return;
    setBusy(`action-${kind}-${target}`);
    setError('');
    try {
      setSession(await moduleShellApi.faultlinelab.addAction(session.session.id, {
        expectedVersion: session.session.version,
        clientActionId: actionKey(kind),
        kind,
        target,
      }));
    } catch (next) {
      setError(errorText(next));
      if ((next as any)?.code === 'FAULTLINE_VERSION_CONFLICT') await openSession(session.session.id);
    } finally {
      setBusy('');
    }
  }

  async function submitInvestigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('submit');
    setError('');
    try {
      const result = await moduleShellApi.faultlinelab.submit(session.session.id, {
        expectedVersion: session.session.version,
        clientSubmissionId: actionKey('submission'),
        hypothesis: data.get('hypothesis'),
        selectedRootCauseId: data.get('rootCause'),
        evidenceIds: data.getAll('evidence'),
        remediation: data.get('remediation'),
        proofNote: data.get('proofNote'),
      });
      setSession(result);
      setNotice('Submission scored from the immutable challenge version and server-recorded evidence.');
      await load();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function abandonSession() {
    if (!session || !window.confirm('Abandon this investigation? Recorded evidence remains in the audit trail.')) return;
    setBusy('abandon');
    try {
      await moduleShellApi.faultlinelab.abandon(session.session.id, session.session.version);
      setSession(await moduleShellApi.faultlinelab.getSession(session.session.id));
      await load();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function uploadProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem('proof') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Proof files are limited to 8 MB in this interface.');
      return;
    }
    setBusy('upload');
    setError('');
    try {
      await moduleShellApi.faultlinelab.uploadSessionAttachment(session.session.id, {
        originalName: file.name,
        declaredMimeType: file.type || 'application/octet-stream',
        contentBase64: await fileBase64(file),
      });
      const files = await moduleShellApi.faultlinelab.listSessionAttachments(session.session.id);
      setAttachments(files.attachments);
      form.reset();
      setNotice('Proof uploaded to private shared storage and queued for scanning.');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function openDraft(id: string) {
    setBusy('draft');
    setError('');
    try {
      const next = await moduleShellApi.faultlinelab.getAuthoringChallenge(id);
      setDraft(next);
      setAuthorContent(JSON.stringify(next.content, null, 2));
      setTab('authoring');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('save-draft');
    setError('');
    try {
      const content = JSON.parse(authorContent);
      const payload = {
        slug: data.get('slug'),
        title: data.get('title'),
        category: data.get('category'),
        difficulty: data.get('difficulty'),
        scope: data.get('scope'),
        changeNote: data.get('changeNote'),
        content,
      };
      const result = draft
        ? await moduleShellApi.faultlinelab.updateChallenge(draft.challenge.id, {
            ...payload,
            expectedVersion: draft.challenge.version,
          })
        : await moduleShellApi.faultlinelab.createChallenge(payload);
      await load();
      await openDraft(result.challenge.id);
      setNotice(draft ? 'Immutable challenge version created.' : 'Personal challenge draft created.');
    } catch (next) {
      setError(next instanceof SyntaxError ? 'Challenge content must be valid JSON.' : errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function publishDraft() {
    if (!draft) return;
    setBusy('publish');
    try {
      await moduleShellApi.faultlinelab.publishChallenge(
        draft.challenge.id,
        draft.challenge.version,
        draft.challenge.currentVersionNumber,
      );
      setDraft(null);
      setAuthorContent(JSON.stringify(AUTHOR_TEMPLATE, null, 2));
      setNotice('Challenge published to this tenant. Existing sessions remain pinned to their original version.');
      await load();
      setTab('catalog');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('assignment');
    try {
      await moduleShellApi.faultlinelab.createAssignment({
        challengeId: data.get('challengeId'),
        assigneeUserId: data.get('assigneeUserId'),
        title: data.get('title'),
        instructions: data.get('instructions'),
        dueAt: data.get('dueAt') || undefined,
      });
      form.reset();
      setNotice('Assignment created against the published challenge version.');
      await load();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function exportAttempts() {
    setBusy('export');
    try {
      downloadBlob(await moduleShellApi.faultlinelab.downloadAttempts(), 'faultlinelab-attempts.csv');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="fl-shell" data-testid="faultlinelab-shell">
      <style>{styles}</style>
      <div className="fl-wrap">
        <header className="fl-hero" id="faultlinelab-dashboard" tabIndex={-1}>
          <div className="fl-mark"><FlaskConical size={30} /></div>
          <div>
            <span>FAULTLINELAB // DIAGNOSTIC PROVING GROUND</span>
            <h1>Follow the fault line. <b>Prove the fix.</b></h1>
            <p>Server-scored troubleshooting labs with immutable evidence, versioned authoring, assignments, and auditable outcomes.</p>
          </div>
          <div className="fl-boundaries">
            <span><ShieldCheck size={14} /> OperatorOS authority</span>
            <span><Gauge size={14} /> Server scoring</span>
            <span><BookOpenCheck size={14} /> No certificate claim</span>
          </div>
        </header>

        <nav className="fl-tabs" aria-label="FaultlineLab workspace">
          {([
            ['catalog', 'Challenge board', Beaker],
            ['session', 'Investigation', Code2],
            ['assignments', 'Assignments', ClipboardList],
            ['progress', 'Progress', BarChart3],
            ['authoring', 'Authoring', FileJson2],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined}>
              <Icon size={15} /> {label}
            </button>
          ))}
          <button onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        </nav>

        {error && <div className="fl-alert error" role="alert"><AlertTriangle size={18} /> {error}</div>}
        {notice && <div className="fl-alert success" role="status"><CheckCircle2 size={18} /> {notice}</div>}
        {loading && <div className="fl-card fl-loading">Loading persistent FaultlineLab workspace…</div>}

        {!loading && tab === 'catalog' && (
          <section id="faultlinelab-challenges" tabIndex={-1} className="fl-grid">
            <div className="fl-main">
              <div className="fl-section-head"><div><span>LIVE CONTENT</span><h2>Challenge board</h2></div><strong>{published.length} playable</strong></div>
              {daily.challenge && (
                <article className="fl-card fl-daily">
                  <div><span>UTC DAILY // {daily.date}</span><h3>{daily.challenge.title}</h3><p>{daily.outcome ? `Recorded score: ${daily.outcome.score}` : 'One server-selected outcome counts per UTC day.'}</p></div>
                  <button disabled={!canAttempt || !!daily.outcome || busy === 'start'} onClick={() => void startSession({ mode: 'daily' })}><Play size={15} /> Start daily</button>
                </article>
              )}
              <div className="fl-card-grid">
                {published.map((challenge) => (
                  <article className="fl-card" key={challenge.id} data-testid="faultlinelab-challenge-card">
                    <div className="fl-card-meta"><span>{challenge.category}</span><span>{challenge.difficulty}</span></div>
                    <h3>{challenge.title}</h3>
                    <p>{challenge.attemptCount ?? 0} attempts · best {challenge.bestPercentage ?? '—'}%</p>
                    <div className="fl-actions">
                      <button onClick={() => void openChallenge(challenge.id)}><Eye size={14} /> Inspect</button>
                      <button disabled={!canAttempt || busy === 'start'} onClick={() => void startSession({ challengeId: challenge.id, mode: 'standard' })}><Play size={14} /> Standard</button>
                      <button disabled={!canAttempt || busy === 'start'} onClick={() => void startSession({ challengeId: challenge.id, mode: 'chaos', chaosIntensity: 2 })}><FlaskConical size={14} /> Chaos</button>
                    </div>
                  </article>
                ))}
              </div>
              {published.length === 0 && <div className="fl-card fl-empty">No validated published challenges are available.</div>}
            </div>
            <aside className="fl-side">
              {challengeDetail ? (
                <article className="fl-card fl-detail">
                  <span>CHALLENGE INTEL</span><h2>{challengeDetail.challenge.title}</h2>
                  <p>{challengeDetail.content.description}</p>
                  <h4>Briefing</h4><p>{challengeDetail.content.briefing}</p>
                  <h4>Symptoms</h4>
                  <ul>{challengeDetail.content.symptoms.map((item: any) => <li key={item.id}><b>{item.severity}</b> {item.description}</li>)}</ul>
                  <p className="fl-safe"><ShieldCheck size={14} /> Root cause, evidence details, hint text, and command output stay sealed until the server releases them.</p>
                </article>
              ) : (
                <article className="fl-card fl-detail"><span>SELECT A CASE</span><h2>Evidence stays sealed</h2><p>Inspect a challenge for its briefing, then start an immutable-version attempt when ready.</p></article>
              )}
              <article className="fl-card">
                <span>RECENT ATTEMPTS</span>
                {sessions.slice(0, 6).map((item) => <button className="fl-list-button" key={item.id} onClick={() => void openSession(item.id)}><span>{item.challengeTitle ?? item.challengeSlug ?? 'Challenge'}</span><b>{item.state}</b></button>)}
                {sessions.length === 0 && <p>No attempts recorded yet.</p>}
              </article>
            </aside>
          </section>
        )}

        {!loading && tab === 'session' && (
          <section id="faultlinelab-session" tabIndex={-1}>
            {!session ? <div className="fl-card fl-empty">Start a challenge or open a recent attempt to enter the investigation workspace.</div> : (
              <div className="fl-grid">
                <div className="fl-main">
                  <div className="fl-section-head"><div><span>{session.session.mode} // {session.session.state}</span><h2>{session.session.challengeTitle ?? 'Active investigation'}</h2></div><strong>v{session.session.challengeVersionNumber} · action {session.session.actionCount}</strong></div>
                  <article className="fl-card"><h3>Briefing</h3><p>{session.challenge.briefing}</p></article>
                  {session.session.state === 'active' && (
                    <>
                      <article className="fl-card">
                        <h3>Terminal</h3>
                        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const value = new FormData(form).get('command'); if (value) void runAction('command', String(value)); form.reset(); }} className="fl-inline-form">
                          <input name="command" required placeholder={session.challenge.commands[0]?.command ?? 'enter diagnostic command'} />
                          <button disabled={busy.startsWith('action')}><Code2 size={14} /> Execute</button>
                        </form>
                        <div className="fl-chip-row">{session.challenge.commands.map((item) => <button key={item.command} onClick={() => void runAction('command', item.command)}>{item.command}</button>)}</div>
                      </article>
                      {(session.challenge.events.length > 0 || session.challenge.tickets.length > 0) && <article className="fl-card"><h3>Investigation sources</h3><div className="fl-chip-row">{session.challenge.events.map((item) => <button key={item.id} onClick={() => void runAction('event', item.id)}>{item.source}: {item.message}</button>)}{session.challenge.tickets.map((item) => <button key={item.id} onClick={() => void runAction('ticket', item.id)}>{item.author}: ticket history</button>)}</div></article>}
                      <article className="fl-card"><h3>Hint ladder</h3><div className="fl-chip-row">{session.challenge.hints.map((hint) => <button key={hint.level} disabled={session.session.hintsUsed.includes(hint.level)} onClick={() => void runAction('hint', hint.level)}><Lightbulb size={13} /> L{hint.level} · −{hint.scorePenalty}</button>)}</div></article>
                    </>
                  )}
                  <article className="fl-card fl-terminal">
                    <h3>Action ledger</h3>
                    {session.actions.map((item) => <div key={item.id}><span>#{item.sequenceNumber} {item.kind} / {item.targetKey}</span><pre>{item.output}</pre></div>)}
                    {session.actions.length === 0 && <p>No evidence-producing actions yet.</p>}
                  </article>
                  {session.session.state === 'active' && (
                    <form className="fl-card fl-form" onSubmit={submitInvestigation}>
                      <h3>Submit diagnosis</h3>
                      <label>Working hypothesis<textarea name="hypothesis" required minLength={4} rows={3} /></label>
                      <label>Root cause<select name="rootCause" required defaultValue=""><option value="" disabled>Select the canonical cause</option>{session.challenge.rootCauseOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                      <fieldset><legend>Unlocked evidence</legend>{session.evidence.map((item) => <label className="fl-check" key={item.id}><input type="checkbox" name="evidence" value={item.id} /> <span><b>{item.title}</b>{item.description && <small>{item.description}</small>}</span></label>)}</fieldset>
                      <label>Remediation plan<textarea name="remediation" required minLength={4} rows={4} /></label>
                      <label>Proof note<textarea name="proofNote" rows={2} /></label>
                      <div className="fl-actions"><button disabled={busy === 'submit'}><Send size={14} /> Submit for server scoring</button><button type="button" className="danger" onClick={() => void abandonSession()}><XCircle size={14} /> Abandon</button></div>
                    </form>
                  )}
                  {session.session.state === 'completed' && <article className="fl-card fl-score"><span>SERVER SCORE</span><h2>{session.session.score} / {session.submission?.scoreBreakdown?.maxPossible ?? 100}</h2><strong>{session.session.scorePercentage}% · {session.session.tier} · {session.session.passed ? 'Passed' : 'Not passed'}</strong><h3>Debrief</h3><p>{session.debrief?.rootCause?.description}</p><h4>Remediation</h4><p>{session.debrief?.remediation}</p></article>}
                </div>
                <aside className="fl-side">
                  <article className="fl-card"><span>EVIDENCE LOCKER</span>{session.evidence.map((item) => <div className="fl-evidence" key={item.id}><b>{item.title}</b><small>{item.importance} · {item.category}</small>{item.description && <p>{item.description}</p>}</div>)}{session.evidence.length === 0 && <p>Evidence unlocks only through recorded actions.</p>}</article>
                  <form className="fl-card fl-form" onSubmit={uploadProof}><h3>Private proof</h3><input name="proof" type="file" required accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" /><button disabled={busy === 'upload'}><Upload size={14} /> Upload for scanning</button>{attachments.map((item) => <small key={String(item.id)}>{String(item.originalName)} · {String(item.scanStatus)}</small>)}</form>
                </aside>
              </div>
            )}
          </section>
        )}

        {!loading && tab === 'assignments' && (
          <section id="faultlinelab-assignments" tabIndex={-1} className="fl-grid">
            <div className="fl-main"><div className="fl-section-head"><div><span>TEAM QUEUE</span><h2>Assignments</h2></div><strong>{assignments.length}</strong></div>{assignments.map((item) => <article className="fl-card fl-row" key={item.id}><div><h3>{item.title || item.challengeTitle}</h3><p>{item.instructions || `${item.challengeTitle} · ${item.status}`}</p><small>{item.dueAt ? `Due ${new Date(item.dueAt).toLocaleString()}` : 'No due date'}</small></div><div className="fl-actions">{['assigned', 'in_progress'].includes(item.status) && item.assigneeUserId === user?.id && <button onClick={() => void startSession({ mode: 'assignment', assignmentId: item.id })}><Play size={14} /> Start</button>}{canManage && ['assigned', 'in_progress'].includes(item.status) && <button className="danger" onClick={async () => { await moduleShellApi.faultlinelab.cancelAssignment(item.id, item.version); await load(); }}>Cancel</button>}</div></article>)}{assignments.length === 0 && <div className="fl-card fl-empty">No assignments are waiting.</div>}</div>
            <aside className="fl-side">{canManage ? <form className="fl-card fl-form" onSubmit={createAssignment}><span>MANAGER CONTROL</span><h3>Assign published challenge</h3><label>Challenge<select name="challengeId" required><option value="">Select challenge</option>{published.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Tenant member<select name="assigneeUserId" required><option value="">Select member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label><label>Assignment title<input name="title" maxLength={200} /></label><label>Instructions<textarea name="instructions" rows={4} maxLength={5000} /></label><label>Due date<input name="dueAt" type="datetime-local" /></label><button disabled={busy === 'assignment'}><Users size={14} /> Create assignment</button></form> : <div className="fl-card"><ShieldCheck size={20} /><h3>Participant view</h3><p>Tenant owners, admins, and module managers create assignments. The server enforces that boundary.</p></div>}</aside>
          </section>
        )}

        {!loading && tab === 'progress' && (
          <section id="faultlinelab-progress" tabIndex={-1} className="fl-grid">
            <div className="fl-main"><div className="fl-metrics"><article><span>Attempts</span><b>{progress.progress?.attemptsCompleted ?? 0}</b></article><article><span>Solved</span><b>{progress.progress?.challengesSolved ?? 0}</b></article><article><span>Current streak</span><b>{progress.progress?.currentStreak ?? 0}</b></article><article><span>Daily streak</span><b>{progress.dailyStreak ?? 0}</b></article></div><article className="fl-card"><h2>Challenge history</h2>{(progress.challengeProgress ?? []).map((item: any) => <div className="fl-progress-row" key={item.challengeId}><span>{item.title}</span><b>{item.bestPercentage ?? 0}% · {item.bestTier ?? 'No tier'}</b></div>)}{!(progress.challengeProgress ?? []).length && <p>No completed scored attempts yet.</p>}</article><article className="fl-card"><h2>Earned badges</h2><div className="fl-chip-row">{(progress.badges ?? []).map((item: any) => <span key={item.badgeKey}><ShieldCheck size={13} /> {item.badgeKey}</span>)}{!(progress.badges ?? []).length && <p>Badges are awarded exactly once from server scoring.</p>}</div></article></div>
            <aside className="fl-side"><article className="fl-card"><span>PORTABLE EVIDENCE</span><h3>Attempt export</h3><p>Download your authorized attempt history as escaped CSV. FaultlineLab does not issue certificates.</p><button onClick={() => void exportAttempts()} disabled={busy === 'export'}><Download size={14} /> Download CSV</button></article><article className="fl-card" id="faultlinelab-analytics" tabIndex={-1}><span>TENANT ANALYTICS</span>{analytics ? <><h3>{analytics.summary?.completedAttempts ?? 0} completed</h3><p>{analytics.summary?.passedAttempts ?? 0} passed · {analytics.summary?.averagePercentage ?? 0}% average</p></> : <><h3>Manager access required</h3><p>Your personal progress remains available; aggregate tenant outcomes require owner, admin, or module-manager authority.</p></>}</article></aside>
          </section>
        )}

        {!loading && tab === 'authoring' && (
          <section id="faultlinelab-authoring" tabIndex={-1} className="fl-grid">
            <form key={draft?.challenge?.id ?? 'new'} className="fl-card fl-form fl-main" onSubmit={saveDraft}>
              <div className="fl-section-head"><div><span>VERSIONED CONTENT</span><h2>{draft ? `Edit ${draft.challenge.title}` : 'New challenge draft'}</h2></div>{draft && <strong>record v{draft.challenge.version} · content v{draft.challenge.currentVersionNumber}</strong>}</div>
              <div className="fl-two"><label>Slug<input name="slug" required pattern="[a-z0-9][a-z0-9-]{0,119}" defaultValue={draft?.challenge?.slug ?? ''} /></label><label>Title<input name="title" required minLength={2} maxLength={200} defaultValue={draft?.challenge?.title ?? ''} /></label><label>Category<select name="category" defaultValue={draft?.challenge?.category ?? 'mixed'}>{['windows-ad','networking','automotive','electronics','servers','mixed','healthcare-imaging'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Difficulty<select name="difficulty" defaultValue={draft?.challenge?.difficulty ?? 'intermediate'}>{['beginner','intermediate','advanced','expert'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Scope<select name="scope" defaultValue={draft?.challenge?.scope ?? 'personal'}><option value="personal">Personal draft</option>{canManage && <option value="tenant">Tenant draft</option>}</select></label><label>Change note<input name="changeNote" maxLength={500} placeholder="What changed in this immutable version?" /></label></div>
              <label>Challenge JSON<textarea className="fl-json" value={authorContent} onChange={(event) => setAuthorContent(event.target.value)} rows={26} spellCheck={false} /></label>
              <div className="fl-actions"><button disabled={busy === 'save-draft'}><FileJson2 size={14} /> {draft ? 'Create version' : 'Create draft'}</button>{draft && canManage && <button type="button" onClick={() => void publishDraft()} disabled={busy === 'publish'}><CheckCircle2 size={14} /> Publish current version</button>}<button type="button" onClick={() => { setDraft(null); setAuthorContent(JSON.stringify(AUTHOR_TEMPLATE, null, 2)); }}>Reset editor</button></div>
            </form>
            <aside className="fl-side"><article className="fl-card"><span>DRAFT INVENTORY</span>{drafts.map((item) => <button className="fl-list-button" key={item.id} onClick={() => void openDraft(item.id)}><span>{item.title}</span><b>{item.status} · v{item.currentVersionNumber}</b></button>)}{drafts.length === 0 && <p>No personal or tenant drafts are visible.</p>}</article><article className="fl-card"><History size={20} /><h3>Immutable versions</h3><p>Every save creates a new content snapshot. Publishing pins a specific validated version; active attempts never drift.</p>{(draft?.versions ?? []).map((item: any) => <small key={item.id}>v{item.versionNumber} · {String(item.contentSha256).slice(0, 12)}… · {item.changeNote || 'No change note'}</small>)}</article></aside>
          </section>
        )}
      </div>
    </main>
  );
}

const styles = `
  .fl-shell{min-height:100vh;padding:24px;color:#e8eaff;background:radial-gradient(circle at 12% 0%,rgba(139,92,246,.2),transparent 28%),radial-gradient(circle at 90% 12%,rgba(34,211,238,.1),transparent 24%),linear-gradient(180deg,#080711,#030308 72%);font-family:Inter,ui-sans-serif,sans-serif}.fl-wrap{max-width:1420px;margin:0 auto;display:grid;gap:16px}.fl-hero{border:1px solid rgba(167,139,250,.3);background:linear-gradient(120deg,rgba(24,20,45,.96),rgba(7,9,18,.96));box-shadow:0 30px 90px rgba(0,0,0,.38);border-radius:20px;padding:22px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center;overflow:hidden}.fl-mark{width:62px;height:62px;display:grid;place-items:center;border:1px solid rgba(167,139,250,.55);color:#c4b5fd;background:rgba(91,33,182,.2);transform:rotate(45deg);box-shadow:0 0 36px rgba(139,92,246,.18)}.fl-mark svg{transform:rotate(-45deg)}.fl-hero span,.fl-card>span,.fl-section-head span{color:#a78bfa;font:800 10px ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}.fl-hero h1{margin:6px 0;font-size:clamp(25px,4vw,43px);line-height:1;letter-spacing:-.04em}.fl-hero h1 b{color:#67e8f9}.fl-hero p,.fl-card p{color:#9ca3b9;line-height:1.55;margin:7px 0}.fl-boundaries{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;max-width:360px}.fl-boundaries span,.fl-chip-row span{display:inline-flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid rgba(167,139,250,.2);border-radius:999px;background:rgba(15,23,42,.7);color:#cbd5e1;font-size:10px}.fl-tabs{display:flex;gap:7px;flex-wrap:wrap;padding:8px;border:1px solid rgba(148,163,184,.13);border-radius:14px;background:rgba(8,10,20,.86);position:sticky;top:8px;z-index:5}.fl-tabs button,.fl-actions button,.fl-card button,.fl-inline-form button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(167,139,250,.26);border-radius:9px;background:rgba(76,29,149,.2);color:#ddd6fe;padding:9px 11px;font-weight:750;cursor:pointer}.fl-tabs button[aria-current=page],.fl-card button:hover{background:rgba(124,58,237,.34);border-color:rgba(196,181,253,.55)}button:disabled{opacity:.45!important;cursor:not-allowed!important}.fl-alert{display:flex;align-items:center;gap:8px;padding:11px 14px;border-radius:10px}.fl-alert.error{border:1px solid rgba(248,113,113,.4);background:rgba(127,29,29,.2);color:#fca5a5}.fl-alert.success{border:1px solid rgba(52,211,153,.35);background:rgba(6,78,59,.22);color:#6ee7b7}.fl-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,.8fr);gap:16px;align-items:start}.fl-main,.fl-side{display:grid;gap:14px;min-width:0}.fl-card{border:1px solid rgba(148,163,184,.15);border-radius:16px;background:linear-gradient(145deg,rgba(17,20,36,.95),rgba(8,10,20,.96));padding:17px;box-shadow:0 15px 44px rgba(0,0,0,.2);min-width:0}.fl-card h2,.fl-card h3,.fl-card h4{margin:5px 0 8px}.fl-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.fl-card-meta,.fl-actions,.fl-chip-row,.fl-inline-form,.fl-section-head,.fl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fl-card-meta{justify-content:space-between;color:#67e8f9;font:700 10px ui-monospace,monospace;text-transform:uppercase}.fl-actions{margin-top:12px}.fl-actions .danger,.fl-card .danger{color:#fca5a5;border-color:rgba(248,113,113,.3);background:rgba(127,29,29,.16)}.fl-section-head{justify-content:space-between}.fl-section-head h2{margin:4px 0}.fl-section-head strong{color:#67e8f9;font:700 11px ui-monospace,monospace}.fl-daily{border-color:rgba(34,211,238,.32);display:flex;justify-content:space-between;align-items:center;gap:12px}.fl-detail ul{padding-left:18px;color:#cbd5e1}.fl-detail li{margin:7px 0}.fl-safe{display:flex;gap:7px;color:#67e8f9!important}.fl-list-button{width:100%;justify-content:space-between!important;margin-top:7px;text-align:left}.fl-list-button b{font-size:10px;color:#67e8f9}.fl-inline-form input{flex:1;min-width:220px}.fl-chip-row{align-items:stretch}.fl-chip-row button{font-size:11px}.fl-terminal div{border-top:1px solid rgba(148,163,184,.12);padding:10px 0}.fl-terminal span{color:#67e8f9;font:700 10px ui-monospace,monospace}.fl-terminal pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;background:#05060b;border-radius:8px;padding:10px;max-height:240px;overflow:auto}.fl-form{display:grid;gap:11px}.fl-form label,.fl-form legend{display:grid;gap:6px;color:#aab1c5;font-size:12px}.fl-form input,.fl-form select,.fl-form textarea,.fl-inline-form input{box-sizing:border-box;width:100%;border:1px solid rgba(148,163,184,.22);border-radius:9px;background:#080a12;color:#eef2ff;padding:10px;font:inherit}.fl-form fieldset{border:1px solid rgba(148,163,184,.16);border-radius:10px}.fl-check{display:flex!important;grid-template-columns:auto 1fr;align-items:flex-start}.fl-check input{width:auto;margin-top:4px}.fl-check span{display:grid}.fl-check small{color:#9ca3b9}.fl-evidence{padding:10px 0;border-bottom:1px solid rgba(148,163,184,.12);display:grid;gap:3px}.fl-evidence small{color:#67e8f9;text-transform:uppercase}.fl-score{border-color:rgba(52,211,153,.35)}.fl-score>h2{font-size:42px;color:#6ee7b7}.fl-row{justify-content:space-between}.fl-row>div:first-child{flex:1}.fl-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.fl-metrics article{border:1px solid rgba(167,139,250,.2);border-radius:14px;background:rgba(17,20,36,.9);padding:15px;display:grid;gap:5px}.fl-metrics span{color:#9ca3b9;font-size:11px}.fl-metrics b{font-size:28px;color:#67e8f9}.fl-progress-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid rgba(148,163,184,.12)}.fl-progress-row b{color:#a78bfa}.fl-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fl-json{font-family:ui-monospace,SFMono-Regular,Consolas,monospace!important;font-size:11px!important;line-height:1.5}.fl-loading,.fl-empty{text-align:center;color:#9ca3b9;padding:34px}.fl-side small{display:block;color:#9ca3b9;margin-top:7px}
  @media(max-width:900px){.fl-grid{grid-template-columns:1fr}.fl-side{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.fl-boundaries{grid-column:1/-1;justify-content:flex-start;max-width:none}.fl-hero{grid-template-columns:auto 1fr}.fl-metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.fl-shell{padding:10px}.fl-hero{padding:16px}.fl-mark{width:48px;height:48px}.fl-tabs{position:static}.fl-tabs button{flex:1 1 130px}.fl-card-grid,.fl-two,.fl-metrics{grid-template-columns:1fr}.fl-daily,.fl-row,.fl-section-head{align-items:flex-start;flex-direction:column}.fl-actions button{flex:1 1 130px}}
`;
