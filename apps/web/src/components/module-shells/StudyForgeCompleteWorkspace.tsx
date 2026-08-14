'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookMarked, Brain, CalendarClock, Check, ChevronLeft, ChevronRight,
  ClipboardList, Copy, Download, FileText, FolderPlus, Gauge, GraduationCap,
  Layers3, Play, RefreshCw, RotateCcw, Sparkles, Trash2, Trophy,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, radius, semantic, space } from '@/lib/design-tokens';

type Item = Record<string, any>;
type CompleteWorkspace = {
  preferences: Item;
  plan: { plan: 'free' | 'pro' | 'tutor'; limits: Item; source: string };
  usage: { generationCount: number; quizAttemptCount: number };
  metrics: { activeSets: number; totalStudyMinutes: number; cardsReviewed: number; averageQuizScore: number | null; currentStreak: number; longestStreak: number };
  folders: Item[];
  sets: Item[];
  countdowns: Item[];
  activity: Item[];
  quizTrend: Item[];
};

const shellCard: React.CSSProperties = {
  ...cardStyle,
  background: 'linear-gradient(145deg,rgba(20,17,38,.96),rgba(9,13,28,.96))',
  border: '1px solid rgba(139,92,246,.22)',
  boxShadow: '0 18px 45px rgba(0,0,0,.2)',
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#090d1c', color: semantic.text,
  border: '1px solid rgba(148,163,184,.25)', borderRadius: radius.sm, padding: '10px 12px',
};
const primary: React.CSSProperties = {
  border: 0, borderRadius: radius.sm, background: 'linear-gradient(135deg,#8b5cf6,#2563eb)',
  color: '#fff', padding: '10px 14px', fontWeight: 750, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};
const quiet: React.CSSProperties = {
  ...primary, background: 'rgba(15,23,42,.72)', border: '1px solid rgba(148,163,184,.24)', color: semantic.text,
};
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 };

