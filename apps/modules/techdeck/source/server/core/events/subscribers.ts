import { eventBus } from "./bus";
import type { VaultEvent } from "./types";

export function registerAuditSubscriber(
  createAuditLog: (data: {
    tenantId: string;
    userId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  }) => Promise<any>
): void {
  eventBus.on("*", async (event: VaultEvent) => {
    try {
      await createAuditLog({
        tenantId: event.tenantId,
        userId: event.actorUserId,
        action: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        details: event.details,
      });
    } catch (err) {
      console.error(`[audit-subscriber] Failed to log event ${event.type}:`, err);
    }
  });
}
