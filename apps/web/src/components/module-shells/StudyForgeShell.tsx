'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, BookOpen, Brain, CalendarDays, CheckCircle2, Download,
  FileText, GraduationCap, Layers3, Library, RefreshCw, Sparkles, Upload,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { ShellLiveBadge } from './ShellChrome';
import StudyForgeCompleteWorkspace from './StudyForgeCompleteWorkspace';

type Item = Record<string, any>;
type Workspace = {
  dashboard: {
    subjects: number; sources: number; publishedDecks: number; publishedQuizzes: number;
    completedSessions: number; dueCards: number; attempts: number; averageScore: number;
  };
  subjects: Item[]; sources: Item[]; decks: Item[]; cards: Item[];
  quizzes: Item[]; questions: Item[]; attempts: Item[];
  plans: Item[]; sessions: Item[]; progress: Item[]; generations: Item[];
  ai: { name: string; configured: boolean; monthlyLimit: number };
};

const sections = [
  ['studyforge-dashboard', 'Learning home', GraduationCap],
  ['studyforge-sets', 'Study sets', Layers3],
  ['studyforge-new-set', 'Generate set', Sparkles],
  ['studyforge-exams', 'Exam countdowns', CalendarDays],
  ['studyforge-account', 'Plan & usage', CheckCircle2],
  ['studyforge-phase11c-dashboard', 'Legacy dashboard', BarChart3],
  ['studyforge-subjects', 'Subjects', GraduationCap],
  ['studyforge-sources', 'Sources', FileText],
  ['studyforge-studio', 'AI Studio', Sparkles],
  ['studyforge-decks', 'Flashcards', Library],
  ['studyforge-quizzes', 'Quizzes', Brain],
  ['studyforge-plans', 'Study Plans', CalendarDays],
  ['studyforge-analytics', 'Progress', CheckCircle2],
] as const;

const inputStyle: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#0b1020', color: semantic.text,
  border: `1px solid ${semantic.border}`, borderRadius: radius.sm, padding: '10px 12px',
};
const buttonStyle: React.CSSProperties = {
  border: 0, borderRadius: radius.sm, background: '#7c3aed', color: '#fff',
  padding: '9px 14px', fontWeight: 700, cursor: 'pointer',
};
const subtleButton: React.CSSProperties = {
  ...buttonStyle, background: 'transparent', border: `1px solid ${semantic.border}`,
  color: semantic.text,
};

function key(prefix: string) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

