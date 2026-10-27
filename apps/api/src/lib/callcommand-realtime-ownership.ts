import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export type CallCommandRealtimeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface CallCommandRealtimeOwnership {
  tenantId: string;
  callId: string;
  eventId: string;
  openAiCallId: string;
  processingOwner: string;
  capacityLeaseId: string;
  capacityGeneration: string;
}

export class CallCommandRealtimeOwnershipError extends Error {
  readonly code = 'CALLCOMMAND_REALTIME_OWNER_EXPIRED';
  readonly statusCode = 409;
  constructor() { super('Sideband ownership or call authority is no longer current'); }
}

/**
 * Same short transaction as the protected write/reservation. Never retain these
 * locks across provider I/O. Capacity -> per-call advisory -> call -> receipt ->
 * lane is shared with incoming/recovery claims and capacity admission.
 */
export async function lockCallCommandRealtimeOwnership(
  tx: CallCommandRealtimeTransaction,
  owner: CallCommandRealtimeOwnership,
  options: { allowTerminalUsage?: boolean } = {},
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-capacity:${owner.tenantId}`},0))`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`callcommand-realtime:${owner.callId}`},0))`);
  const call = (await tx.execute(sql`
    SELECT id,status,provider_call_sid,capacity_lease_id,openai_realtime_call_id
    FROM callcommand_calls WHERE tenant_id=${owner.tenantId} AND id=${owner.callId}
      AND provider='twilio' AND direction='inbound' FOR UPDATE
  `)).rows[0];
  if (!call || call.openai_realtime_call_id !== owner.openAiCallId
    || call.capacity_lease_id !== owner.capacityLeaseId
    || (!options.allowTerminalUsage && !['ringing','in_progress','answered','connected'].includes(String(call.status)))) {
    throw new CallCommandRealtimeOwnershipError();
  }
  const receipt = (await tx.execute(sql`
    SELECT id FROM callcommand_ingestion_events
    WHERE tenant_id=${owner.tenantId} AND source='openai_realtime'
      AND provider_event_id=${owner.eventId} AND call_id=${owner.callId}
      AND processing_owner=${owner.processingOwner}
      AND processing_lease_expires_at>clock_timestamp()
      AND payload_sha256 ~ '^[a-f0-9]{64}$'
    FOR UPDATE
  `)).rows[0];
  if (!receipt) throw new CallCommandRealtimeOwnershipError();
  const lease = (await tx.execute(sql`
    SELECT id,status,expires_at FROM callcommand_lane_leases
    WHERE tenant_id=${owner.tenantId} AND id=${owner.capacityLeaseId}
      AND call_id=${owner.callId} AND provider_call_sid=${call.provider_call_sid}
      AND EXTRACT(EPOCH FROM acquired_at)::text=${owner.capacityGeneration}
      AND (${options.allowTerminalUsage === true} OR (status='active' AND expires_at>clock_timestamp()))
    FOR UPDATE
  `)).rows[0];
  if (!lease) throw new CallCommandRealtimeOwnershipError();
}

export async function withCallCommandRealtimeOwnership<T>(
  owner: CallCommandRealtimeOwnership,
  operation: (tx: CallCommandRealtimeTransaction) => Promise<T>,
  validate?: (tx: CallCommandRealtimeTransaction) => Promise<void>,
): Promise<T> {
  return db.transaction(async tx => {
    await lockCallCommandRealtimeOwnership(tx,owner);
    await validate?.(tx);
    return operation(tx);
  });
}
