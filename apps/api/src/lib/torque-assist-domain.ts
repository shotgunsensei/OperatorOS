import { createHash } from 'node:crypto';
import {
  TORQUESHED_CREDIT_CATALOG,
  torqueShedCreditPackage,
  type TorqueShedCreditPackage,
} from './torqueshed-credit-catalog.js';

export const TORQUE_ASSIST_SYSTEM_PROMPT = `OPERATOROS_TORQUE_ASSIST_V1
You are an evidence-driven automotive diagnostic planning assistant. Return only one JSON object.
Never claim that an unverified repair is confirmed. Separate observed facts, user-entered facts,
assumptions, ranked hypotheses, safety warnings, recommended tests, and follow-up questions.
When evidence is insufficient, set status to follow_up_required and ask targeted questions.
For braking, steering, fuel, high-voltage, airbag, lifting, fire, or other high-risk work, require
appropriate isolation, qualified-service escalation, and stop conditions. Do not provide instructions
to bypass safety systems. The response schema is:
{
  "status":"follow_up_required"|"plan_ready",
  "summary":"string",
  "facts":[{"source":"observed"|"user_entered","statement":"string"}],
  "assumptions":["string"],
  "hypotheses":[{"rank":1,"description":"string","confidence":"low"|"medium","supportingEvidence":["string"],"contradictingEvidence":["string"]}],
  "safetyWarnings":[{"category":"string","warning":"string","escalation":"string"}],
  "recommendedTests":[{"priority":1,"title":"string","rationale":"string","procedure":"string","stopConditions":["string"]}],
  "followUpQuestions":["string"]
}`;

export const TORQUE_ASSIST_DISCLAIMER =
  'Torque Assist provides diagnostic planning support, not a verified repair or a substitute for service information, proper tooling, or a qualified technician. Stop work and escalate whenever conditions, training, equipment, or safety controls are inadequate.';

export const TORQUE_ASSIST_MAX_CONTEXT_CHARS = 48_000;
export const TORQUE_ASSIST_MAX_PROVIDER_ATTEMPTS = 2;
export const TORQUE_ASSIST_MAX_OUTPUT_UNITS = 1_200;
export const TORQUE_ASSIST_RESERVATION_TTL_MS = 3 * 60_000;
export const TORQUE_ASSIST_USER_LIMIT_PER_MINUTE = 5;
export const TORQUE_ASSIST_TENANT_LIMIT_PER_MINUTE = 20;

export const TORQUE_TOKEN_PACKAGES = TORQUESHED_CREDIT_CATALOG;
export type TorqueTokenPackage = TorqueShedCreditPackage;

export interface TorqueAssistFact {
  source: 'observed' | 'user_entered';
  statement: string;
}

export interface TorqueAssistHypothesis {
  rank: number;
  description: string;
  confidence: 'low' | 'medium';
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

export interface TorqueAssistSafetyWarning {
  category: string;
  warning: string;
  escalation: string;
}

export interface TorqueAssistRecommendedTest {
  priority: number;
  title: string;
  rationale: string;
  procedure: string;
  stopConditions: string[];
}

export interface TorqueAssistResult {
  status: 'follow_up_required' | 'plan_ready';
  summary: string;
  facts: TorqueAssistFact[];
  assumptions: string[];
  hypotheses: TorqueAssistHypothesis[];
  safetyWarnings: TorqueAssistSafetyWarning[];
  recommendedTests: TorqueAssistRecommendedTest[];
  followUpQuestions: string[];
  disclaimer: string;
}

export class TorqueAssistDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 422,
  ) {
    super(message);
    this.name = 'TorqueAssistDomainError';
  }
}

function boundedText(value: unknown, field: string, max = 4_000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new TorqueAssistDomainError(`${field} is invalid`, 'TORQUE_ASSIST_RESPONSE_INVALID');
  }
  return value.trim();
}

function boundedStrings(value: unknown, field: string, maxItems = 20, maxText = 2_000): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new TorqueAssistDomainError(`${field} is invalid`, 'TORQUE_ASSIST_RESPONSE_INVALID');
  }
  return value.map((item, index) => boundedText(item, `${field}[${index}]`, maxText));
}

