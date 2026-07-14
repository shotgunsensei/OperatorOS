import { EventEmitter } from "events";
import { db, catalogOverridesTable } from "@workspace/db";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANGE_EVENT = "catalog-overrides-changed";

let currentVersion = 0;

export function getCatalogOverridesVersion(): number {
  return currentVersion;
}

export async function loadCatalogOverridesPayload(): Promise<{
  version: number;
  overrides: Array<
    { productId: string; updatedAt: string | null } & Record<string, unknown>
  >;
}> {
  const rows = await db.select().from(catalogOverridesTable);
  // Snapshot the version AFTER reading rows so the returned version
  // represents a state at-or-after every write reflected in `rows`.
  // This keeps client-side `lastVersion` dedupe from suppressing a
  // newer payload that arrived under the same version label.
  const version = currentVersion;
  return {
    version,
    overrides: rows.map((r) => ({
      productId: r.productId,
      ...((r.overrides as Record<string, unknown>) || {}),
      // Per-row server timestamp lets the client decide whether an
      // override was published before or after the user's last visit,
      // rather than treating every push as fresh-as-of-now.
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
    })),
  };
}

export function notifyCatalogOverridesChanged(): void {
  currentVersion += 1;
  emitter.emit(CHANGE_EVENT, currentVersion);
}

export function onCatalogOverridesChanged(
  listener: (version: number) => void,
): () => void {
  emitter.on(CHANGE_EVENT, listener);
  return () => emitter.off(CHANGE_EVENT, listener);
}
