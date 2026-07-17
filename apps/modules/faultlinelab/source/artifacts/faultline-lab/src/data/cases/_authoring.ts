import type {
  CaseCategory,
  CaseDefinition,
  Difficulty,
  EventLogEntry,
  EvidenceItem,
  HintTier,
  Symptom,
  TicketNote,
  ToolCommand,
  ToolType,
} from '@/types';

type Severity = Symptom['severity'];
type Importance = EvidenceItem['importance'];
type EvidenceKind = EvidenceItem['category'];
type EventLevel = EventLogEntry['level'];

export interface CaseSpec {
  id: string;
  title: string;
  category: CaseCategory;
  difficulty: Difficulty;
  description: string;
  briefing: string;
  symptoms: Array<[string, Severity]>;
  rootCause: { title: string; description: string; technicalDetail: string };
  evidence: Array<{
    id: string;
    title: string;
    description: string;
    kind?: EvidenceKind;
    importance?: Importance;
  }>;
  hints: [string, string, string, string];
  commands: Array<{
    command: string;
    aliases?: string[];
    description: string;
    output: string;
    reveals?: string[];
  }>;
  events: Array<{
    timestamp: string;
    source: string;
    level: EventLevel;
    message: string;
    details?: string;
    reveals?: string[];
  }>;
  tickets: Array<{
    author: string;
    role: string;
    timestamp: string;
    content: string;
    isRedHerring?: boolean;
    reveals?: string[];
  }>;
  redHerrings: string[];
  remediation: string;
  preventativeMeasures: string[];
  tools?: ToolType[];
}

const HINT_LABELS = ['Subtle Nudge', 'Directional Clue', 'Stronger Clue', 'Reveal Path'] as const;
const HINT_PENALTIES = [5, 10, 20, 35] as const;

export function defineCase(spec: CaseSpec): CaseDefinition {
  const symptoms: Symptom[] = spec.symptoms.map(([description, severity], idx) => ({
    id: `s${idx + 1}`,
    description,
    severity,
  }));

  const evidence: EvidenceItem[] = spec.evidence.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.kind ?? 'clue',
    importance: e.importance ?? 'medium',
    unlocked: false,
  }));

  const hints: HintTier[] = spec.hints.map((text, idx) => ({
    level: (idx + 1) as HintTier['level'],
    label: HINT_LABELS[idx],
    text,
    scorePenalty: HINT_PENALTIES[idx],
  }));

  const terminalCommands: ToolCommand[] = spec.commands.map((c) => ({
    command: c.command,
    aliases: c.aliases,
    description: c.description,
    output: c.output,
    revealsEvidence: c.reveals,
  }));

  const eventLogs: EventLogEntry[] = spec.events.map((e, idx) => ({
    id: `el${idx + 1}`,
    timestamp: e.timestamp,
    source: e.source,
    level: e.level,
    message: e.message,
    details: e.details,
    revealsEvidence: e.reveals,
  }));

  const ticketHistory: TicketNote[] = spec.tickets.map((t, idx) => ({
    id: `th${idx + 1}`,
    author: t.author,
    role: t.role,
    timestamp: t.timestamp,
    content: t.content,
    isRedHerring: t.isRedHerring,
    revealsEvidence: t.reveals,
  }));

  return {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    difficulty: spec.difficulty,
    description: spec.description,
    briefing: spec.briefing,
    symptoms,
    rootCause: { id: 'rc1', ...spec.rootCause },
    evidence,
    hints,
    terminalCommands,
    eventLogs,
    ticketHistory,
    availableTools: spec.tools ?? ['terminal', 'event-log', 'ticket-history'],
    redHerrings: spec.redHerrings,
    remediation: spec.remediation,
    preventativeMeasures: spec.preventativeMeasures,
    maxScore: 100,
  };
}

export function validateAuthoredCase(c: CaseDefinition): string[] {
  const issues: string[] = [];
  if (!c.id) issues.push('missing id');
  if (!c.title) issues.push('missing title');
  if (!c.briefing || c.briefing.length < 40) issues.push(`${c.id}: briefing too short`);
  if (c.symptoms.length < 2) issues.push(`${c.id}: needs >=2 symptoms`);
  if (c.evidence.length < 4) issues.push(`${c.id}: needs >=4 evidence items`);
  if (c.hints.length !== 4) issues.push(`${c.id}: needs exactly 4 hints`);
  if (c.terminalCommands.length < 3) issues.push(`${c.id}: needs >=3 terminal commands`);
  if (c.eventLogs.length < 2) issues.push(`${c.id}: needs >=2 event log entries`);
  if (c.ticketHistory.length < 1) issues.push(`${c.id}: needs >=1 ticket note`);
  if (!c.remediation) issues.push(`${c.id}: missing remediation`);
  if (c.preventativeMeasures.length < 1) issues.push(`${c.id}: needs >=1 preventative measure`);

  const evIds = new Set(c.evidence.map((e) => e.id));
  const refSources: Array<{ src: string; refs?: string[] }> = [
    ...c.terminalCommands.map((t) => ({ src: `cmd:${t.command}`, refs: t.revealsEvidence })),
    ...c.eventLogs.map((e) => ({ src: `event:${e.id}`, refs: e.revealsEvidence })),
    ...c.ticketHistory.map((t) => ({ src: `ticket:${t.id}`, refs: t.revealsEvidence })),
  ];
  for (const r of refSources) {
    for (const id of r.refs ?? []) {
      if (!evIds.has(id)) issues.push(`${c.id}: ${r.src} references unknown evidence ${id}`);
    }
  }

  const reachable = new Set<string>();
  for (const r of refSources) for (const id of r.refs ?? []) reachable.add(id);
  for (const e of c.evidence) {
    if (e.category === 'clue' && e.importance === 'critical' && !reachable.has(e.id)) {
      issues.push(`${c.id}: critical clue ${e.id} is not reachable from any source`);
    }
  }

  return issues;
}
