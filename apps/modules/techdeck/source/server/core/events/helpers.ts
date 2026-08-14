import { eventBus } from "./bus";

export async function emitEvent(
  type: string,
  tenantId: string,
  actorUserId?: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await eventBus.emit({
    type,
    tenantId,
    actorUserId,
    entityType,
    entityId,
    details,
  });
}
