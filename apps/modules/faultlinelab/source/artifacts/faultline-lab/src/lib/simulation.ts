import type {
  CaseDefinition,
  CaseState,
  CaseChaosSnapshot,
  EventLogEntry,
  ToolOutput,
  DiagnosisSubmission,
  ScoreBreakdown,
  ScoreTier,
  Debrief,
  EvidenceItem,
} from '@/types';
import {
  chaosTimeLimitMs,
  computeChaosMultiplier,
  isChaosActive,
  type ChaosSettings,
} from '@/lib/chaos';

export function createCaseState(caseId: string, chaos?: ChaosSettings | null): CaseState {
  const startedAt = Date.now();
  const snapshot: CaseChaosSnapshot | undefined = chaos
    ? {
        shuffleEvidence: chaos.shuffleEvidence,
        injectRedHerrings: chaos.injectRedHerrings,
        timePressure: chaos.timePressure,
        hintBlackout: chaos.hintBlackout,
        intensity: chaos.intensity,
      }
    : undefined;
  return {
    caseId,
    status: 'active',
    startedAt,
    unlockedEvidence: [],
    actionLog: [],
    hintsUsed: [],
    riskyActions: 0,
    totalCommands: 0,
    chaos: snapshot,
    timeLimitMs: chaosTimeLimitMs(chaos),
  };
}

function seededRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const HERRING_TITLES = [
  'Phantom packet drop on uplink',
  'Stale DNS cache spike',
  'Anomalous fan RPM jitter',
  'Unrelated cron job failure',
  'Voltage micro-dip on rail B',
  'Recent firmware advisory',
  'Idle CPU thermal blip',
  'Background indexer surge',
];

export function applyChaosToCaseDef(
  caseDef: CaseDefinition,
  chaos: ChaosSettings | CaseChaosSnapshot | undefined | null,
  seed: number
): CaseDefinition {
  if (!chaos || !isChaosActive(chaos as ChaosSettings)) return caseDef;

  let evidence: EvidenceItem[] = [...caseDef.evidence];
  let eventLogs: EventLogEntry[] = [...caseDef.eventLogs];
  const rng = seededRng(seed);

  if (chaos.injectRedHerrings) {
    const extra = Math.max(1, Math.round(2 * chaos.intensity));
    for (let i = 0; i < extra; i++) {
      const id = `chaos-rh-evidence-${i}`;
      const title = HERRING_TITLES[i % HERRING_TITLES.length];
      evidence.push({
        id,
        title,
        description:
          'Plausible-but-unrelated lead surfaced by Chaos Mode. Verify before relying on it.',
        category: 'red-herring',
        importance: 'medium',
        unlocked: false,
      });
      const ts = new Date(seed + i * 1000).toISOString();
      eventLogs.push({
        id: `chaos-rh-log-${i}`,
        timestamp: ts,
        source: 'chaos-injector',
        level: i % 2 === 0 ? 'warning' : 'error',
        message: `Possible anomaly: ${title}`,
        details:
          'Injected by Chaos Mode. Treat as a candidate lead, not ground truth.\nIf you cite this in your diagnosis it will count as a red herring.',
        revealsEvidence: [id],
      });
    }
  }

  if (chaos.shuffleEvidence) {
    evidence = shuffle(evidence, rng);
    eventLogs = shuffle(eventLogs, rng);
  }

  return { ...caseDef, evidence, eventLogs };
}

