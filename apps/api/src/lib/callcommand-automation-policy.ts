import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { CALLCOMMAND_ACTION_TYPES, cleanText } from './callcommand-phase35.js';

type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CallCommandAutomationPolicyError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 400) {
    super(message);
  }
}

/**
 * Validates persisted automation destinations against server-owned tenant and
 * module authority. Runtime dispatch still revalidates the endpoint so a
 * destination disabled after rule creation fails closed.
 */
export async function validateCallCommandAutomationActions(input: {
  tenantId: string;
  actions: unknown;
  allowEmpty?: boolean;
}, executor: Executor = db): Promise<Row[]> {
  if (!Array.isArray(input.actions) || input.actions.length > 20
    || (!input.allowEmpty && input.actions.length === 0)) {
    throw new CallCommandAutomationPolicyError(
      input.allowEmpty ? 'actions must be a bounded array' : 'At least one supported bounded action is required',
      'CALLCOMMAND_RULE_ACTION_INVALID',
    );
  }

  const validated: Row[] = [];
  for (const raw of input.actions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new CallCommandAutomationPolicyError('Automation action is invalid', 'CALLCOMMAND_RULE_ACTION_INVALID');
    }
    const action = raw as Row;
    const actionType = String(action.actionType ?? action.type ?? '');
    if (!CALLCOMMAND_ACTION_TYPES.includes(actionType as any)) {
      throw new CallCommandAutomationPolicyError('Automation action type is not supported', 'CALLCOMMAND_RULE_ACTION_INVALID');
    }

    if (actionType === 'email') {
      const destination = cleanText(action.destination, 'email destination', 320)!;
      if (!EMAIL.test(destination)) {
        throw new CallCommandAutomationPolicyError('Email alert destination is invalid', 'CALLCOMMAND_RULE_EMAIL_INVALID');
      }
      validated.push({ ...action, actionType, destination });
      continue;
    }

    if (actionType === 'webhook' || actionType === 'slack') {
      const endpointId = String(action.endpointId ?? '');
      if (!UUID.test(endpointId)) {
        throw new CallCommandAutomationPolicyError(`${actionType} action requires a valid endpoint`, 'CALLCOMMAND_RULE_ENDPOINT_INVALID');
      }
      const eventType = actionType === 'slack' ? 'callcommand.slack' : 'callcommand.call.processed';
      const endpoint = await executor.execute(sql`
        SELECT endpoint.id
        FROM shared_webhook_endpoints endpoint
        JOIN modules module ON module.id=endpoint.module_id AND module.slug='callcommand-ai'
        WHERE endpoint.tenant_id=${input.tenantId} AND endpoint.id=${endpointId}
          AND endpoint.enabled=TRUE AND endpoint.archived_at IS NULL
          AND endpoint.event_types_json ? ${eventType}
        LIMIT 1
      `);
      if (!endpoint.rows[0]) {
        throw new CallCommandAutomationPolicyError(
          'The alert destination is not an active CallCommand endpoint for this tenant',
          'CALLCOMMAND_RULE_ENDPOINT_UNAVAILABLE',
          409,
        );
      }
      validated.push({ ...action, actionType, endpointId });
      continue;
    }

    validated.push({ ...action, actionType });
  }
  return validated;
}