function boundedArray(value: unknown, field: string, maxItems: number): unknown[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new TorqueAssistDomainError(`${field} is invalid`, 'TORQUE_ASSIST_RESPONSE_INVALID');
  }
  return value;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TorqueAssistDomainError(`${field} is invalid`, 'TORQUE_ASSIST_RESPONSE_INVALID');
  }
  return value as Record<string, unknown>;
}

function priority(value: unknown, field: string, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new TorqueAssistDomainError(`${field} is invalid`, 'TORQUE_ASSIST_RESPONSE_INVALID');
  }
  return Number(value);
}

function parseProviderJson(raw: string): Record<string, unknown> {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  if (trimmed.length > 64_000) {
    throw new TorqueAssistDomainError(
      'Provider response is too large',
      'TORQUE_ASSIST_RESPONSE_INVALID',
    );
  }
  try {
    return object(JSON.parse(trimmed), 'response');
  } catch (error) {
    if (error instanceof TorqueAssistDomainError) throw error;
    throw new TorqueAssistDomainError(
      'Provider response is not valid JSON',
      'TORQUE_ASSIST_RESPONSE_INVALID',
    );
  }
}

const UNSAFE_CERTAINTY = /\b(?:definitely|certainly|guaranteed|confirmed repair|must replace)\b/i;

function rejectUnsafeCertainty(result: Omit<TorqueAssistResult, 'disclaimer'>): void {
  const searchable = JSON.stringify({
    summary: result.summary,
    hypotheses: result.hypotheses,
    recommendedTests: result.recommendedTests,
  });
  if (UNSAFE_CERTAINTY.test(searchable)) {
    throw new TorqueAssistDomainError(
      'Provider response presented an unverified repair with prohibited certainty',
      'TORQUE_ASSIST_UNSAFE_CERTAINTY',
    );
  }
}

export function parseTorqueAssistResult(raw: string, contextText: string): TorqueAssistResult {
  const parsed = parseProviderJson(raw);
  const status = parsed.status;
  if (status !== 'follow_up_required' && status !== 'plan_ready') {
    throw new TorqueAssistDomainError('status is invalid', 'TORQUE_ASSIST_RESPONSE_INVALID');
  }
  const facts = boundedArray(parsed.facts, 'facts', 30).map((value, index) => {
    const row = object(value, `facts[${index}]`);
    if (row.source !== 'observed' && row.source !== 'user_entered') {
      throw new TorqueAssistDomainError('fact source is invalid', 'TORQUE_ASSIST_RESPONSE_INVALID');
    }
    return {
      source: row.source,
      statement: boundedText(row.statement, `facts[${index}].statement`, 2_000),
    } satisfies TorqueAssistFact;
  });
  const hypotheses = boundedArray(parsed.hypotheses, 'hypotheses', 8)
    .map((value, index) => {
      const row = object(value, `hypotheses[${index}]`);
      if (row.confidence !== 'low' && row.confidence !== 'medium') {
        throw new TorqueAssistDomainError(
          'hypothesis confidence must remain low or medium until verified',
          'TORQUE_ASSIST_RESPONSE_INVALID',
        );
      }
      return {
        rank: priority(row.rank, `hypotheses[${index}].rank`, 8),
        description: boundedText(row.description, `hypotheses[${index}].description`, 2_000),
        confidence: row.confidence,
        supportingEvidence: boundedStrings(
          row.supportingEvidence,
          `hypotheses[${index}].supportingEvidence`,
          12,
          1_000,
        ),
        contradictingEvidence: boundedStrings(
          row.contradictingEvidence,
          `hypotheses[${index}].contradictingEvidence`,
          12,
          1_000,
        ),
      } satisfies TorqueAssistHypothesis;
    })
    .sort((a, b) => a.rank - b.rank);
  if (new Set(hypotheses.map((row) => row.rank)).size !== hypotheses.length) {
    throw new TorqueAssistDomainError(
      'hypothesis ranks must be unique',
      'TORQUE_ASSIST_RESPONSE_INVALID',
    );
  }
  const recommendedTests = boundedArray(parsed.recommendedTests, 'recommendedTests', 12)
    .map((value, index) => {
      const row = object(value, `recommendedTests[${index}]`);
      return {
        priority: priority(row.priority, `recommendedTests[${index}].priority`, 12),
        title: boundedText(row.title, `recommendedTests[${index}].title`, 300),
        rationale: boundedText(row.rationale, `recommendedTests[${index}].rationale`, 2_000),
        procedure: boundedText(row.procedure, `recommendedTests[${index}].procedure`, 4_000),
        stopConditions: boundedStrings(
          row.stopConditions,
          `recommendedTests[${index}].stopConditions`,
          10,
          1_000,
        ),
      } satisfies TorqueAssistRecommendedTest;
    })
    .sort((a, b) => a.priority - b.priority);
  const providerWarnings = boundedArray(parsed.safetyWarnings, 'safetyWarnings', 12).map(
    (value, index) => {
      const row = object(value, `safetyWarnings[${index}]`);
      return {
        category: boundedText(row.category, `safetyWarnings[${index}].category`, 80),
        warning: boundedText(row.warning, `safetyWarnings[${index}].warning`, 2_000),
        escalation: boundedText(row.escalation, `safetyWarnings[${index}].escalation`, 2_000),
      } satisfies TorqueAssistSafetyWarning;
    },
  );
  const followUpQuestions = boundedStrings(
    parsed.followUpQuestions,
    'followUpQuestions',
    12,
    1_000,
  );
  if (status === 'follow_up_required' && followUpQuestions.length === 0) {
    throw new TorqueAssistDomainError(
      'A follow-up response must include targeted questions',
      'TORQUE_ASSIST_RESPONSE_INVALID',
    );
  }
  const base = {
    status,
    summary: boundedText(parsed.summary, 'summary', 4_000),
    facts,
    assumptions: boundedStrings(parsed.assumptions, 'assumptions', 20, 2_000),
    hypotheses,
    safetyWarnings: mergeSafetyWarnings(providerWarnings, mandatorySafetyWarnings(contextText)),
    recommendedTests,
    followUpQuestions,
  } satisfies Omit<TorqueAssistResult, 'disclaimer'>;
  rejectUnsafeCertainty(base);
  return { ...base, disclaimer: TORQUE_ASSIST_DISCLAIMER };
}