export function processCommand(
  caseDef: CaseDefinition,
  state: CaseState,
  command: string
): { output: ToolOutput; newState: CaseState } {
  const normalizedCmd = command.trim().toLowerCase();

  const matchedCommand = caseDef.terminalCommands.find(tc => {
    if (tc.command.toLowerCase() === normalizedCmd) return true;
    if (tc.aliases?.some(a => a.toLowerCase() === normalizedCmd)) return true;
    const cmdWords = normalizedCmd.split(' ');
    const tcWords = tc.command.toLowerCase().split(' ');
    if (cmdWords[0] === tcWords[0] && cmdWords.length >= tcWords.length) {
      return tcWords.every((w, i) => cmdWords[i] === w);
    }
    return false;
  });

  if (!matchedCommand) {
    const helpOutput = getHelpForUnknownCommand(normalizedCmd, caseDef);
    return {
      output: {
        command,
        output: helpOutput,
        timestamp: Date.now(),
      },
      newState: {
        ...state,
        totalCommands: state.totalCommands + 1,
        actionLog: [
          ...state.actionLog,
          { toolType: 'terminal', command, timestamp: Date.now() },
        ],
      },
    };
  }

  const newEvidence = (matchedCommand.revealsEvidence || []).filter(
    eId => !state.unlockedEvidence.includes(eId)
  );

  const newState: CaseState = {
    ...state,
    totalCommands: state.totalCommands + 1,
    unlockedEvidence: [...state.unlockedEvidence, ...newEvidence],
    riskyActions: matchedCommand.isRisky
      ? state.riskyActions + 1
      : state.riskyActions,
    actionLog: [
      ...state.actionLog,
      { toolType: 'terminal', command, timestamp: Date.now() },
    ],
  };

  return {
    output: {
      command,
      output: matchedCommand.output,
      timestamp: Date.now(),
      evidenceUnlocked: newEvidence.length > 0 ? newEvidence : undefined,
    },
    newState,
  };
}

export function processEventLogView(
  caseDef: CaseDefinition,
  state: CaseState,
  logId: string
): CaseState {
  const logEntry = caseDef.eventLogs.find(e => e.id === logId);
  if (!logEntry || !logEntry.revealsEvidence) return state;

  const newEvidence = logEntry.revealsEvidence.filter(
    eId => !state.unlockedEvidence.includes(eId)
  );

  if (newEvidence.length === 0) return state;

  return {
    ...state,
    unlockedEvidence: [...state.unlockedEvidence, ...newEvidence],
    actionLog: [
      ...state.actionLog,
      {
        toolType: 'event-log',
        command: `Viewed log: ${logEntry.message}`,
        timestamp: Date.now(),
      },
    ],
  };
}

export function processTicketNoteView(
  caseDef: CaseDefinition,
  state: CaseState,
  noteId: string
): CaseState {
  const note = caseDef.ticketHistory.find(n => n.id === noteId);
  if (!note || !note.revealsEvidence) return state;

  const newEvidence = note.revealsEvidence.filter(
    eId => !state.unlockedEvidence.includes(eId)
  );

  if (newEvidence.length === 0) return state;

  return {
    ...state,
    unlockedEvidence: [...state.unlockedEvidence, ...newEvidence],
    actionLog: [
      ...state.actionLog,
      {
        toolType: 'ticket-history',
        command: `Reviewed note by ${note.author}`,
        timestamp: Date.now(),
      },
    ],
  };
}

export function useHint(state: CaseState, level: number): CaseState {
  if (state.chaos?.hintBlackout) return state;
  if (state.hintsUsed.includes(level)) return state;
  return {
    ...state,
    hintsUsed: [...state.hintsUsed, level],
  };
}

export function isHintBlackedOut(state: CaseState | null | undefined): boolean {
  return !!state?.chaos?.hintBlackout;
}

