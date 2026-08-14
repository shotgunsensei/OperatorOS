export interface VaultEvent {
  type: string;
  tenantId: string;
  actorUserId?: string;
  timestamp: Date;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export type VaultEventHandler = (event: VaultEvent) => void | Promise<void>;