const RISK_RULES: Array<{
  category: string;
  pattern: RegExp;
  warning: string;
  escalation: string;
}> = [
  {
    category: 'braking',
    pattern: /\b(brake|braking|abs|caliper|hydraulic)\b/i,
    warning: 'Do not drive or road-test a vehicle with uncertain braking capability.',
    escalation:
      'Use approved lift/support and brake-service procedures or escalate to a qualified brake technician.',
  },
  {
    category: 'steering',
    pattern: /\b(steering|tie rod|ball joint|rack and pinion)\b/i,
    warning: 'Steering or suspension looseness can cause immediate loss of vehicle control.',
    escalation:
      'Stop driving and escalate if component integrity or required inspection tooling is uncertain.',
  },
  {
    category: 'fuel-fire',
    pattern: /\b(fuel|gasoline|diesel|injector|pressure|leak|fire)\b/i,
    warning: 'Fuel systems may retain pressure and create fire, explosion, and exposure hazards.',
    escalation:
      'Follow manufacturer depressurization and ventilation procedures; stop for any leak or ignition source.',
  },
  {
    category: 'high-voltage',
    pattern:
      /\b(high[- ]?voltage|hybrid|electric vehicle|ev battery|traction battery|orange cable)\b/i,
    warning: 'High-voltage vehicle systems can cause fatal shock or arc-flash injury.',
    escalation:
      'Only qualified high-voltage personnel with specified PPE and isolation verification may proceed.',
  },
  {
    category: 'airbag-restraint',
    pattern: /\b(airbag|srs|pretensioner|supplemental restraint)\b/i,
    warning: 'Supplemental-restraint components can deploy unexpectedly and cause severe injury.',
    escalation:
      'Use manufacturer disablement and wait-time procedures or escalate to a qualified restraint-system technician.',
  },
  {
    category: 'lifting',
    pattern: /\b(lift|jack|jack stand|underbody|hoist)\b/i,
    warning: 'Never work under a vehicle supported only by a jack or unverified lifting points.',
    escalation:
      'Use rated lifting equipment, approved lift points, wheel restraints, and redundant support.',
  },
];

