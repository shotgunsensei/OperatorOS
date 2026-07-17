import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { applyCatalogOverrides, revertCatalogProduct, type CatalogProduct } from '@/data/catalog';
import {
  adminFetchCatalogOverrides,
  adminFetchCatalogOverrideHistory,
  adminRevertCatalogOverride,
  adminRollbackCatalogOverride,
  adminSaveCatalogOverride,
  type CatalogOverrideHistoryEntry,
  type CatalogOverridePayload,
} from '@/lib/api';
import type { CatalogOverrideMeta } from './CatalogTab';

type CatalogOverride = CatalogOverridePayload;

function readOverrideRecords(raw: Array<Record<string, unknown>>): {
  map: Record<string, CatalogOverride>;
  metaMap: Record<string, CatalogOverrideMeta>;
} {
  const map: Record<string, CatalogOverride> = {};
  const metaMap: Record<string, CatalogOverrideMeta> = {};
  for (const item of raw) {
    const productId = String(item.productId || '');
    if (!productId) continue;
    const override: CatalogOverride = {};
    if (item.status === 'available' || item.status === 'coming-soon' || item.status === 'disabled') {
      override.status = item.status;
    }
    if (typeof item.featured === 'boolean') override.featured = item.featured;
    if (typeof item.shortDescription === 'string') override.shortDescription = item.shortDescription;
    if (typeof item.longDescription === 'string') override.longDescription = item.longDescription;
    if (Array.isArray(item.tags)) {
      override.tags = item.tags.filter((t): t is string => typeof t === 'string');
    }
    map[productId] = override;
    const editorRaw = item.editor as
      | { id?: unknown; displayName?: unknown; email?: unknown }
      | null
      | undefined;
    metaMap[productId] = {
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
      editor:
        editorRaw && typeof editorRaw.id === 'string'
          ? {
              id: editorRaw.id,
              displayName:
                typeof editorRaw.displayName === 'string' ? editorRaw.displayName : null,
              email: typeof editorRaw.email === 'string' ? editorRaw.email : null,
            }
          : null,
    };
  }
  return { map, metaMap };
}

export function useCatalogOverrides() {
  const [overrides, setOverrides] = useState<Record<string, CatalogOverride>>({});
  const [overrideMeta, setOverrideMeta] = useState<Record<string, CatalogOverrideMeta>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CatalogOverride>({});
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<CatalogOverrideHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    adminFetchCatalogOverrides()
      .then((r: { overrides?: Array<Record<string, unknown>> }) => {
        const { map, metaMap } = readOverrideRecords(r.overrides || []);
        setOverrides(map);
        setOverrideMeta(metaMap);
      })
      .catch(() => {});
  }, []);

  const updateOverride = async (id: string, patch: CatalogOverride) => {
    const prev = overrides[id] || {};
    const merged: CatalogOverride = { ...prev, ...patch };
    setOverrides({ ...overrides, [id]: merged });
    applyCatalogOverrides([{ productId: id, ...merged }]);
    try {
      const res = await adminSaveCatalogOverride(id, merged);
      setOverrideMeta((cur) => ({
        ...cur,
        [id]: {
          updatedAt: res.updatedAt,
          editor: {
            id: res.updatedByUserId ?? 'me',
            displayName: 'You',
            email: null,
          },
        },
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save catalog override';
      toast.error(message);
    }
  };

  const revert = async (id: string) => {
    try {
      await adminRevertCatalogOverride(id);
      revertCatalogProduct(id);
      setOverrides((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      setOverrideMeta((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      toast.success('Reverted to original values.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to revert catalog entry.';
      toast.error(message);
    }
  };

  const openHistory = async (productId: string) => {
    setHistoryFor(productId);
    setHistoryEntries(null);
    setHistoryLoading(true);
    try {
      const res = await adminFetchCatalogOverrideHistory(productId);
      setHistoryEntries(res.history);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load history.';
      toast.error(message);
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const refreshOverridesFromServer = async () => {
    try {
      const r = await adminFetchCatalogOverrides();
      const { map, metaMap } = readOverrideRecords(
        (r.overrides || []) as Array<Record<string, unknown>>
      );
      const previousIds = new Set(Object.keys(overrides));
      setOverrides(map);
      setOverrideMeta(metaMap);
      const allIds = new Set<string>([...previousIds, ...Object.keys(map)]);
      for (const id of allIds) {
        if (map[id]) {
          applyCatalogOverrides([{ productId: id, ...map[id] }]);
        } else {
          revertCatalogProduct(id);
        }
      }
    } catch {}
  };

  const rollbackTo = async (productId: string, entry: CatalogOverrideHistoryEntry) => {
    try {
      await adminRollbackCatalogOverride(productId, entry.id);
      await refreshOverridesFromServer();
      const res = await adminFetchCatalogOverrideHistory(productId);
      setHistoryEntries(res.history);
      toast.success(
        entry.overrides === null
          ? 'Rolled back to defaults.'
          : 'Rolled back to selected version.'
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to roll back.';
      toast.error(message);
    }
  };

  const startEdit = (p: CatalogProduct) => {
    setEditing(p.id);
    const o = overrides[p.id] || {};
    setDraft({
      shortDescription: o.shortDescription ?? p.shortDescription,
      longDescription: o.longDescription ?? p.longDescription,
      tags: o.tags ?? p.tags,
    });
  };

  const saveEdit = async (id: string) => {
    await updateOverride(id, draft);
    setEditing(null);
    toast.success('Catalog entry updated.');
  };

  return {
    overrides,
    overrideMeta,
    editing,
    setEditing,
    draft,
    setDraft,
    historyFor,
    setHistoryFor,
    historyEntries,
    historyLoading,
    updateOverride,
    revert,
    openHistory,
    rollbackTo,
    startEdit,
    saveEdit,
  };
}
