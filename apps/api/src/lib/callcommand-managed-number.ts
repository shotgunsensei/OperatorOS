import { createHash } from 'node:crypto';

export const CALLCOMMAND_MANAGED_NUMBER_STATES = [
  'REQUESTED',
  'PROVISIONING',
  'PROVIDER_PROVISIONED',
  'CONFIGURING_ROUTING',
  'CONFIGURING_BILLING',
  'TESTING',
  'ACTIVE',
  'PROVISION_FAILED',
  'ROUTING_FAILED',
  'BILLING_FAILED',
  'ACTION_REQUIRED',
  'SUSPENDED',
  'RELEASE_PENDING',
  'RELEASED',
  'RECONCILIATION_REQUIRED',
] as const;

export type CallCommandManagedNumberState = typeof CALLCOMMAND_MANAGED_NUMBER_STATES[number];
export type CallCommandManagedNumberType = 'local' | 'toll_free' | 'external';

const TRANSITIONS: Readonly<Record<CallCommandManagedNumberState, readonly CallCommandManagedNumberState[]>> = {
  REQUESTED: ['PROVISIONING', 'PROVISION_FAILED', 'ACTION_REQUIRED'],
  PROVISIONING: ['PROVIDER_PROVISIONED', 'PROVISION_FAILED', 'ACTION_REQUIRED', 'RECONCILIATION_REQUIRED'],
  PROVIDER_PROVISIONED: ['CONFIGURING_ROUTING', 'ROUTING_FAILED', 'RECONCILIATION_REQUIRED'],
  CONFIGURING_ROUTING: ['CONFIGURING_BILLING', 'ROUTING_FAILED', 'RECONCILIATION_REQUIRED'],
  CONFIGURING_BILLING: ['TESTING', 'BILLING_FAILED', 'ACTION_REQUIRED', 'RECONCILIATION_REQUIRED'],
  TESTING: ['ACTIVE', 'ROUTING_FAILED', 'ACTION_REQUIRED', 'RECONCILIATION_REQUIRED'],
  ACTIVE: ['ACTION_REQUIRED', 'SUSPENDED', 'RELEASE_PENDING', 'RECONCILIATION_REQUIRED'],
  PROVISION_FAILED: ['PROVISIONING', 'ACTION_REQUIRED', 'RECONCILIATION_REQUIRED'],
  ROUTING_FAILED: ['CONFIGURING_ROUTING', 'ACTION_REQUIRED', 'RELEASE_PENDING', 'RECONCILIATION_REQUIRED'],
  BILLING_FAILED: ['CONFIGURING_BILLING', 'ACTION_REQUIRED', 'SUSPENDED', 'RELEASE_PENDING', 'RECONCILIATION_REQUIRED'],
  ACTION_REQUIRED: ['PROVISIONING', 'CONFIGURING_ROUTING', 'CONFIGURING_BILLING', 'TESTING', 'ACTIVE', 'SUSPENDED', 'RELEASE_PENDING', 'RECONCILIATION_REQUIRED'],
  SUSPENDED: ['CONFIGURING_BILLING', 'TESTING', 'ACTIVE', 'RELEASE_PENDING', 'RECONCILIATION_REQUIRED'],
  RELEASE_PENDING: ['ACTIVE', 'SUSPENDED', 'RELEASED', 'RECONCILIATION_REQUIRED'],
  RELEASED: [],
  RECONCILIATION_REQUIRED: ['PROVISIONING', 'CONFIGURING_ROUTING', 'CONFIGURING_BILLING', 'TESTING', 'ACTIVE', 'ACTION_REQUIRED', 'SUSPENDED', 'RELEASE_PENDING', 'RELEASED'],
};

export class CallCommandManagedNumberError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 409,
  ) {
    super(message);
  }
}

export function canTransitionManagedNumber(
  current: CallCommandManagedNumberState,
  next: CallCommandManagedNumberState,
): boolean {
  return current === next || TRANSITIONS[current].includes(next);
}

export function assertManagedNumberTransition(
  current: CallCommandManagedNumberState,
  next: CallCommandManagedNumberState,
): void {
  if (!canTransitionManagedNumber(current, next)) {
    throw new CallCommandManagedNumberError(
      `Managed-number transition ${current} -> ${next} is not allowed`,
      'CALLCOMMAND_NUMBER_STATE_TRANSITION_INVALID',
    );
  }
}