export function evaluateDiagnosis(
  caseDef: CaseDefinition,
  state: CaseState,
  submission: DiagnosisSubmission
): ScoreBreakdown {
  const diagnosisAccuracy = calculateDiagnosisAccuracy(
    caseDef,
    submission.rootCause
  );
  const evidenceQuality = calculateEvidenceQuality(
    caseDef,
    state.unlockedEvidence,
    submission.supportingEvidence
  );
  const remediationQuality = calculateRemediationQuality(
    caseDef,
    submission.proposedRemediation
  );
  const efficiency = calculateEfficiency(state);

  const hintPenalty = state.hintsUsed.reduce((total, level) => {
    const hint = caseDef.hints.find(h => h.level === level);
    return total + (hint?.scorePenalty || 0);
  }, 0);

  const riskyActionPenalty = state.riskyActions * 3;

  let timePenalty = 0;
  if (state.chaos?.timePressure && state.timeLimitMs) {
    const completed = state.completedAt ?? Date.now();
    const elapsed = completed - state.startedAt;
    if (elapsed > state.timeLimitMs) {
      const overSec = (elapsed - state.timeLimitMs) / 1000;
      timePenalty = Math.min(20, Math.floor(overSec / 30) * 2);
    }
  }

  const rawTotal =
    diagnosisAccuracy + evidenceQuality + remediationQuality + efficiency;
  const baseTotal = Math.max(
    0,
    rawTotal - hintPenalty - riskyActionPenalty - timePenalty
  );

  const chaosMultiplier = computeChaosMultiplier(state.chaos);
  const total = Math.round(baseTotal * chaosMultiplier);
  const maxPossible = Math.round(caseDef.maxScore * chaosMultiplier);

  const tier = determineTier(diagnosisAccuracy, total, maxPossible);

  return {
    diagnosisAccuracy,
    evidenceQuality,
    remediationQuality,
    efficiency,
    hintPenalty,
    riskyActionPenalty,
    timePenalty,
    chaosMultiplier,
    baseTotal,
    total,
    maxPossible,
    tier,
  };
}

function calculateDiagnosisAccuracy(
  caseDef: CaseDefinition,
  submittedCause: string
): number {
  const rootCauseTerms = [
    ...caseDef.rootCause.title.toLowerCase().split(/\s+/),
    ...caseDef.rootCause.description.toLowerCase().split(/\s+/),
  ];

  const significantTerms = rootCauseTerms.filter(t => t.length > 3);
  const uniqueTerms = [...new Set(significantTerms)];

  const submittedLower = submittedCause.toLowerCase();
  const matchCount = uniqueTerms.filter(term =>
    submittedLower.includes(term)
  ).length;

  const matchRatio = matchCount / Math.min(uniqueTerms.length, 15);

  if (matchRatio > 0.3) return 40;
  if (matchRatio > 0.15) return 30;
  if (matchRatio > 0.08) return 20;
  if (matchRatio > 0.03) return 10;
  return 5;
}

function calculateEvidenceQuality(
  caseDef: CaseDefinition,
  unlockedIds: string[],
  selectedIds: string[]
): number {
  const criticalEvidence = caseDef.evidence.filter(
    e => e.importance === 'critical' && e.category === 'clue'
  );
  const selectedEvidence = selectedIds
    .map(id => caseDef.evidence.find(e => e.id === id))
    .filter((e): e is EvidenceItem => !!e);

  const criticalFound = criticalEvidence.filter(e =>
    selectedIds.includes(e.id)
  ).length;
  const redHerringSelected = selectedEvidence.filter(
    e => e.category === 'red-herring'
  ).length;

  let score = 0;
  if (criticalEvidence.length > 0) {
    score += (criticalFound / criticalEvidence.length) * 20;
  }

  const clueSelected = selectedEvidence.filter(
    e => e.category === 'clue'
  ).length;
  score += Math.min(clueSelected * 3, 10);

  score -= redHerringSelected * 3;

  return Math.max(0, Math.min(25, Math.round(score)));
}

function calculateRemediationQuality(
  caseDef: CaseDefinition,
  submittedRemediation: string
): number {
  const remTerms = caseDef.remediation.toLowerCase().split(/\s+/);
  const significantTerms = remTerms.filter(t => t.length > 3);
  const uniqueTerms = [...new Set(significantTerms)];

  const submittedLower = submittedRemediation.toLowerCase();
  const matchCount = uniqueTerms.filter(term =>
    submittedLower.includes(term)
  ).length;

  const matchRatio = matchCount / Math.min(uniqueTerms.length, 10);

  if (matchRatio > 0.3) return 20;
  if (matchRatio > 0.15) return 15;
  if (matchRatio > 0.08) return 10;
  if (matchRatio > 0.03) return 5;
  return 2;
}