function mutationKey(prefix: string) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function Panel({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section id={id} tabIndex={-1} style={{ scrollMarginTop: 18, marginBottom: 28 }}>
    <div style={{ color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 11, fontWeight: 800 }}>{eyebrow}</div>
    <h2 style={{ fontSize: 24, margin: '5px 0' }}>{title}</h2>
    <p style={{ color: semantic.textMuted, margin: '0 0 14px', maxWidth: 820 }}>{description}</p>
    {children}
  </section>;
}

export default function StudyForgeCompleteWorkspace({ routePath = '' }: { routePath?: string }) {
  const [workspace, setWorkspace] = useState<CompleteWorkspace | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setWorkspace(await moduleShellApi.studyforge.completeWorkspace() as CompleteWorkspace); }
    catch (cause: any) { setError(cause?.message || 'Could not load the complete learning workspace.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: () => Promise<unknown>, options: { reloadSelected?: string; clearSelected?: boolean } = {}) => {
    setBusy(true); setError(null);
    try {
      await action();
      await load();
      if (options.clearSelected) setSelected(null);
      else if (options.reloadSelected) setSelected(await moduleShellApi.studyforge.completeSet(options.reloadSelected) as Item);
    } catch (cause: any) { setError(cause?.message || 'The learning action could not be completed.'); }
    finally { setBusy(false); }
  };

  const open = async (id: string) => {
    setBusy(true); setError(null);
    try {
      setSelected(await moduleShellApi.studyforge.completeSet(id) as Item);
      document.getElementById('studyforge-set-workspace')?.scrollIntoView({ behavior: 'smooth' });
    } catch (cause: any) { setError(cause?.message || 'Could not load this study set.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const match = routePath.match(/^\/sets\/([0-9a-f-]{36})(?:\/|$)/i);
    if (match && selected?.id !== match[1]) void open(match[1]);
  // Opening is intentionally keyed only to the canonical deep-link path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath]);

  return <div data-testid="studyforge-phase33-complete" style={{ marginBottom: 36 }}>
    {error && <div role="alert" style={{ ...shellCard, borderColor: 'rgba(248,113,113,.7)', color: '#fecaca', marginBottom: 16 }}>{error}</div>}
    {!workspace ? <div style={shellCard}>Loading complete StudyForge learning records…</div> : <>
      {!workspace.preferences.onboardingComplete && <Onboarding busy={busy} act={act} />}
      <CompleteDashboard workspace={workspace} />
      <Organizer workspace={workspace} busy={busy} act={act} open={open} />
      <SetCreator workspace={workspace} busy={busy} act={act} />
      {selected && <SetWorkspace key={selected.id} set={selected} plan={workspace.plan} busy={busy} act={act} close={() => setSelected(null)} />}
      <Countdowns workspace={workspace} busy={busy} act={act} />
      <Account workspace={workspace} />
    </>}
  </div>;
}

function Onboarding({ busy, act }: { busy: boolean; act: (action: () => Promise<unknown>) => Promise<void> }) {
  const [zone, setZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [difficulty, setDifficulty] = useState('medium');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void act(() => moduleShellApi.studyforge.savePreferences({ timeZone: zone, defaultDifficulty: difficulty, dailyGoalMinutes: 30, onboardingComplete: true }));
  };
  return <Panel id="studyforge-onboarding" eyebrow="Start here" title="Set your learning rhythm" description="Choose your local time zone and default depth. These preferences drive date-only exam countdowns and streaks without changing OperatorOS identity or billing.">
    <form onSubmit={submit} style={{ ...shellCard, ...grid }}>
      <label>Time zone<input aria-label="Time zone" value={zone} onChange={(event) => setZone(event.target.value)} style={{ ...input, marginTop: 6 }} /></label>
      <label>Default difficulty<select aria-label="Default difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} style={{ ...input, marginTop: 6 }}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
      <button disabled={busy} style={primary}><GraduationCap size={16} /> Activate workspace</button>
    </form>
  </Panel>;
}

function CompleteDashboard({ workspace }: { workspace: CompleteWorkspace }) {
  const metrics = [
    ['Active sets', workspace.metrics.activeSets, Layers3],
    ['Study minutes', workspace.metrics.totalStudyMinutes, Gauge],
    ['Cards reviewed', workspace.metrics.cardsReviewed, BookMarked],
    ['Average quiz', workspace.metrics.averageQuizScore === null ? '—' : `${workspace.metrics.averageQuizScore}%`, Brain],
    ['Current streak', `${workspace.metrics.currentStreak} days`, Trophy],
    ['Longest streak', `${workspace.metrics.longestStreak} days`, Sparkles],
  ] as const;
  return <Panel id="studyforge-dashboard" eyebrow="Live learning data" title="Your study command center" description="Actual persisted sets, sessions, quiz results, countdowns, and streak activity—never demo metrics.">
    <div style={grid}>{metrics.map(([label, value, Icon]) => <article key={label} style={{ ...shellCard, position: 'relative', overflow: 'hidden' }}>
      <Icon size={18} color="#a78bfa" /><div style={{ color: semantic.textMuted, fontSize: 13, marginTop: 12 }}>{label}</div><strong style={{ fontSize: 26, display: 'block', marginTop: 4 }}>{value}</strong>
    </article>)}</div>
  </Panel>;
}

function Organizer({ workspace, busy, act, open }: { workspace: CompleteWorkspace; busy: boolean; act: (action: () => Promise<unknown>) => Promise<void>; open: (id: string) => Promise<void> }) {
  const [folderName, setFolderName] = useState('');
  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => { await moduleShellApi.studyforge.createFolder({ name: folderName }); setFolderName(''); });
  };
  return <Panel id="studyforge-sets" eyebrow="Library" title="Folders and study sets" description="Organize complete sets, reopen archived work, and continue exactly where you stopped.">
    <form onSubmit={createFolder} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <input aria-label="New folder name" value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={160} placeholder="New folder" style={{ ...input, width: 260 }} />
      <button disabled={busy || !folderName.trim()} style={quiet}><FolderPlus size={15} /> Add folder</button>
    </form>
    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 14 }}>
      {workspace.folders.length ? workspace.folders.map((folder) => <span key={folder.id} style={{ ...quiet, cursor: 'default', whiteSpace: 'nowrap' }}>{folder.name}</span>) : <span style={{ color: semantic.textMuted }}>No folders yet.</span>}
    </div>
    <div style={grid}>{workspace.sets.length ? workspace.sets.map((set) => <button key={set.id} onClick={() => void open(set.id)} disabled={busy} style={{ ...shellCard, textAlign: 'left', color: semantic.text, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{set.title}</strong><span style={{ color: set.status === 'active' ? '#86efac' : '#fbbf24', fontSize: 12 }}>{set.status}</span></div>
      <p style={{ color: semantic.textMuted, minHeight: 38 }}>{set.summary}</p>
      <div style={{ display: 'flex', gap: 10, color: '#c4b5fd', fontSize: 12 }}><span>{set.course || 'General'}</span><span>{set.difficulty}</span><span>Quality {set.qualityScore}</span></div>
    </button>) : <div style={shellCard}>Create your first complete study set from the notes below.</div>}</div>
  </Panel>;
}

function SetCreator({ workspace, busy, act }: { workspace: CompleteWorkspace; busy: boolean; act: (action: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [notes, setNotes] = useState('');
  const [folderId, setFolderId] = useState('');
  const [difficulty, setDifficulty] = useState(workspace.preferences.defaultDifficulty || 'medium');
  const [examDate, setExamDate] = useState('');
  const [generationMode, setGenerationMode] = useState<'auto' | 'ai' | 'deterministic'>('auto');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => {
      await moduleShellApi.studyforge.createCompleteSet({ title, course: course || null, notes, folderId: folderId || null, difficulty, examDate: examDate || null, generationMode, idempotencyKey: mutationKey('studyforge-set') });
      setTitle(''); setCourse(''); setNotes(''); setExamDate('');
    });
  };
  return <Panel id="studyforge-new-set" eyebrow="Complete generation" title="Turn notes into a full learning system" description="One transaction persists your source, summary, key terms, flashcards, multiple-choice and short-answer questions, review sheet, and personalized plan. Auto mode records AI provenance and falls back deterministically when policy allows.">
    <form onSubmit={submit} style={{ ...shellCard, display: 'grid', gap: 12 }}>
      <div style={grid}>
        <label>Set title<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} style={{ ...input, marginTop: 6 }} placeholder="Network fundamentals final" /></label>
        <label>Course<input value={course} onChange={(event) => setCourse(event.target.value)} maxLength={160} style={{ ...input, marginTop: 6 }} placeholder="NET-201" /></label>
        <label>Folder<select value={folderId} onChange={(event) => setFolderId(event.target.value)} style={{ ...input, marginTop: 6 }}><option value="">No folder</option>{workspace.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      </div>
      <textarea aria-label="Raw study notes" value={notes} onChange={(event) => setNotes(event.target.value)} required minLength={8} maxLength={100000} rows={8} style={input} placeholder="Paste your raw notes here…" />
      <div style={grid}>
        <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} style={{ ...input, marginTop: 6 }}><option value="easy">Easy · 20 min/day</option><option value="medium">Medium · 35 min/day</option><option value="hard">Hard · 50 min/day</option></select></label>
        <label>Exam date<input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} style={{ ...input, marginTop: 6 }} /></label>
        <label>Generator<select value={generationMode} onChange={(event) => setGenerationMode(event.target.value as any)} style={{ ...input, marginTop: 6 }}><option value="auto">AI with deterministic fallback</option><option value="deterministic">Deterministic local</option><option value="ai">AI required</option></select></label>
      </div>
      <button disabled={busy || title.trim().length < 1 || notes.trim().length < 8} style={primary}><Sparkles size={16} /> Generate every artifact</button>
    </form>
  </Panel>;
}

