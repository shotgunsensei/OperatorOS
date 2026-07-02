import type { VaultEvent, VaultEventHandler } from "./types";

class EventBus {
  private handlers = new Map<string, VaultEventHandler[]>();
  private wildcardHandlers: VaultEventHandler[] = [];

  on(eventType: string, handler: VaultEventHandler): void {
    if (eventType === "*") {
      this.wildcardHandlers.push(handler);
      return;
    }
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  off(eventType: string, handler: VaultEventHandler): void {
    if (eventType === "*") {
      this.wildcardHandlers = this.wildcardHandlers.filter((h) => h !== handler);
      return;
    }
    const existing = this.handlers.get(eventType);
    if (existing) {
      this.handlers.set(eventType, existing.filter((h) => h !== handler));
    }
  }

  async emit(event: Omit<VaultEvent, "timestamp">): Promise<void> {
    const fullEvent: VaultEvent = { ...event, timestamp: new Date() };

    const typeHandlers = this.handlers.get(event.type) || [];
    const all = [...typeHandlers, ...this.wildcardHandlers];

    await Promise.allSettled(all.map((h) => h(fullEvent)));
  }
}

export const eventBus = new EventBus();

export type { VaultEvent, VaultEventHandler };