function calculateEfficiency(state: CaseState): number {
  const timeSpent = (Date.now() - state.startedAt) / 60000;
  const commandCount = state.totalCommands;

  let score = 15;

  if (commandCount > 25) score -= 3;
  if (commandCount > 40) score -= 3;
  if (commandCount > 60) score -= 4;

  if (timeSpent > 30) score -= 2;
  if (timeSpent > 60) score -= 3;

  return Math.max(0, score);
}

function determineTier(
  diagnosisAccuracy: number,
  total: number,
  maxPossible: number
): ScoreTier {
  const percentage = total / maxPossible;

  if (diagnosisAccuracy < 15) return 'Misdiagnosed';
  if (percentage >= 0.8) return 'Surgical';
  if (percentage >= 0.55) return 'Solid';
  return 'Sloppy but Correct';
}

export function generateDebrief(
  caseDef: CaseDefinition,
  state: CaseState,
  scoreBreakdown: ScoreBreakdown
): Debrief {
  const cluesThatMattered = caseDef.evidence.filter(
    e => e.category === 'clue' && e.importance !== 'low'
  );

  return {
    caseId: caseDef.id,
    actualRootCause: caseDef.rootCause,
    cluesThatMattered,
    misleadingClues: caseDef.redHerrings,
    recommendedRemediation: caseDef.remediation,
    preventativeMeasures: caseDef.preventativeMeasures,
    scoreBreakdown,
    achievementsUnlocked: checkAchievements(caseDef, state, scoreBreakdown),
    actionLog: state.actionLog,
    totalTime: (state.completedAt || Date.now()) - state.startedAt,
  };
}

function checkAchievements(
  caseDef: CaseDefinition,
  state: CaseState,
  score: ScoreBreakdown
): string[] {
  const achievements: string[] = [];

  if (score.tier === 'Surgical') achievements.push('No Guesswork');
  if (state.hintsUsed.length === 0 && score.total > 70)
    achievements.push('Clean Hands');
  if (state.totalCommands <= 10 && score.total > 60)
    achievements.push('First Responder');
  if (score.hintPenalty === 0 && score.riskyActionPenalty === 0)
    achievements.push('Ghost in DNS');
  if (caseDef.category === 'networking' && score.tier !== 'Misdiagnosed')
    achievements.push('Packet Whisperer');
  if (caseDef.category === 'automotive' && score.tier !== 'Misdiagnosed')
    achievements.push('Voltage Hunter');
  if (
    state.unlockedEvidence.some(eId => {
      const ev = caseDef.evidence.find(e => e.id === eId);
      return ev?.category === 'red-herring';
    }) &&
    score.tier !== 'Misdiagnosed'
  )
    achievements.push('Red Herring Survivor');

  return achievements;
}

function getHelpForUnknownCommand(cmd: string, caseDef: CaseDefinition): string {
  const firstWord = cmd.split(' ')[0];
  const similar = caseDef.terminalCommands.filter(tc => {
    const tcFirst = tc.command.toLowerCase().split(' ')[0];
    return tcFirst === firstWord || tc.command.toLowerCase().includes(firstWord);
  });

  if (similar.length > 0) {
    const suggestions = similar
      .map(s => `  ${s.command} - ${s.description}`)
      .join('\n');
    return `Command not recognized: "${cmd}"\n\nDid you mean:\n${suggestions}\n\nType "help" for available commands.`;
  }

  const availableCommands = caseDef.terminalCommands
    .map(tc => `  ${tc.command.padEnd(40)} ${tc.description}`)
    .join('\n');
  return `Command not recognized: "${cmd}"\n\nAvailable commands:\n${availableCommands}`;
}
