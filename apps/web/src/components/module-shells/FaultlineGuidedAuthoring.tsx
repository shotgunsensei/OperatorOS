'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCode2,
  Lightbulb,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

type AuthorContent = Record<string, any>;

interface FaultlineGuidedAuthoringProps {
  rawContent: string;
  onChange: (value: string) => void;
  serverValidation?: {
    valid: boolean;
    validation?: {
      errors?: Array<{ code?: string; path?: string; message?: string }>;
      warnings?: Array<{ code?: string; path?: string; message?: string }>;
    };
  } | null;
}

const severityOptions = ['low', 'medium', 'high', 'critical'];
const evidenceCategories = ['clue', 'contextual', 'red-herring'];
const evidenceImportance = ['low', 'medium', 'high', 'critical'];
const eventLevels = ['info', 'warning', 'error', 'critical'];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextId(content: AuthorContent, prefix: string): string {
  const values = [
    ...(content.symptoms ?? []),
    ...(content.evidence ?? []),
    ...(content.events ?? []),
    ...(content.tickets ?? []),
    ...(content.rootCauseOptions ?? []),
  ];
  const ids = new Set(values.map((item: any) => String(item.id ?? '')));
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function lineList(value: string): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

function readiness(content: AuthorContent) {
  const revealIds = new Set([
    ...(content.commands ?? []).flatMap((item: any) => item.revealsEvidence ?? []),
    ...(content.events ?? []).flatMap((item: any) => item.revealsEvidence ?? []),
    ...(content.tickets ?? []).flatMap((item: any) => item.revealsEvidence ?? []),
  ]);
  const requiredEvidence = (content.evidence ?? []).filter(
    (item: any) => item.category === 'clue' || item.importance === 'critical',
  );
  const hints = [...(content.hints ?? [])].sort((left: any, right: any) => left.level - right.level);
  const checks = [
    {
      label: 'A clear scenario and learner briefing',
      ready: String(content.description ?? '').trim().length >= 2 && String(content.briefing ?? '').trim().length >= 2,
    },
    {
      label: 'At least two observable symptoms',
      ready: (content.symptoms ?? []).length >= 2 && (content.symptoms ?? []).every((item: any) => String(item.description ?? '').trim().length >= 2),
    },
    {
      label: 'One correct cause and a plausible alternative',
      ready: (content.rootCauseOptions ?? []).length >= 2
        && (content.rootCauseOptions ?? []).some((item: any) => item.id === content.rootCause?.id),
    },
    {
      label: 'At least four evidence items',
      ready: (content.evidence ?? []).length >= 4,
    },
    {
      label: 'Every required clue can be discovered',
      ready: requiredEvidence.length > 0 && requiredEvidence.every((item: any) => revealIds.has(item.id)),
    },
    {
      label: 'Four progressively costlier hints',
      ready: hints.length === 4 && hints.every((item: any, index: number) => item.level === index + 1)
        && hints.every((item: any, index: number) => index === 0 || item.scorePenalty > hints[index - 1].scorePenalty),
    },
    {
      label: 'A remediation plan with scoring terms',
      ready: String(content.remediation ?? '').trim().length >= 2 && (content.remediationKeywords ?? []).length >= 2,
    },
    {
      label: 'Both log and ticket investigation sources',
      ready: (content.events ?? []).length > 0 && (content.tickets ?? []).length > 0,
      recommended: true,
    },
  ];
  return { checks, readyCount: checks.filter(item => item.ready).length };
}

export default function FaultlineGuidedAuthoring({
  rawContent,
  onChange,
  serverValidation,
}: FaultlineGuidedAuthoringProps) {
  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(rawContent);
      return value && typeof value === 'object' && !Array.isArray(value)
        ? { content: value as AuthorContent, error: '' }
        : { content: null, error: 'Advanced JSON must contain one challenge object.' };
    } catch {
      return { content: null, error: 'Advanced JSON has a syntax error. Fix it or reset the editor to resume guided editing.' };
    }
  }, [rawContent]);

  const content = parsed.content;
  const quality = useMemo(() => content ? readiness(content) : { checks: [], readyCount: 0 }, [content]);

  function update(recipe: (next: AuthorContent) => void) {
    if (!content) return;
    const next = clone(content);
    recipe(next);
    onChange(JSON.stringify(next, null, 2));
  }

  function setList(path: 'redHerrings' | 'remediationKeywords' | 'preventativeMeasures' | 'availableTools', value: string) {
    update(next => { next[path] = lineList(value); });
  }

  function toggleReveal(collection: 'commands' | 'events' | 'tickets', index: number, evidenceId: string) {
    update(next => {
      const current = new Set(next[collection][index].revealsEvidence ?? []);
      if (current.has(evidenceId)) current.delete(evidenceId);
      else current.add(evidenceId);
      next[collection][index].revealsEvidence = [...current];
    });
  }

  function removeEvidence(index: number) {
    update(next => {
      const [removed] = next.evidence.splice(index, 1);
      for (const collection of ['commands', 'events', 'tickets']) {
        next[collection] = (next[collection] ?? []).map((item: any) => ({
          ...item,
          revealsEvidence: (item.revealsEvidence ?? []).filter((id: string) => id !== removed.id),
        }));
      }
    });
  }

  const evidenceChoices = content?.evidence ?? [];

  return (
    <div className="fl-guided-author" data-testid="faultlinelab-guided-authoring">
      <style>{guidedStyles}</style>

      <section className="fl-author-quality" aria-label="Challenge readiness">
        <div>
          <span>BUILD READINESS</span>
          <h3>{quality.readyCount} of {quality.checks.length} quality checks ready</h3>
          <p>These checks catch common authoring gaps before your team sees the case. The server performs the final validation.</p>
        </div>
        <div className="fl-quality-list">
          {quality.checks.map(item => (
            <span className={item.ready ? 'ready' : item.recommended ? 'recommended' : 'needs-work'} key={item.label}>
              {item.ready ? <CheckCircle2 size={14} /> : item.recommended ? <Lightbulb size={14} /> : <AlertTriangle size={14} />}
              {item.label}{!item.ready && item.recommended ? ' (recommended)' : ''}
            </span>
          ))}
        </div>
        {serverValidation && (
          <div className={serverValidation.valid ? 'fl-server-check valid' : 'fl-server-check invalid'} role="status" data-testid="faultlinelab-server-validation">
            {serverValidation.valid ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
            <div>
              <b>{serverValidation.valid ? 'Server validation passed' : 'Server validation needs attention'}</b>
              {(serverValidation.validation?.warnings ?? []).map((item, index) => <small key={`warning-${index}`}>{item.message}</small>)}
              {(serverValidation.validation?.errors ?? []).map((item, index) => <small key={`error-${index}`}>{item.message}</small>)}
            </div>
          </div>
        )}
      </section>

      {!content ? (
        <div className="fl-author-block fl-advanced-error" role="alert">
          <AlertTriangle size={20} />
          <div><h3>Guided editing is paused</h3><p>{parsed.error}</p></div>
        </div>
      ) : (
        <>
          <section className="fl-author-block" data-author-step="scenario">
            <div className="fl-author-heading"><span>1</span><div><h3>Set the scene</h3><p>Give learners the observable problem and the operating context—without revealing the answer.</p></div></div>
            <label>What is going wrong?<textarea required minLength={2} maxLength={3000} rows={3} value={content.description ?? ''} onChange={event => update(next => { next.description = event.target.value; })} placeholder="Example: Staff lose access to shared services every afternoon, but basic connectivity still works." /></label>
            <label>Learner briefing<textarea required minLength={2} maxLength={10000} rows={5} value={content.briefing ?? ''} onChange={event => update(next => { next.briefing = event.target.value; })} placeholder="Explain the environment, business impact, known constraints, and what the learner has been asked to determine." /></label>
          </section>

          <section className="fl-author-block" data-author-step="symptoms">
            <div className="fl-author-heading"><span>2</span><div><h3>Describe what learners can observe</h3><p>Include at least two symptoms. Separate what is urgent from what is merely unusual.</p></div></div>
            <div className="fl-author-stack">
              {(content.symptoms ?? []).map((item: any, index: number) => (
                <article className="fl-author-item" key={item.id}>
                  <div className="fl-author-row"><b>Symptom {index + 1}</b><button type="button" className="fl-icon-button" aria-label={`Remove symptom ${index + 1}`} disabled={content.symptoms.length <= 2} onClick={() => update(next => { next.symptoms.splice(index, 1); })}><Trash2 size={14} /></button></div>
                  <label>What the learner observes<textarea required minLength={2} maxLength={1000} rows={2} value={item.description ?? ''} onChange={event => update(next => { next.symptoms[index].description = event.target.value; })} /></label>
                  <label>Impact level<select value={item.severity} onChange={event => update(next => { next.symptoms[index].severity = event.target.value; })}>{severityOptions.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
                </article>
              ))}
            </div>
            <button type="button" className="fl-add-button" onClick={() => update(next => { (next.symptoms ??= []).push({ id: nextId(next, 'symptom'), description: '', severity: 'medium' }); })}><Plus size={14} /> Add symptom</button>
          </section>

          <section className="fl-author-block" data-author-step="answer-key">
            <div className="fl-author-heading"><span>3</span><div><h3>Build the answer key</h3><p>Define the true cause, explain why it fits, and add realistic alternatives that test reasoning instead of recall.</p></div></div>
            <label>Correct root cause<input required minLength={2} maxLength={220} value={content.rootCause?.title ?? ''} onChange={event => update(next => {
              next.rootCause.title = event.target.value;
              const option = next.rootCauseOptions.find((candidate: any) => candidate.id === next.rootCause.id);
              if (option) option.title = event.target.value;
            })} /></label>
            <label>Why this is the cause<textarea required minLength={2} maxLength={3000} rows={4} value={content.rootCause?.description ?? ''} onChange={event => update(next => { next.rootCause.description = event.target.value; })} placeholder="Connect the symptoms and evidence to the failure mechanism." /></label>
            <label>Instructor explanation<textarea required minLength={2} maxLength={6000} rows={5} value={content.rootCause?.technicalDetail ?? ''} onChange={event => update(next => { next.rootCause.technicalDetail = event.target.value; })} placeholder="Explain the full chain of causation and why the alternatives do not fit. Learners see this only in the debrief." /></label>
            <div className="fl-subhead"><b>Answer choices</b><small>The correct answer remains linked automatically.</small></div>
            {(content.rootCauseOptions ?? []).map((item: any, index: number) => {
              const correct = item.id === content.rootCause.id;
              return <div className="fl-inline-edit" key={item.id}><span>{correct ? 'Correct' : `Alternative ${index}`}</span><input aria-label={correct ? 'Correct answer choice' : `Alternative answer choice ${index}`} required minLength={2} maxLength={220} value={item.title ?? ''} onChange={event => update(next => { next.rootCauseOptions[index].title = event.target.value; if (correct) next.rootCause.title = event.target.value; })} /><button type="button" className="fl-icon-button" aria-label={`Remove answer choice ${index + 1}`} disabled={correct || content.rootCauseOptions.length <= 2} onClick={() => update(next => { next.rootCauseOptions.splice(index, 1); })}><Trash2 size={14} /></button></div>;
            })}
            <button type="button" className="fl-add-button" onClick={() => update(next => { (next.rootCauseOptions ??= []).push({ id: nextId(next, 'root-cause-option'), title: '' }); })}><Plus size={14} /> Add alternative answer</button>
          </section>

          <section className="fl-author-block" data-author-step="evidence">
            <div className="fl-author-heading"><span>4</span><div><h3>Create the evidence trail</h3><p>Add at least four findings. Mix decisive clues with context and believable wrong turns.</p></div></div>
            <div className="fl-author-stack">
              {(content.evidence ?? []).map((item: any, index: number) => (
                <article className="fl-author-item" key={item.id}>
                  <div className="fl-author-row"><b>Evidence {index + 1}</b><span className={`fl-evidence-kind ${item.category}`}>{item.category}</span><button type="button" className="fl-icon-button" aria-label={`Remove evidence ${index + 1}`} disabled={content.evidence.length <= 4} onClick={() => removeEvidence(index)}><Trash2 size={14} /></button></div>
                  <div className="fl-two"><label>Finding name<input required minLength={2} maxLength={180} value={item.title ?? ''} onChange={event => update(next => { next.evidence[index].title = event.target.value; })} /></label><label>Teaching role<select value={item.category} onChange={event => update(next => { next.evidence[index].category = event.target.value; })}>{evidenceCategories.map(value => <option value={value} key={value}>{value === 'red-herring' ? 'Plausible wrong turn' : value === 'contextual' ? 'Context' : 'Diagnostic clue'}</option>)}</select></label><label>Importance<select value={item.importance} onChange={event => update(next => { next.evidence[index].importance = event.target.value; })}>{evidenceImportance.map(value => <option value={value} key={value}>{value}</option>)}</select></label></div>
                  <label>What this finding shows<textarea required minLength={2} maxLength={3000} rows={3} value={item.description ?? ''} onChange={event => update(next => { next.evidence[index].description = event.target.value; })} /></label>
                </article>
              ))}
            </div>
            <button type="button" className="fl-add-button" onClick={() => update(next => { (next.evidence ??= []).push({ id: nextId(next, 'evidence'), title: '', description: '', category: 'clue', importance: 'medium' }); })}><Plus size={14} /> Add evidence</button>
          </section>

          <section className="fl-author-block" data-author-step="tests">
            <div className="fl-author-heading"><span>5</span><div><h3>Design the investigation</h3><p>Define safe, simulated checks and connect each result to the evidence it reveals. FaultlineLab does not run commands on live systems.</p></div></div>
            <div className="fl-author-stack">
              {(content.commands ?? []).map((item: any, index: number) => (
                <article className="fl-author-item" key={`command-${index}`}>
                  <div className="fl-author-row"><b>Test or check {index + 1}</b><button type="button" className="fl-icon-button" aria-label={`Remove test ${index + 1}`} disabled={content.commands.length <= 1} onClick={() => update(next => { next.commands.splice(index, 1); })}><Trash2 size={14} /></button></div>
                  <div className="fl-two"><label>What learners enter<input required maxLength={200} value={item.command ?? ''} onChange={event => update(next => { next.commands[index].command = event.target.value; })} placeholder="Example: inspect dns health" /></label><label>Accepted shortcuts<input maxLength={1000} value={(item.aliases ?? []).join(', ')} onChange={event => update(next => { next.commands[index].aliases = event.target.value.split(',').map(value => value.trim()).filter(Boolean); })} placeholder="Comma-separated shortcuts" /></label></div>
                  <label>What this check does<textarea required maxLength={500} rows={2} value={item.description ?? ''} onChange={event => update(next => { next.commands[index].description = event.target.value; })} /></label>
                  <label>Simulated result<textarea required maxLength={20000} rows={4} value={item.output ?? ''} onChange={event => update(next => { next.commands[index].output = event.target.value; })} placeholder="The bounded result shown to the learner. No command is executed." /></label>
                  <fieldset className="fl-reveal-picker"><legend>Evidence revealed by this result</legend>{evidenceChoices.map((evidence: any) => <label className="fl-check" key={evidence.id}><input type="checkbox" checked={(item.revealsEvidence ?? []).includes(evidence.id)} onChange={() => toggleReveal('commands', index, evidence.id)} /><span>{evidence.title || `Evidence ${evidence.id}`}</span></label>)}</fieldset>
                </article>
              ))}
            </div>
            <button type="button" className="fl-add-button" onClick={() => update(next => { (next.commands ??= []).push({ command: '', aliases: [], description: '', output: '', revealsEvidence: [], risky: false }); })}><Plus size={14} /> Add simulated check</button>

            <details className="fl-guided-details">
              <summary><ListChecks size={15} /> Add log and ticket sources <small>Recommended for realistic investigations</small></summary>
              <div className="fl-author-stack">
                <div className="fl-subhead"><b>Event or log entries</b><button type="button" className="fl-add-button" onClick={() => update(next => { (next.events ??= []).push({ id: nextId(next, 'event'), timestamp: new Date().toISOString(), source: '', level: 'error', message: '', details: '', revealsEvidence: [] }); })}><Plus size={14} /> Add log entry</button></div>
                {(content.events ?? []).map((item: any, index: number) => <article className="fl-author-item" key={item.id}><div className="fl-author-row"><b>Log entry {index + 1}</b><button type="button" className="fl-icon-button" aria-label={`Remove log entry ${index + 1}`} onClick={() => update(next => { next.events.splice(index, 1); })}><Trash2 size={14} /></button></div><div className="fl-two"><label>Source<input required maxLength={120} value={item.source ?? ''} onChange={event => update(next => { next.events[index].source = event.target.value; })} /></label><label>Level<select value={item.level} onChange={event => update(next => { next.events[index].level = event.target.value; })}>{eventLevels.map(value => <option value={value} key={value}>{value}</option>)}</select></label><label>Time<input required maxLength={100} value={item.timestamp ?? ''} onChange={event => update(next => { next.events[index].timestamp = event.target.value; })} /></label></div><label>Visible message<textarea required rows={2} maxLength={1000} value={item.message ?? ''} onChange={event => update(next => { next.events[index].message = event.target.value; })} /></label><label>Full details<textarea required rows={3} maxLength={5000} value={item.details ?? ''} onChange={event => update(next => { next.events[index].details = event.target.value; })} /></label><fieldset className="fl-reveal-picker"><legend>Evidence revealed</legend>{evidenceChoices.map((evidence: any) => <label className="fl-check" key={evidence.id}><input type="checkbox" checked={(item.revealsEvidence ?? []).includes(evidence.id)} onChange={() => toggleReveal('events', index, evidence.id)} /><span>{evidence.title || evidence.id}</span></label>)}</fieldset></article>)}
                <div className="fl-subhead"><b>Ticket or interview history</b><button type="button" className="fl-add-button" onClick={() => update(next => { (next.tickets ??= []).push({ id: nextId(next, 'ticket'), author: '', role: '', timestamp: new Date().toISOString(), content: '', redHerring: false, revealsEvidence: [] }); })}><Plus size={14} /> Add ticket note</button></div>
                {(content.tickets ?? []).map((item: any, index: number) => <article className="fl-author-item" key={item.id}><div className="fl-author-row"><b>Ticket note {index + 1}</b><button type="button" className="fl-icon-button" aria-label={`Remove ticket note ${index + 1}`} onClick={() => update(next => { next.tickets.splice(index, 1); })}><Trash2 size={14} /></button></div><div className="fl-two"><label>Author<input required maxLength={160} value={item.author ?? ''} onChange={event => update(next => { next.tickets[index].author = event.target.value; })} /></label><label>Role<input required maxLength={160} value={item.role ?? ''} onChange={event => update(next => { next.tickets[index].role = event.target.value; })} /></label><label>Time<input required maxLength={100} value={item.timestamp ?? ''} onChange={event => update(next => { next.tickets[index].timestamp = event.target.value; })} /></label></div><label>What they reported<textarea required rows={3} maxLength={5000} value={item.content ?? ''} onChange={event => update(next => { next.tickets[index].content = event.target.value; })} /></label><label className="fl-check"><input type="checkbox" checked={item.redHerring === true} onChange={event => update(next => { next.tickets[index].redHerring = event.target.checked; })} /><span>This report is a deliberate wrong turn</span></label><fieldset className="fl-reveal-picker"><legend>Evidence revealed</legend>{evidenceChoices.map((evidence: any) => <label className="fl-check" key={evidence.id}><input type="checkbox" checked={(item.revealsEvidence ?? []).includes(evidence.id)} onChange={() => toggleReveal('tickets', index, evidence.id)} /><span>{evidence.title || evidence.id}</span></label>)}</fieldset></article>)}
              </div>
            </details>
          </section>

          <section className="fl-author-block" data-author-step="hints">
            <div className="fl-author-heading"><span>6</span><div><h3>Build a fair hint ladder</h3><p>Hints should move from a gentle nudge to a near-reveal. Higher levels must cost more points.</p></div></div>
            <div className="fl-author-stack">
              {(content.hints ?? []).map((item: any, index: number) => <article className="fl-author-item fl-hint-item" key={item.level}><div className="fl-author-row"><b>Level {item.level}</b><label>Point cost<input type="number" min={0} max={50} value={item.scorePenalty} onChange={event => update(next => { next.hints[index].scorePenalty = Number(event.target.value); })} /></label></div><label>Learner-facing label<input required maxLength={100} value={item.label ?? ''} onChange={event => update(next => { next.hints[index].label = event.target.value; })} /></label><label>Hint text<textarea required minLength={2} maxLength={2000} rows={2} value={item.text ?? ''} onChange={event => update(next => { next.hints[index].text = event.target.value; })} /></label></article>)}
            </div>
          </section>

          <section className="fl-author-block" data-author-step="remediation">
            <div className="fl-author-heading"><span>7</span><div><h3>Turn the diagnosis into learning</h3><p>Define the expected fix, the concepts used for scoring, and the controls learners should carry into real work.</p></div></div>
            <label>Expected remediation<textarea required minLength={2} maxLength={5000} rows={5} value={content.remediation ?? ''} onChange={event => update(next => { next.remediation = event.target.value; })} placeholder="Describe the corrective steps and how to verify the original failure is resolved." /></label>
            <label>Scoring concepts <small>One key term or phrase per line; include at least two. A learner can phrase the answer naturally as long as these concepts are present.</small><textarea required rows={4} value={(content.remediationKeywords ?? []).join('\n')} onChange={event => setList('remediationKeywords', event.target.value)} /></label>
            <label>Learning goals and preventive controls <small>One outcome per line. These appear in the instructor answer as measures that prevent recurrence.</small><textarea rows={4} value={(content.preventativeMeasures ?? []).join('\n')} onChange={event => setList('preventativeMeasures', event.target.value)} placeholder="Learners can identify…&#10;Add monitoring for…" /></label>
            <label>Common wrong turns <small>One per line. Use these to explain what looks plausible but is not causal.</small><textarea rows={3} value={(content.redHerrings ?? []).join('\n')} onChange={event => setList('redHerrings', event.target.value)} /></label>
          </section>

          <section className="fl-author-preview" data-testid="faultlinelab-author-preview">
            <ClipboardCheck size={22} />
            <div><span>LEARNER PREVIEW</span><h3>{content.description || 'Your scenario will appear here'}</h3><p>{content.briefing || 'Add a briefing so learners know their objective and constraints.'}</p><div className="fl-preview-facts"><span>{content.symptoms?.length ?? 0} symptoms</span><ChevronRight size={13} /><span>{content.commands?.length ?? 0} checks</span><ChevronRight size={13} /><span>{content.evidence?.length ?? 0} evidence items</span><ChevronRight size={13} /><span>scored diagnosis</span></div></div>
          </section>
        </>
      )}

      <details className="fl-author-block fl-advanced" data-testid="faultlinelab-advanced-json">
        <summary><FileCode2 size={16} /><span><b>Advanced JSON</b><small>Optional escape hatch for experienced authors and exported cases</small></span></summary>
        <p>Changes here update the guided editor when the JSON is valid. IDs and evidence links are intentionally visible only in this advanced view.</p>
        <label>Challenge JSON<textarea className="fl-json" value={rawContent} onChange={event => onChange(event.target.value)} rows={24} spellCheck={false} aria-describedby="faultline-json-help" /></label>
        <small id="faultline-json-help">Invalid JSON cannot be saved or server-validated. Importing a file does not publish it.</small>
      </details>
    </div>
  );
}

const guidedStyles = `
  .fl-guided-author{display:grid;gap:14px}.fl-author-quality,.fl-author-block,.fl-author-preview{border:1px solid rgba(148,163,184,.16);border-radius:14px;background:rgba(5,7,15,.5);padding:15px;display:grid;gap:12px}.fl-author-quality{border-color:rgba(34,211,238,.24);background:linear-gradient(135deg,rgba(8,47,73,.22),rgba(17,20,36,.76))}.fl-author-quality>div:first-child>span,.fl-author-preview span{color:#67e8f9;font:800 10px ui-monospace,monospace;letter-spacing:.15em}.fl-author-quality h3,.fl-author-block h3,.fl-author-preview h3{margin:4px 0}.fl-quality-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.fl-quality-list>span{display:flex;align-items:center;gap:7px;border:1px solid rgba(148,163,184,.14);border-radius:9px;padding:8px;color:#cbd5e1;font-size:11px}.fl-quality-list .ready{color:#6ee7b7;border-color:rgba(52,211,153,.22)}.fl-quality-list .recommended{color:#fde68a;border-color:rgba(251,191,36,.22)}.fl-quality-list .needs-work{color:#fca5a5;border-color:rgba(248,113,113,.2)}.fl-server-check{display:flex;gap:9px;align-items:flex-start;border-radius:10px;padding:10px}.fl-server-check.valid{background:rgba(6,78,59,.2);color:#6ee7b7}.fl-server-check.invalid{background:rgba(127,29,29,.18);color:#fca5a5}.fl-server-check>div{display:grid;gap:3px}.fl-server-check small{display:block;color:inherit}.fl-author-heading{display:flex;gap:11px;align-items:flex-start}.fl-author-heading>span{flex:0 0 30px;width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:rgba(124,58,237,.28);border:1px solid rgba(196,181,253,.32);color:#ddd6fe;font-weight:850}.fl-author-heading p,.fl-subhead small,.fl-author-block label small,.fl-advanced small{color:#9ca3b9;margin:2px 0}.fl-author-stack{display:grid;gap:10px}.fl-author-item{border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(15,23,42,.4);padding:12px;display:grid;gap:9px}.fl-author-row,.fl-subhead,.fl-inline-edit{display:flex;align-items:center;gap:8px}.fl-author-row,.fl-subhead{justify-content:space-between}.fl-author-row>label{display:flex;align-items:center;grid-template-columns:auto 88px}.fl-author-row>label input{width:88px}.fl-inline-edit>span{flex:0 0 92px;color:#a78bfa;font-size:11px;font-weight:750}.fl-inline-edit>input{flex:1}.fl-icon-button{padding:7px!important;min-width:32px}.fl-add-button{justify-self:start}.fl-evidence-kind{margin-left:auto;border-radius:999px;padding:4px 7px;color:#cbd5e1;background:rgba(148,163,184,.12);font-size:9px;text-transform:uppercase}.fl-evidence-kind.clue{color:#6ee7b7}.fl-evidence-kind.red-herring{color:#fca5a5}.fl-reveal-picker{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.fl-reveal-picker legend{grid-column:1/-1}.fl-guided-details{border:1px solid rgba(167,139,250,.18);border-radius:11px;padding:11px}.fl-guided-details>summary,.fl-advanced>summary{display:flex;align-items:center;gap:8px;cursor:pointer;color:#ddd6fe;font-weight:750}.fl-guided-details>summary small{margin-left:auto;color:#9ca3b9;font-weight:500}.fl-guided-details[open]>summary,.fl-advanced[open]>summary{margin-bottom:12px}.fl-author-preview{grid-template-columns:auto 1fr;border-color:rgba(52,211,153,.28);background:linear-gradient(135deg,rgba(6,78,59,.14),rgba(17,20,36,.76))}.fl-author-preview>svg{color:#6ee7b7}.fl-preview-facts{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:#cbd5e1;font-size:11px}.fl-advanced>summary span{display:grid}.fl-advanced>summary small{font-weight:500}.fl-advanced-error{grid-template-columns:auto 1fr;color:#fca5a5;border-color:rgba(248,113,113,.28)}
  @media(max-width:720px){.fl-quality-list,.fl-reveal-picker{grid-template-columns:1fr}.fl-inline-edit{align-items:flex-start;flex-wrap:wrap}.fl-inline-edit>span{flex:1 1 100%}.fl-guided-details>summary small{display:none}}
`;