export function mandatorySafetyWarnings(contextText: string): TorqueAssistSafetyWarning[] {
  const warnings = RISK_RULES.filter((rule) => rule.pattern.test(contextText)).map((rule) => ({
    category: rule.category,
    warning: rule.warning,
    escalation: rule.escalation,
  }));
  if (warnings.length === 0) {
    warnings.push({
      category: 'general-shop-safety',
      warning:
        'Use service information, PPE, stable support, ventilation, and appropriate diagnostic equipment.',
      escalation:
        'Stop and consult a qualified technician whenever the required procedure, tooling, or hazard control is uncertain.',
    });
  }
  return warnings;
}

function mergeSafetyWarnings(
  provider: TorqueAssistSafetyWarning[],
  mandatory: TorqueAssistSafetyWarning[],
): TorqueAssistSafetyWarning[] {
  const merged = new Map<string, TorqueAssistSafetyWarning>();
  for (const warning of [...mandatory, ...provider]) {
    const key = warning.category.toLowerCase();
    if (!merged.has(key)) merged.set(key, warning);
  }
  return [...merged.values()].slice(0, 16);
}

export function torqueTokenPackage(packageKey: unknown): TorqueTokenPackage {
  try {
    return torqueShedCreditPackage(packageKey);
  } catch {
    throw new TorqueAssistDomainError('Unknown token package', 'TORQUE_TOKEN_PACKAGE_INVALID', 400);
  }
}

export function summarizeContext(value: unknown): {
  json: string;
  sha256: string;
  chars: number;
  items: number;
  estimatedUnits: number;
} {
  const json = JSON.stringify(value);
  const chars = json.length;
  if (chars < 1 || chars > TORQUE_ASSIST_MAX_CONTEXT_CHARS) {
    throw new TorqueAssistDomainError(
      `Diagnostic context must be between 1 and ${TORQUE_ASSIST_MAX_CONTEXT_CHARS} characters`,
      'TORQUE_ASSIST_CONTEXT_TOO_LARGE',
      413,
    );
  }
  const countItems = (nested: unknown): number => {
    if (Array.isArray(nested))
      return nested.length + nested.reduce((sum, item) => sum + countItems(item), 0);
    if (nested && typeof nested === 'object') {
      return Object.values(nested as Record<string, unknown>).reduce(
        (sum: number, item) => sum + 1 + countItems(item),
        0,
      );
    }
    return 0;
  };
  const items = countItems(value);
  if (items > 1_000) {
    throw new TorqueAssistDomainError(
      'Diagnostic context has too many items',
      'TORQUE_ASSIST_CONTEXT_TOO_LARGE',
      413,
    );
  }
  return {
    json,
    sha256: createHash('sha256').update(json).digest('hex'),
    chars,
    items: Math.max(1, items),
    estimatedUnits: estimateTorqueAssistMaximumUnits(chars),
  };
}

/**
 * Conservative maximum authorization for one provider request. The context,
 * fixed system prompt, and bounded serialization overhead are converted using
 * the conservative four-characters-per-token rule, then the provider's fixed
 * 1,200 output-token ceiling is added. Provider-reported usage above this
 * authorization is rejected and never debited.
 */
export function estimateTorqueAssistMaximumUnits(contextCharacters: number): number {
  const boundedCharacters = Math.max(1, Math.min(TORQUE_ASSIST_MAX_CONTEXT_CHARS, Math.floor(contextCharacters)));
  const fixedPromptAndSerializationCharacters = TORQUE_ASSIST_SYSTEM_PROMPT.length + 4_096;
  return Math.ceil((boundedCharacters + fixedPromptAndSerializationCharacters) / 4)
    + TORQUE_ASSIST_MAX_OUTPUT_UNITS;
}

export function ledgerBalanceExpression(): string {
  return "COALESCE(SUM(CASE WHEN entry_kind IN ('credit','debit_reversal','adjustment_credit') THEN units ELSE -units END),0)";
}