export default function StudyForgeShell({ routePath = '', embedded = false, view = 'overview', hrefFor = path => path }: { baseUrl?: string; routePath?: string; embedded?: boolean; view?: string; hrefFor?: (path: string) => string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await moduleShellApi.studyforge.workspace() as Workspace);
    } catch (cause: any) {
      setError(cause?.message || 'Could not load StudyForge workspace.');
    }
  }, []);

  const legacyView = ['sources', 'flashcards', 'quizzes', 'sessions', 'studio', 'progress'].includes(view);
  useEffect(() => { if (legacyView) void load(); }, [load, legacyView]);

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'The operation could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const navigate = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const path = id.replace(/^studyforge-/, '');
    const nextPath = window.location.hostname === 'studyforge-ai.operatoros.net'
      ? `/${path}`
      : `/modules/studyforge-ai/${path}`;
    window.history.replaceState({}, '', nextPath);
    setMobileNav(false);
  };

  return (
    <div
      id="studyforge-workspace"
      data-testid="shell-studyforge-ai"
      data-evidence="persisted_records_only"
      style={{ minHeight: '100vh', overflowX: 'clip', background: 'radial-gradient(circle at 85% 0%,rgba(124,58,237,.18),transparent 35%),#070a13', color: semantic.text, padding: `0 clamp(16px, 4vw, ${space.xxl}px) ${space.xxl}px` }}
    >
      {!embedded && <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${space.xl}px 0`, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
          <GraduationCap size={25} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 28 }}>StudyForge AI</h1><ShellLiveBadge />
          </div>
          <p style={{ margin: '4px 0 0', color: semantic.textMuted }}>Source-grounded learning materials, human review, and durable progress.</p>
        </div>
        <button style={subtleButton} onClick={() => setMobileNav((value) => !value)} aria-expanded={mobileNav}>Workspace menu</button>
        <button style={subtleButton} onClick={() => void load()} disabled={busy}><RefreshCw size={14} /> Refresh</button>
      </header>}

      {!embedded && <nav aria-label="StudyForge workspace" style={{ display: mobileNav ? 'flex' : 'flex', gap: 8, overflowX: 'auto', paddingBottom: space.lg, flexWrap: mobileNav ? 'wrap' : 'nowrap' }}>
        {sections.map(([id, label, Icon]) => (
          <button key={id} onClick={() => navigate(id)} style={{ ...subtleButton, whiteSpace: 'nowrap', display: 'inline-flex', gap: 7, alignItems: 'center' }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>}

      {error && <div role="alert" data-testid="studyforge-error" style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger, marginBottom: space.lg }}>{error}</div>}
      {(!legacyView || view === 'sessions') && <StudyForgeCompleteWorkspace routePath={routePath} view={view} hrefFor={hrefFor} />}
      {legacyView && (!data ? <Panel id="studyforge-loading" title="Loading workspace"><p style={{ color: semantic.textMuted }}>Loading your courses and study progress…</p></Panel> : (
        <>
          {view === 'sources' && <Subjects data={data} mutate={mutate} busy={busy} />}
          {view === 'sources' && <Sources data={data} mutate={mutate} busy={busy} />}
          {view === 'studio' && <Studio data={data} mutate={mutate} busy={busy} />}
          {view === 'flashcards' && <Decks data={data} mutate={mutate} busy={busy} />}
          {view === 'quizzes' && <Quizzes data={data} mutate={mutate} busy={busy} />}
          {view === 'sessions' && <Plans data={data} mutate={mutate} busy={busy} />}
          {view === 'progress' && <Progress data={data} />}
        </>
      ))}
    </div>
  );
}

function Panel({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} tabIndex={-1} style={{ scrollMarginTop: 20, marginBottom: space.xl }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>{title}</h2>
      {description && <p style={{ margin: `0 0 ${space.md}px`, color: semantic.textMuted }}>{description}</p>}
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: space.md }}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ ...cardStyle, color: semantic.textMuted }}>{text}</div>;
}

function Dashboard({ data }: { data: Workspace }) {
  const metrics = [
    ['Subjects', data.dashboard.subjects],
    ['Source records', data.dashboard.sources],
    ['Published decks', data.dashboard.publishedDecks],
    ['Due cards', data.dashboard.dueCards],
    ['Average quiz score', `${data.dashboard.averageScore}%`],
    ['Completed sessions', data.dashboard.completedSessions],
  ];
  return (
    <Panel id="studyforge-phase11c-dashboard" title="Learning command dashboard" description="See current subjects, study activity, quiz performance, and upcoming reviews.">
      <Grid>{metrics.map(([label, value]) => <article key={label} style={{ ...cardStyle, borderTop: '3px solid #7c3aed' }}><div style={{ color: semantic.textMuted, fontSize: 13 }}>{label}</div><strong style={{ display: 'block', fontSize: 28, marginTop: 8 }}>{value}</strong></article>)}</Grid>
    </Panel>
  );
}

function Subjects({ data, mutate, busy }: { data: Workspace; mutate: (action: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.studyforge.createSubject({ name, courseCode: code || null });
      setName(''); setCode('');
    });
  };
  return (
    <Panel id="studyforge-subjects" title="Subjects and courses" description="Organize source material, flashcard decks, quizzes, and study plans by subject.">
      <form onSubmit={submit} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))', gap: 10, marginBottom: space.md }}>
        <input data-testid="input-studyforge-subject-name" aria-label="Subject name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} placeholder="Network Fundamentals" style={inputStyle} />
        <input aria-label="Course code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} placeholder="NET-201" style={inputStyle} />
        <button data-testid="button-studyforge-subject-create" disabled={busy} style={buttonStyle}>Add subject</button>
      </form>
      <Grid>{data.subjects.length ? data.subjects.map((subject) => <article key={subject.id} style={cardStyle}><strong>{subject.name}</strong><div style={{ color: '#a78bfa', marginTop: 6 }}>{subject.courseCode || 'No course code'}</div><p style={{ color: semantic.textMuted }}>{subject.description || 'No description recorded.'}</p></article>) : <Empty text="No subjects yet." />}</Grid>
    </Panel>
  );
}

function Sources({ data, mutate, busy }: { data: Workspace; mutate: (action: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const createNote = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await moduleShellApi.studyforge.createSource({ title, body, subjectId: subjectId || null, sourceType: 'note' });
      setTitle(''); setBody('');
    });
  };
  const upload = async () => {
    if (!file || !title) return;
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
    await mutate(() => moduleShellApi.studyforge.uploadSource({
      title, subjectId: subjectId || null, originalName: file.name,
      mimeType: file.type || 'application/octet-stream', contentBase64,
      idempotencyKey: key('studyforge-upload'),
    }));
    setTitle(''); setFile(null);
  };
  return (
    <Panel id="studyforge-sources" title="Authorized sources" description="Private notes and approved documents stay protected, with no public links or fabricated attribution.">
      <form onSubmit={createNote} style={{ ...cardStyle, display: 'grid', gap: 10, marginBottom: space.md }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))', gap: 10 }}>
          <input data-testid="input-studyforge-source-title" aria-label="Source title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Source title" style={inputStyle} />
          <select aria-label="Source subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={inputStyle}><option value="">No subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
        </div>
        <textarea data-testid="textarea-studyforge-source-body" aria-label="Source content" value={body} onChange={(e) => setBody(e.target.value)} minLength={8} maxLength={100000} rows={5} placeholder="Paste private notes or source text…" style={inputStyle} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button data-testid="button-studyforge-source-create" disabled={busy || body.trim().length < 8} style={buttonStyle}>Save note source</button>
          <label style={{ ...subtleButton, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Upload size={14} /> Select document<input type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} /></label>
          {file && <button type="button" disabled={busy || !title} onClick={() => void upload()} style={subtleButton}>Upload {file.name}</button>}
        </div>
      </form>
      <Grid>{data.sources.length ? data.sources.map((source) => <article key={source.id} style={cardStyle}><strong>{source.title}</strong><div style={{ marginTop: 7, color: '#93c5fd' }}>{source.sourceType === 'document' ? 'Private document' : 'Private note'}</div><div style={{ marginTop: 6, color: semantic.textMuted, fontSize: 12 }}>SHA-256 {String(source.contentSha256).slice(0, 14)}…</div></article>) : <Empty text="No source material yet." />}</Grid>
    </Panel>
  );
}

function Studio({ data, mutate, busy }: { data: Workspace; mutate: (action: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  const [sourceId, setSourceId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState<'deck' | 'quiz' | 'study_plan'>('deck');
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void mutate(() => moduleShellApi.studyforge.generate({
      sourceId, subjectId: subjectId || null, type, title,
      targetDate: targetDate || null, idempotencyKey: key('studyforge-generation'),
    }));
  };
  return (
    <Panel id="studyforge-studio" title="Source-grounded AI studio" description="AI creates review-ready drafts while every quoted excerpt is checked against your sources before saving.">
      <form onSubmit={submit} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <select data-testid="select-studyforge-generation-source" aria-label="Generation source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} required style={inputStyle}><option value="">Select source</option>{data.sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select>
          <select aria-label="Generation subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={inputStyle}><option value="">Use source subject</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
          <select data-testid="select-studyforge-generation-type" aria-label="Generation type" value={type} onChange={(e) => setType(e.target.value as any)} style={inputStyle}><option value="deck">Flashcard deck</option><option value="quiz">Quiz</option><option value="study_plan">Study plan</option></select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))', gap: 10 }}>
          <input data-testid="input-studyforge-generation-title" aria-label="Material title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Material title" style={inputStyle} />
          <input aria-label="Study plan target date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button data-testid="button-studyforge-generation-create" disabled={busy || !sourceId} style={buttonStyle}><Sparkles size={14} /> Generate draft</button>
          <span style={{ color: semantic.textMuted, fontSize: 13 }}>AI service: {data.ai.name} · monthly limit {data.ai.monthlyLimit} · review required</span>
        </div>
      </form>
    </Panel>
  );
}

function lifecycle(entity: 'decks' | 'quizzes' | 'plans', item: Item, mutate: (action: () => Promise<unknown>) => Promise<void>) {
  const next: Record<string, string | null> = { draft: 'review', review: 'published', published: 'review', completed: 'archived', archived: null };
  const status = next[item.status];
  return status ? <button style={subtleButton} onClick={() => void mutate(() => moduleShellApi.studyforge.setStatus(entity, item.id, status, item.version))}>Move to {status}</button> : null;
}

function Decks({ data, mutate, busy }: { data: Workspace; mutate: (action: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  const progress = new Map(data.progress.map((item) => [item.cardId, item]));
  return (
    <Panel id="studyforge-decks" title="Flashcard decks" description="Edit generated cards before review and publish. Published cards feed durable spaced repetition.">
      {data.decks.length ? data.decks.map((deck) => {
        const cards = data.cards.filter((card) => card.deckId === deck.id);
        return <article key={deck.id} style={{ ...cardStyle, marginBottom: space.md }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><h3 style={{ marginTop: 0 }}>{deck.title}</h3><span style={{ color: '#a78bfa' }}>{deck.status} · {cards.length} cards</span></div>{!busy && lifecycle('decks', deck, mutate)}</div>
          <div data-testid="list-studyforge-cards" style={{ display: 'grid', gap: 9, marginTop: 12 }}>{cards.map((card) => <CardEditor key={card.id} card={card} editable={deck.status === 'draft' || deck.status === 'review'} busy={busy} mutate={mutate} progress={progress.get(card.id)} published={deck.status === 'published'} />)}</div>
        </article>;
      }) : <Empty text="No flashcard decks yet. Create one from an authorized source in AI Studio." />}
    </Panel>
  );
}

function CardEditor({ card, editable, busy, mutate, progress, published }: {
  card: Item; editable: boolean; busy: boolean; mutate: (action: () => Promise<unknown>) => Promise<void>;
  progress?: Item; published: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(String(card.question));
  const [answer, setAnswer] = useState(String(card.answer));
  const [excerpt, setExcerpt] = useState(String(card.sourceExcerpt || ''));
  const save = async () => {
    await mutate(() => moduleShellApi.studyforge.updateCard(card.id, {
      question, answer, sourceExcerpt: excerpt || null, expectedVersion: card.version,
    }));
    setEditing(false);
  };
  return (
    <div data-testid={`card-studyforge-${card.id}`} style={{ background: '#0b1020', borderRadius: 8, padding: 12 }}>
      {editing ? <div style={{ display: 'grid', gap: 8 }}>
        <input aria-label="Card question" value={question} onChange={(event) => setQuestion(event.target.value)} style={inputStyle} />
        <textarea aria-label="Card answer" value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} style={inputStyle} />
        <textarea aria-label="Card source excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={2} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy || !question.trim() || !answer.trim()} style={buttonStyle} onClick={() => void save()}>Save card</button>
          <button style={subtleButton} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div> : <>
        <strong>{card.question}</strong>
        <p data-testid={`text-studyforge-answer-${card.id}`} style={{ color: semantic.textMuted }}>{card.answer}</p>
        {card.sourceExcerpt && <blockquote style={{ margin: '8px 0', borderLeft: '3px solid #7c3aed', paddingLeft: 10, color: '#c4b5fd' }}>Source: {card.sourceExcerpt}</blockquote>}
        {editable && <button style={subtleButton} onClick={() => setEditing(true)}>Edit card</button>}
        {published && <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{(['again', 'hard', 'good', 'easy'] as const).map((rating) => <button key={rating} style={subtleButton} onClick={() => void mutate(() => moduleShellApi.studyforge.reviewCard(card.id, rating, progress?.version))}>{rating}</button>)}</div>}
      </>}
    </div>
  );
}

function Quizzes({ data, mutate, busy }: { data: Workspace; mutate: (action: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  return (
    <Panel id="studyforge-quizzes" title="Quizzes and attempts" description="Only published quizzes can be attempted; grading is server-authoritative.">
      {data.quizzes.length ? data.quizzes.map((quiz) => {
        const questions = data.questions.filter((question) => question.quizId === quiz.id);
        return <article key={quiz.id} style={{ ...cardStyle, marginBottom: space.md }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><h3 style={{ margin: 0 }}>{quiz.title}</h3><span style={{ color: '#93c5fd' }}>{quiz.status} · {questions.length} questions</span></div>{!busy && lifecycle('quizzes', quiz, mutate)}</div>
          <div style={{ marginTop: 12 }}>{questions.map((question) => quiz.status === 'published'
            ? <fieldset key={question.id} style={{ border: `1px solid ${semantic.border}`, borderRadius: 8, marginBottom: 10 }}><legend>{question.question}</legend>{question.choices.map((choice: string, index: number) => <label key={index} style={{ display: 'block', padding: 6 }}><input type="radio" name={question.id} checked={answers[question.id] === index} onChange={() => setAnswers((current) => ({ ...current, [question.id]: index }))} /> {choice}</label>)}</fieldset>
            : <QuestionEditor key={question.id} question={question} busy={busy} mutate={mutate} />)}
            {quiz.status === 'published' && <button data-testid={`button-studyforge-quiz-submit-${quiz.id}`} disabled={busy || questions.some((question) => answers[question.id] === undefined)} style={buttonStyle} onClick={() => void mutate(() => moduleShellApi.studyforge.submitAttempt(quiz.id, questions.map((question) => ({ questionId: question.id, selectedIndex: answers[question.id] }))))}>Submit quiz</button>}
          </div>
        </article>;
      }) : <Empty text="No quizzes yet." />}
    </Panel>
  );
}

function QuestionEditor({ question, busy, mutate }: {
  question: Item; busy: boolean; mutate: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(String(question.question));
  const [choices, setChoices] = useState<string[]>((question.choices as string[]).map(String));
  const [correctIndex, setCorrectIndex] = useState(Number(question.correctIndex ?? 0));
  const [explanation, setExplanation] = useState(String(question.explanation));
  const [excerpt, setExcerpt] = useState(String(question.sourceExcerpt || ''));
  const save = async () => {
    await mutate(() => moduleShellApi.studyforge.updateQuestion(question.id, {
      question: prompt, choices, correctIndex, explanation, sourceExcerpt: excerpt || null,
      expectedVersion: question.version,
    }));
    setEditing(false);
  };
  return (
    <div data-testid={`question-studyforge-${question.id}`} style={{ background: '#0b1020', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      {editing ? <div style={{ display: 'grid', gap: 8 }}>
        <input aria-label="Quiz question" value={prompt} onChange={(event) => setPrompt(event.target.value)} style={inputStyle} />
        {choices.map((choice, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
          <input aria-label={`Correct choice ${index + 1}`} type="radio" checked={correctIndex === index} onChange={() => setCorrectIndex(index)} />
          <input aria-label={`Choice ${index + 1}`} value={choice} onChange={(event) => setChoices((current) => current.map((value, choiceIndex) => choiceIndex === index ? event.target.value : value))} style={inputStyle} />
        </div>)}
        <textarea aria-label="Question explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} style={inputStyle} />
        <textarea aria-label="Question source excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={2} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy || !prompt.trim() || choices.some((choice) => !choice.trim())} style={buttonStyle} onClick={() => void save()}>Save question</button>
          <button style={subtleButton} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div> : <>
        <strong>{question.question}</strong>
        <ol>{question.choices.map((choice: string) => <li key={choice}>{choice}</li>)}</ol>
        <p style={{ color: semantic.textMuted }}>{question.explanation}</p>
        {question.sourceExcerpt && <blockquote style={{ margin: '8px 0', borderLeft: '3px solid #7c3aed', paddingLeft: 10, color: '#c4b5fd' }}>Source: {question.sourceExcerpt}</blockquote>}
        <button style={subtleButton} onClick={() => setEditing(true)}>Edit question</button>
      </>}
    </div>
  );
}

function Plans({ data, mutate, busy }: { data: Workspace; mutate: (action: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  return (
    <Panel id="studyforge-plans" title="Study plans and sessions" description="Review the generated schedule, publish it, then record actual completion.">
      {data.plans.length ? data.plans.map((plan) => {
        const sessions = data.sessions.filter((session) => session.planId === plan.id);
        return <article key={plan.id} style={{ ...cardStyle, marginBottom: space.md }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><h3 style={{ margin: 0 }}>{plan.title}</h3><span style={{ color: '#a78bfa' }}>{plan.status} · target {plan.targetDate || 'not set'}</span></div>{!busy && lifecycle('plans', plan, mutate)}</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>{sessions.map((session) => <PlanSessionEditor key={session.id} session={session} editable={plan.status === 'draft' || plan.status === 'review'} published={plan.status === 'published'} busy={busy} mutate={mutate} />)}</div>
        </article>;
      }) : <Empty text="No study plans yet." />}
    </Panel>
  );
}

function PlanSessionEditor({ session, editable, published, busy, mutate }: {
  session: Item; editable: boolean; published: boolean; busy: boolean;
  mutate: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(String(session.title));
  const [focus, setFocus] = useState(String(session.focus));
  const [minutes, setMinutes] = useState(Number(session.estimatedMinutes));
  const [scheduledFor, setScheduledFor] = useState(String(session.scheduledFor || '').slice(0, 10));
  const save = async () => {
    await mutate(() => moduleShellApi.studyforge.updatePlanSession(session.id, {
      title, focus, estimatedMinutes: minutes, scheduledFor: scheduledFor || null,
      expectedVersion: session.version,
    }));
    setEditing(false);
  };
  return (
    <div data-testid={`session-studyforge-${session.id}`} style={{ background: '#0b1020', padding: 12, borderRadius: 8 }}>
      {editing ? <div style={{ display: 'grid', gap: 8 }}>
        <input aria-label="Study session title" value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
        <textarea aria-label="Study session focus" value={focus} onChange={(event) => setFocus(event.target.value)} rows={2} style={inputStyle} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(160px,100%),1fr))', gap: 8 }}>
          <input aria-label="Study session date" type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} style={inputStyle} />
          <input aria-label="Study session minutes" type="number" min={5} max={480} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy || !title.trim() || !focus.trim()} style={buttonStyle} onClick={() => void save()}>Save session</button>
          <button style={subtleButton} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div> : <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div><strong>{session.title}</strong><div style={{ color: semantic.textMuted }}>{session.focus} · {session.estimatedMinutes} min</div></div>
        {editable && <button style={subtleButton} onClick={() => setEditing(true)}>Edit session</button>}
        {published && <button style={subtleButton} onClick={() => void mutate(() => moduleShellApi.studyforge.completeSession(session.id, !session.completedAt, session.version))}>{session.completedAt ? 'Reopen' : 'Complete'}</button>}
      </div>}
    </div>
  );
}

function Progress({ data }: { data: Workspace }) {
  const due = useMemo(() => data.progress.filter((row) => new Date(row.dueAt) <= new Date()), [data.progress]);
  return (
    <Panel id="studyforge-analytics" title="Progress and export" description="Review quiz scores, completed sessions, recall intervals, and learning activity over time.">
      <Grid>
        <article style={cardStyle}><h3>Quiz history</h3>{data.attempts.length ? data.attempts.slice(0, 8).map((attempt) => <div key={attempt.id} style={{ padding: '6px 0', borderBottom: `1px solid ${semantic.border}` }}>{attempt.scorePercent}% · {new Date(attempt.completedAt).toLocaleDateString()}</div>) : <p style={{ color: semantic.textMuted }}>No attempts yet.</p>}</article>
        <article style={cardStyle}><h3>Spaced repetition</h3><strong style={{ fontSize: 30 }}>{due.length}</strong><p style={{ color: semantic.textMuted }}>cards currently due</p><div>{data.progress.slice(0, 8).map((item) => <div key={item.id} style={{ fontSize: 13, padding: 4 }}>Interval {item.intervalDays}d · {item.lastRating}</div>)}</div></article>
        <article style={cardStyle}><h3>Portable exports</h3><p style={{ color: semantic.textMuted }}>Exports include only the learning records you are allowed to view.</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a href="/api/modules/studyforge-ai/export?format=json" style={{ ...subtleButton, textDecoration: 'none' }}><Download size={14} /> JSON</a><a href="/api/modules/studyforge-ai/export?format=csv" style={{ ...subtleButton, textDecoration: 'none' }}><Download size={14} /> CSV</a></div></article>
      </Grid>
    </Panel>
  );
}