export function classifyManagedNumberType(phoneE164: string): Exclude<CallCommandManagedNumberType, 'external'> {
  return /^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(phoneE164) ? 'toll_free' : 'local';
}

export interface ManagedNumberBillingQuantities {
  activeLocal: number;
  activeTollFree: number;
  includedLocal: number;
  billableLocal: number;
  billableTollFree: number;
}

export function calculateManagedNumberBillingQuantities(input: {
  local: number;
  tollFree: number;
  includedLocal?: number;
}): ManagedNumberBillingQuantities {
  const activeLocal = boundedQuantity(input.local, 'local');
  const activeTollFree = boundedQuantity(input.tollFree, 'tollFree');
  const includedLocal = boundedQuantity(input.includedLocal ?? 1, 'includedLocal', 10);
  return {
    activeLocal,
    activeTollFree,
    includedLocal,
    billableLocal: Math.max(activeLocal - includedLocal, 0),
    billableTollFree: activeTollFree,
  };
}

function boundedQuantity(value: number, field: string, maximum = 1000): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new CallCommandManagedNumberError(
      `${field} must be a whole number between 0 and ${maximum}`,
      'CALLCOMMAND_NUMBER_QUANTITY_INVALID',
      422,
    );
  }
  return value;
}

export interface ManagedNumberReadinessInput {
  providerAccountReady: boolean;
  providerNumberPresent: boolean;
  routingHealthy: boolean;
  profileAssigned: boolean;
  workflowAssigned: boolean;
  billingStatus: string;
  paymentGraceExpiresAt?: Date | null;
  now?: Date;
}

export function managedNumberReadiness(input: ManagedNumberReadinessInput): {
  ready: boolean;
  state: 'healthy' | 'action_required' | 'suspended';
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!input.providerAccountReady) reasons.push('provider_account_unavailable');
  if (!input.providerNumberPresent) reasons.push('provider_number_missing');
  if (!input.routingHealthy) reasons.push('routing_unhealthy');
  if (!input.profileAssigned) reasons.push('receptionist_unassigned');
  if (!input.workflowAssigned) reasons.push('workflow_unassigned');
  const now = input.now ?? new Date();
  const withinGrace = input.billingStatus === 'grace_period'
    && input.paymentGraceExpiresAt instanceof Date
    && input.paymentGraceExpiresAt.getTime() > now.getTime();
  const billingAllowed = input.billingStatus === 'included'
    || input.billingStatus === 'active'
    || withinGrace;
  if (!billingAllowed) reasons.push('billing_not_entitled');
  const suspended = input.billingStatus === 'suspended'
    || (input.billingStatus === 'grace_period' && !withinGrace);
  return {
    ready: reasons.length === 0,
    state: reasons.length === 0 ? 'healthy' : suspended ? 'suspended' : 'action_required',
    reasons,
  };
}

export function managedNumberRequestHash(input: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(input)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function managedNumberReleaseAt(now = new Date(), holdHoursValue = process.env.CALLCOMMAND_NUMBER_RELEASE_HOLD_HOURS): Date {
  const raw = holdHoursValue?.trim() || '24';
  if (!/^\d{1,3}$/.test(raw)) {
    throw new CallCommandManagedNumberError(
      'CALLCOMMAND_NUMBER_RELEASE_HOLD_HOURS must be a whole number of hours',
      'CALLCOMMAND_NUMBER_RELEASE_HOLD_INVALID',
      500,
    );
  }
  const hours = Number(raw);
  if (hours < 1 || hours > 168) {
    throw new CallCommandManagedNumberError(
      'CALLCOMMAND_NUMBER_RELEASE_HOLD_HOURS must be between 1 and 168',
      'CALLCOMMAND_NUMBER_RELEASE_HOLD_INVALID',
      500,
    );
  }
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function callCommandNumberBillingGraceDays(value = process.env.CALLCOMMAND_NUMBER_BILLING_GRACE_DAYS): number {
  const raw = value?.trim() || '7';
  if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 30) {
    throw new CallCommandManagedNumberError(
      'CALLCOMMAND_NUMBER_BILLING_GRACE_DAYS must be between 1 and 30',
      'CALLCOMMAND_NUMBER_BILLING_GRACE_INVALID',
      500,
    );
  }
  return Number(raw);
}
