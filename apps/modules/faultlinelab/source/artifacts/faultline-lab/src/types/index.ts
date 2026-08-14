export type CaseCategory = 
  | 'windows-ad'
  | 'networking'
  | 'automotive'
  | 'electronics'
  | 'servers'
  | 'mixed';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type ToolType = 
  | 'terminal'
  | 'event-log'
  | 'ticket-history'
  | 'network-map'
  | 'service-inspector'
  | 'registry-viewer'
  | 'sensor-graph'
  | 'obd-panel'
  | 'firewall-table';

export interface Symptom {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RootCause {
  id: string;
  title: string;
  description: string;
  technicalDetail: string;
}

export interface ToolCommand {
  command: string;
  aliases?: string[];
  description: string;
  output: string;
  revealsEvidence?: string[];
  isRisky?: boolean;
}

export interface ToolAction {
  toolType: ToolType;
  command: string;
  timestamp: number;
}

export interface ToolOutput {
  command: string;
  output: string;
  timestamp: number;
  evidenceUnlocked?: string[];
}

export interface EvidenceItem {
  id: string;
  title: string;
  description: string;
  category: 'clue' | 'red-herring' | 'contextual';
  importance: 'low' | 'medium' | 'high' | 'critical';
  unlocked: boolean;
  unlockedBy?: string;
  unlockedAt?: number;
}

export interface HintTier {
  level: 1 | 2 | 3 | 4;
  label: string;
  text: string;
  scorePenalty: number;
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  source: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: string;
  revealsEvidence?: string[];
}

export interface TicketNote {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  content: string;
  isRedHerring?: boolean;
  revealsEvidence?: string[];
}

export interface CaseDefinition {
  id: string;
  title: string;
  category: CaseCategory;
  difficulty: Difficulty;
  description: string;
  briefing: string;
  symptoms: Symptom[];
  rootCause: RootCause;
  evidence: EvidenceItem[];
  hints: HintTier[];
  terminalCommands: ToolCommand[];
  eventLogs: EventLogEntry[];
  ticketHistory: TicketNote[];
  availableTools: ToolType[];
  redHerrings: string[];
  remediation: string;
  preventativeMeasures: string[];
  maxScore: number;
}

export interface DiagnosisSubmission {
  rootCause: string;
  supportingEvidence: string[];
  proposedRemediation: string;
  submittedAt: number;
}

export interface ScoreBreakdown {
  diagnosisAccuracy: number;
  evidenceQuality: number;
  remediationQuality: number;
  efficiency: number;
  hintPenalty: number;
  riskyActionPenalty: number;
  timePenalty: number;
  chaosMultiplier: number;
  baseTotal: number;
  total: number;
  maxPossible: number;
  tier: ScoreTier;
}

export type ScoreTier = 'Surgical' | 'Solid' | 'Sloppy but Correct' | 'Misdiagnosed';

export interface Debrief {
  caseId: string;
  actualRootCause: RootCause;
  cluesThatMattered: EvidenceItem[];
  misleadingClues: string[];
  recommendedRemediation: string;
  preventativeMeasures: string[];
  scoreBreakdown: ScoreBreakdown;
  achievementsUnlocked: string[];
  actionLog: ToolAction[];
  totalTime: number;
}

export interface DailyChallengeProgress {
  lastCompletedDateUtc: string | null;
  lastCompletedCaseId: string | null;
  currentStreak: number;
  bestStreak: number;
  totalCompleted: number;
}

export interface InvestigatorProfile {
  name: string;
  casesSolved: number;
  bestScores: Record<string, number>;
  totalScore: number;
  bestChaosScores: Record<string, number>;
  totalChaosScore: number;
  streakCurrent: number;
  streakBest: number;
  achievementsUnlocked: string[];
  solvedCaseIds: string[];
  createdAt: number;
  lastActiveAt: number;
  dailyChallenge: DailyChallengeProgress;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  condition: (state: CaseState) => boolean;
}

export interface CaseChaosSnapshot {
  shuffleEvidence: boolean;
  injectRedHerrings: boolean;
  timePressure: boolean;
  hintBlackout: boolean;
  intensity: number;
}

export interface CaseState {
  caseId: string;
  status: 'active' | 'submitted' | 'debriefed';
  startedAt: number;
  completedAt?: number;
  unlockedEvidence: string[];
  actionLog: ToolAction[];
  hintsUsed: number[];
  riskyActions: number;
  totalCommands: number;
  diagnosis?: DiagnosisSubmission;
  debrief?: Debrief;
  chaos?: CaseChaosSnapshot;
  timeLimitMs?: number;
}

export interface AppSettings {
  soundEnabled: boolean;
  animationsEnabled: boolean;
  terminalFontSize: number;
  onboardingTourCompletedAt?: number | null;
  /**
   * Millisecond timestamp at which the user dismissed (or acted on) the
   * post-sign-up pricing intro. When unset, signed-in users get routed to
   * the pricing screen once before the incident board.
   */
  pricingIntroSeenAt?: number | null;
  lastVisitedAt?: number | null;
  /**
   * Map of caseId -> millisecond timestamp at which the user last
   * acknowledged the "New" badge for that case. The badge re-appears if
   * the case is updated again after this timestamp.
   */
  seenNewCases?: Record<string, number>;
  /**
   * Stable key identifying the most recently dismissed subscription
   * renewal/expiration banner. Format:
   * `${subscriptionId}:${current_period_end}:${cancel|renew}`.
   * Changing any component (new cycle, cancel flip) re-shows the banner.
   */
  dismissedRenewalNoticeKey?: string | null;
}

export type AppView = 
  | 'boot'
  | 'incident-board'
  | 'investigation'
  | 'debrief'
  | 'profile'
  | 'account'
  | 'settings'
  | 'store'
  | 'pricing'
  | 'auth'
  | 'admin'
  | 'daily'
  | 'sandbox'
  | 'access-denied';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}