function SetWorkspace({ set, plan, busy, act, close }: { set: Item; plan: CompleteWorkspace['plan']; busy: boolean; act: (action: () => Promise<unknown>, options?: { reloadSelected?: string; clearSelected?: boolean }) => Promise<void>; close: () => void }) {
  const [tab, setTab] = useState<'overview' | 'flashcards' | 'quiz' | 'review' | 'plan'>('overview');
  const refresh = { reloadSelected: set.id };
  const copy = (action: 'duplicate' | 'regenerate') => void act(() => moduleShellApi.studyforge.copyCompleteSet(set.id, action, { generationMode: 'auto', idempotencyKey: mutationKey(`studyforge-${action}`) }), action === 'regenerate' ? { clearSelected: true } : {});
  const remove = () => {
    if (window.confirm(`Delete “${set.title}” and its generated learning records?`)) void act(() => moduleShellApi.studyforge.deleteCompleteSet(set.id), { clearSelected: true });
  };
  return <Panel id="studyforge-set-workspace" eyebrow="Active set" title={set.title} description={`${set.course || 'General'} · ${set.difficulty} · generator ${set.generationProvenance?.effectiveMode || 'recorded'} · quality ${set.qualityScore}`}>
    <div style={{ ...shellCard, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        <button style={quiet} onClick={close}><ChevronLeft size={15} /> Library</button>
        {(['overview', 'flashcards', 'quiz', 'review', 'plan'] as const).map((value) => <button key={value} aria-pressed={tab === value} style={tab === value ? primary : quiet} onClick={() => setTab(value)}>{value}</button>)}
        <a href={`/api/modules/studyforge-ai/study-sets/${set.id}/export?format=json`} style={{ ...quiet, textDecoration: 'none' }}><Download size={15} /> JSON</a>
        {plan.limits.advancedExport && <a href={`/api/modules/studyforge-ai/study-sets/${set.id}/export?format=csv`} style={{ ...quiet, textDecoration: 'none' }}><Download size={15} /> CSV</a>}
      </div>
      {tab === 'overview' && <Overview set={set} />}
      {tab === 'flashcards' && <Flashcards set={set} busy={busy} act={act} />}
      {tab === 'quiz' && <Quiz set={set} busy={busy} act={act} />}
      {tab === 'review' && <Review set={set} />}
      {tab === 'plan' && <Plan set={set} busy={busy} act={act} />}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button disabled={busy} style={quiet} onClick={() => copy('duplicate')}><Copy size={15} /> Duplicate</button>
      <button disabled={busy} style={quiet} onClick={() => copy('regenerate')}><RefreshCw size={15} /> Regenerate revision</button>
      <button disabled={busy} style={quiet} onClick={() => void act(() => moduleShellApi.studyforge.updateCompleteSet(set.id, { status: set.status === 'active' ? 'archived' : 'active', expectedVersion: set.version }), refresh)}>{set.status === 'active' ? <Archive size={15} /> : <RotateCcw size={15} />}{set.status === 'active' ? ' Archive' : ' Restore'}</button>
      <button disabled={busy} style={{ ...quiet, color: '#fecaca', borderColor: 'rgba(248,113,113,.4)' }} onClick={remove}><Trash2 size={15} /> Delete</button>
    </div>
  </Panel>;
}

function Overview({ set }: { set: Item }) {
  return <div style={{ display: 'grid', gap: 15 }}>
    <div><h3 style={{ margin: 0 }}>Summary</h3><p style={{ color: semantic.textMuted, lineHeight: 1.65 }}>{set.summary}</p></div>
    <div><h3>Key terms</h3><div style={grid}>{(set.keyTerms || []).map((term: Item, index: number) => <article key={`${term.term}-${index}`} style={{ background: '#090d1c', borderRadius: 10, padding: 12 }}><strong>{term.term}</strong><p style={{ color: semantic.textMuted }}>{term.definition}</p></article>)}</div></div>
    <div style={grid}><strong>{set.cards.length} flashcards</strong><strong>{set.questions.length} MCQs</strong><strong>{set.shortAnswers.length} short answers</strong><strong>{set.studyPlan.length} plan sessions</strong></div>
  </div>;
}

function Flashcards({ set, busy, act }: { set: Item; busy: boolean; act: (action: () => Promise<unknown>, options?: { reloadSelected?: string }) => Promise<void> }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [session, setSession] = useState<Item | null>(null);
  const [startedAt] = useState(Date.now());
  const card = set.cards[index];
  const ensureSession = async () => {
    if (session) return session;
    const created = await moduleShellApi.studyforge.startFlashcardSession(set.id, mutationKey('studyforge-flash-session')) as Item;
    setSession(created); return created;
  };
  const rate = useCallback(async (state: 'known' | 'learning') => {
    if (!card || busy) return;
    await act(async () => {
      const active = await ensureSession();
      await moduleShellApi.studyforge.reviewSessionCard(active.id, card.id, { state, clientMutationId: mutationKey('studyforge-card-review') });
      setFlipped(false); setIndex((value) => Math.min(set.cards.length - 1, value + 1));
    }, { reloadSelected: set.id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, busy, session, set.id, set.cards.length]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === ' ') { event.preventDefault(); setFlipped((value) => !value); }
      if (event.key === '1') void rate('learning');
      if (event.key === '2') void rate('known');
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(set.cards.length - 1, value + 1));
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [rate, set.cards.length]);
  if (!card) return <p>No flashcards are available.</p>;
  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', color: semantic.textMuted }}><span>Card {index + 1} of {set.cards.length}</span><span>Space flips · 1 learning · 2 known</span></div>
    <button onClick={() => setFlipped((value) => !value)} style={{ width: '100%', minHeight: 240, margin: '12px 0', borderRadius: 16, border: '1px solid rgba(139,92,246,.35)', background: flipped ? 'linear-gradient(145deg,#172554,#111827)' : 'linear-gradient(145deg,#2e1065,#111827)', color: '#fff', padding: 28, cursor: 'pointer', fontSize: 21 }}>
      <span style={{ display: 'block', color: '#c4b5fd', fontSize: 12, textTransform: 'uppercase', marginBottom: 16 }}>{flipped ? 'Answer' : 'Prompt'}</span>{flipped ? card.answer : card.question}
    </button>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <div><button style={quiet} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /></button> <button style={quiet} onClick={() => setIndex((value) => Math.min(set.cards.length - 1, value + 1))}><ChevronRight size={15} /></button></div>
      <div><button disabled={busy} style={{ ...quiet, color: '#fde68a' }} onClick={() => void rate('learning')}>Learning</button> <button disabled={busy} style={{ ...primary, background: 'linear-gradient(135deg,#059669,#2563eb)' }} onClick={() => void rate('known')}><Check size={15} /> Known</button></div>
      {session && <button disabled={busy} style={quiet} onClick={() => void act(() => moduleShellApi.studyforge.completeFlashcardSession(session.id, Math.max(0, Math.round((Date.now() - startedAt) / 1000))), { reloadSelected: set.id })}>Finish session</button>}
    </div>
  </div>;
}

function Quiz({ set, busy, act }: { set: Item; busy: boolean; act: (action: () => Promise<unknown>, options?: { reloadSelected?: string }) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const submit = () => void act(() => moduleShellApi.studyforge.submitCompleteQuiz(set.id, { answers: set.questions.map((question: Item) => ({ questionId: question.id, selectedIndex: answers[question.id] })), idempotencyKey: mutationKey('studyforge-quiz') }), { reloadSelected: set.id });
  return <div style={{ display: 'grid', gap: 14 }}>
    {set.questions.map((question: Item, questionIndex: number) => <fieldset key={question.id} style={{ border: 0, background: '#090d1c', padding: 14, borderRadius: 10 }}><legend style={{ fontWeight: 700, paddingTop: 10 }}>{questionIndex + 1}. {question.question}</legend>{question.choices.map((choice: string, choiceIndex: number) => <label key={choiceIndex} style={{ display: 'flex', gap: 8, padding: '8px 0', color: semantic.textMuted }}><input type="radio" name={question.id} checked={answers[question.id] === choiceIndex} onChange={() => setAnswers((value) => ({ ...value, [question.id]: choiceIndex }))} />{choice}</label>)}</fieldset>)}
    <button disabled={busy || Object.keys(answers).length !== set.questions.length} style={primary} onClick={submit}><ClipboardList size={16} /> Submit and review</button>
    {!!set.attempts.length && <div><h3>Attempt history</h3>{set.attempts.map((attempt: Item) => <div key={attempt.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, borderBottom: '1px solid rgba(148,163,184,.16)' }}><span>{new Date(attempt.completedAt).toLocaleString()}</span><strong>{attempt.scorePercent}%</strong></div>)}</div>}
  </div>;
}

function Review({ set }: { set: Item }) {
  return <div style={{ display: 'grid', gap: 16 }}>
    {(set.reviewSheet?.sections || []).map((section: Item, index: number) => <article key={`${section.heading}-${index}`}><h3>{section.heading}</h3><ul>{section.bullets.map((bullet: string, bulletIndex: number) => <li key={bulletIndex} style={{ marginBottom: 8, color: semantic.textMuted }}>{bullet}</li>)}</ul></article>)}
    <article style={{ background: 'rgba(124,58,237,.13)', borderRadius: 12, padding: 14 }}><h3>Last-minute cram section</h3><ul>{(set.reviewSheet?.cramSection || []).map((bullet: string, index: number) => <li key={index} style={{ marginBottom: 8 }}>{bullet}</li>)}</ul></article>
    <article><h3>Short-answer practice</h3>{set.shortAnswers.map((question: Item) => <details key={question.id} style={{ background: '#090d1c', padding: 12, borderRadius: 8, marginBottom: 8 }}><summary>{question.question}</summary><p style={{ color: semantic.textMuted }}>{question.answer}</p></details>)}</article>
  </div>;
}

function Plan({ set, busy, act }: { set: Item; busy: boolean; act: (action: () => Promise<unknown>, options?: { reloadSelected?: string }) => Promise<void> }) {
  return <div style={{ display: 'grid', gap: 10 }}>{set.studyPlan.map((session: Item) => <article key={session.id} style={{ background: '#090d1c', borderRadius: 10, padding: 13, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 12, background: session.completedAt ? '#065f46' : '#312e81' }}>{session.completedAt ? <Check size={19} /> : session.position + 1}</div>
    <div style={{ flex: 1, minWidth: 200 }}><strong>{session.title}</strong><div style={{ color: semantic.textMuted }}>{session.scheduledFor ? new Date(`${String(session.scheduledFor).slice(0, 10)}T00:00:00`).toLocaleDateString() : 'Flexible'} · {session.estimatedMinutes} min</div><p style={{ marginBottom: 0 }}>{session.focus}</p></div>
    <button disabled={busy} style={session.completedAt ? quiet : primary} onClick={() => void act(() => moduleShellApi.studyforge.completePlanItem(set.id, session.id, !session.completedAt), { reloadSelected: set.id })}>{session.completedAt ? 'Reopen' : 'Complete'}</button>
  </article>)}</div>;
}

function Countdowns({ workspace, busy, act }: { workspace: CompleteWorkspace; busy: boolean; act: (action: () => Promise<unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(''); const [examDate, setExamDate] = useState('');
  const entitled = workspace.plan.limits.examCountdowns;
  return <Panel id="studyforge-exams" eyebrow="Exam planning" title="Countdowns that respect your time zone" description={entitled ? 'Create persisted date-only countdowns linked to your learning calendar.' : 'Exam countdowns unlock with the OperatorOS Pro or Tutor StudyForge entitlement.'}>
    {entitled && <form onSubmit={(event) => { event.preventDefault(); void act(async () => { await moduleShellApi.studyforge.createCountdown({ title, examDate, timeZone: workspace.preferences.timeZone }); setTitle(''); setExamDate(''); }); }} style={{ ...shellCard, display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}><input aria-label="Exam title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Certification exam" style={{ ...input, flex: '2 1 240px' }} /><input aria-label="Exam date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} style={{ ...input, flex: '1 1 180px' }} /><button disabled={busy || !title || !examDate} style={primary}><CalendarClock size={15} /> Add countdown</button></form>}
    <div style={grid}>{workspace.countdowns.length ? workspace.countdowns.map((countdown) => <article key={countdown.id} style={shellCard}><CalendarClock color="#a78bfa" /><strong style={{ display: 'block', margin: '10px 0 3px' }}>{countdown.title}</strong><span style={{ fontSize: 26 }}>{countdown.daysRemaining} days</span><div style={{ color: semantic.textMuted, margin: '5px 0 12px' }}>{String(countdown.examDate).slice(0, 10)}</div><button disabled={busy} onClick={() => void act(() => moduleShellApi.studyforge.deleteCountdown(countdown.id))} style={quiet}><Trash2 size={14} /> Remove</button></article>) : <div style={shellCard}>No exam countdowns yet.</div>}</div>
  </Panel>;
}

function Account({ workspace }: { workspace: CompleteWorkspace }) {
  const generations = workspace.usage.generationCount || 0;
  const attempts = workspace.usage.quizAttemptCount || 0;
  return <Panel id="studyforge-account" eyebrow="OperatorOS authority" title="Plan and usage" description="StudyForge reads server-side entitlement and usage state from OperatorOS. There is no child checkout, demo account, or second Stripe authority.">
    <div style={grid}><article style={shellCard}><strong style={{ fontSize: 22, textTransform: 'capitalize' }}>{workspace.plan.plan}</strong><p style={{ color: semantic.textMuted }}>Resolved from {workspace.plan.source.replaceAll('_', ' ')}</p></article><article style={shellCard}><strong>{generations} / {workspace.plan.limits.generationsPerMonth ?? '∞'}</strong><p style={{ color: semantic.textMuted }}>Generations this month</p></article><article style={shellCard}><strong>{attempts} / {workspace.plan.limits.quizAttemptsPerMonth ?? '∞'}</strong><p style={{ color: semantic.textMuted }}>Quiz attempts this month</p></article><article style={shellCard}><strong>{workspace.plan.limits.flashcardsPerSet}</strong><p style={{ color: semantic.textMuted }}>Flashcards per set</p></article></div>
  </Panel>;
}
