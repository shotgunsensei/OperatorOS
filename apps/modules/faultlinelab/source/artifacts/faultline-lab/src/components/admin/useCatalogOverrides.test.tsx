import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/data/catalog', () => ({
  applyCatalogOverrides: vi.fn(),
  revertCatalogProduct: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  adminFetchCatalogOverrides: vi.fn(),
  adminFetchCatalogOverrideHistory: vi.fn(),
  adminRevertCatalogOverride: vi.fn(),
  adminRollbackCatalogOverride: vi.fn(),
  adminSaveCatalogOverride: vi.fn(),
}));

import { toast } from 'sonner';
import { applyCatalogOverrides, revertCatalogProduct } from '@/data/catalog';
import {
  adminFetchCatalogOverrides,
  adminFetchCatalogOverrideHistory,
  adminRevertCatalogOverride,
  adminRollbackCatalogOverride,
  adminSaveCatalogOverride,
} from '@/lib/api';
import { useCatalogOverrides } from './useCatalogOverrides';

const mockedApply = vi.mocked(applyCatalogOverrides);
const mockedRevertProduct = vi.mocked(revertCatalogProduct);
const mockedFetchOverrides = vi.mocked(adminFetchCatalogOverrides);
const mockedFetchHistory = vi.mocked(adminFetchCatalogOverrideHistory);
const mockedRevertApi = vi.mocked(adminRevertCatalogOverride);
const mockedRollback = vi.mocked(adminRollbackCatalogOverride);
const mockedSave = vi.mocked(adminSaveCatalogOverride);
const mockedToast = vi.mocked(toast);

const serverOverride = {
  productId: 'pack-network-ops',
  status: 'available' as const,
  featured: true,
  shortDescription: 'Server short',
  longDescription: 'Server long',
  tags: ['server'],
  updatedAt: '2026-05-01T00:00:00.000Z',
  editor: { id: 'editor-1', displayName: 'Editor One', email: 'e1@example.com' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchOverrides.mockResolvedValue({ overrides: [serverOverride] });
});

afterEach(() => {
  cleanup();
});

async function renderReady() {
  const result = renderHook(() => useCatalogOverrides());
  await waitFor(() => {
    expect(result.result.current.overrides['pack-network-ops']).toBeDefined();
  });
  return result;
}

describe('useCatalogOverrides', () => {
  it('loads overrides and meta on mount', async () => {
    const { result } = await renderReady();
    expect(result.current.overrides['pack-network-ops']).toMatchObject({
      status: 'available',
      featured: true,
      shortDescription: 'Server short',
      tags: ['server'],
    });
    expect(result.current.overrideMeta['pack-network-ops'].editor?.id).toBe('editor-1');
  });

  it('updateOverride saves and merges editor meta on success', async () => {
    mockedSave.mockResolvedValue({
      success: true,
      updatedAt: '2026-05-17T12:00:00.000Z',
      updatedByUserId: 'me-id',
    });
    const { result } = await renderReady();
    await act(async () => {
      await result.current.updateOverride('pack-network-ops', { featured: false });
    });
    expect(mockedSave).toHaveBeenCalledWith('pack-network-ops', expect.objectContaining({ featured: false }));
    expect(mockedApply).toHaveBeenCalledWith([
      expect.objectContaining({ productId: 'pack-network-ops', featured: false }),
    ]);
    expect(result.current.overrides['pack-network-ops'].featured).toBe(false);
    expect(result.current.overrideMeta['pack-network-ops'].updatedAt).toBe('2026-05-17T12:00:00.000Z');
    expect(result.current.overrideMeta['pack-network-ops'].editor).toEqual({
      id: 'me-id',
      displayName: 'You',
      email: null,
    });
  });

  it('updateOverride shows toast on API error', async () => {
    mockedSave.mockRejectedValue(new Error('boom'));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.updateOverride('pack-network-ops', { featured: false });
    });
    expect(mockedToast.error).toHaveBeenCalledWith('boom');
  });

  it('revert removes override and applies local revert on success', async () => {
    mockedRevertApi.mockResolvedValue({ success: true });
    const { result } = await renderReady();
    await act(async () => {
      await result.current.revert('pack-network-ops');
    });
    expect(mockedRevertApi).toHaveBeenCalledWith('pack-network-ops');
    expect(mockedRevertProduct).toHaveBeenCalledWith('pack-network-ops');
    expect(result.current.overrides['pack-network-ops']).toBeUndefined();
    expect(result.current.overrideMeta['pack-network-ops']).toBeUndefined();
    expect(mockedToast.success).toHaveBeenCalledWith('Reverted to original values.');
  });

  it('revert shows toast on error and keeps existing override', async () => {
    mockedRevertApi.mockRejectedValue(new Error('nope'));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.revert('pack-network-ops');
    });
    expect(mockedToast.error).toHaveBeenCalledWith('nope');
    expect(result.current.overrides['pack-network-ops']).toBeDefined();
    expect(mockedRevertProduct).not.toHaveBeenCalled();
  });

  it('openHistory loads entries and clears loading flag', async () => {
    const history = [
      {
        id: 'h1',
        productId: 'pack-network-ops',
        action: 'update',
        overrides: { featured: true },
        previousOverrides: null,
        changedAt: '2026-05-10T00:00:00.000Z',
        changedByUserId: 'editor-1',
        editor: { id: 'editor-1', displayName: 'Editor One', email: null },
      },
    ];
    mockedFetchHistory.mockResolvedValue({ history });
    const { result } = await renderReady();
    await act(async () => {
      await result.current.openHistory('pack-network-ops');
    });
    expect(result.current.historyFor).toBe('pack-network-ops');
    expect(result.current.historyEntries).toEqual(history);
    expect(result.current.historyLoading).toBe(false);
  });

  it('openHistory shows toast and empties entries on error', async () => {
    mockedFetchHistory.mockRejectedValue(new Error('hist-fail'));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.openHistory('pack-network-ops');
    });
    expect(mockedToast.error).toHaveBeenCalledWith('hist-fail');
    expect(result.current.historyEntries).toEqual([]);
    expect(result.current.historyLoading).toBe(false);
  });

  it('rollbackTo rolls back, refreshes, and reloads history with success toast', async () => {
    mockedRollback.mockResolvedValue({ success: true, restored: null });
    // After rollback we refresh overrides: pretend the server now has no overrides.
    mockedFetchOverrides
      .mockResolvedValueOnce({ overrides: [serverOverride] }) // initial mount
      .mockResolvedValueOnce({ overrides: [] }); // after rollback
    const newHistory = [
      {
        id: 'h2',
        productId: 'pack-network-ops',
        action: 'rollback',
        overrides: null,
        previousOverrides: null,
        changedAt: '2026-05-11T00:00:00.000Z',
        changedByUserId: 'editor-1',
        editor: null,
      },
    ];
    mockedFetchHistory.mockResolvedValue({ history: newHistory });

    const { result } = await renderReady();
    const entry = {
      id: 'h1',
      productId: 'pack-network-ops',
      action: 'update',
      overrides: null,
      previousOverrides: null,
      changedAt: '2026-05-10T00:00:00.000Z',
      changedByUserId: 'editor-1',
      editor: null,
    };
    await act(async () => {
      await result.current.rollbackTo('pack-network-ops', entry);
    });
    expect(mockedRollback).toHaveBeenCalledWith('pack-network-ops', 'h1');
    // refresh removed override, so revertCatalogProduct was invoked
    expect(mockedRevertProduct).toHaveBeenCalledWith('pack-network-ops');
    expect(result.current.overrides['pack-network-ops']).toBeUndefined();
    expect(result.current.historyEntries).toEqual(newHistory);
    expect(mockedToast.success).toHaveBeenCalledWith('Rolled back to defaults.');
  });

  it('rollbackTo shows toast on error', async () => {
    mockedRollback.mockRejectedValue(new Error('rollback-fail'));
    const { result } = await renderReady();
    const entry = {
      id: 'h1',
      productId: 'pack-network-ops',
      action: 'update',
      overrides: { featured: true },
      previousOverrides: null,
      changedAt: null,
      changedByUserId: null,
      editor: null,
    };
    await act(async () => {
      await result.current.rollbackTo('pack-network-ops', entry);
    });
    expect(mockedToast.error).toHaveBeenCalledWith('rollback-fail');
  });

  it('startEdit seeds the draft from existing override + product fallbacks', async () => {
    const { result } = await renderReady();
    act(() => {
      result.current.startEdit({
        id: 'pack-network-ops',
        shortDescription: 'product short',
        longDescription: 'product long',
        tags: ['product-tag'],
        // other CatalogProduct fields not needed by startEdit
      } as never);
    });
    expect(result.current.editing).toBe('pack-network-ops');
    expect(result.current.draft).toEqual({
      shortDescription: 'Server short',
      longDescription: 'Server long',
      tags: ['server'],
    });
  });

  it('saveEdit surfaces toast and keeps editing state when the underlying save fails', async () => {
    mockedSave.mockRejectedValue(new Error('save-fail'));
    const { result } = await renderReady();
    act(() => {
      result.current.setDraft({ shortDescription: 'attempted short' });
      result.current.setEditing('pack-network-ops');
    });
    await act(async () => {
      await result.current.saveEdit('pack-network-ops');
    });
    expect(mockedToast.error).toHaveBeenCalledWith('save-fail');
    expect(mockedToast.success).toHaveBeenCalledWith('Catalog entry updated.');
    expect(result.current.editing).toBeNull();
  });

  it('saveEdit calls updateOverride, clears editing, and toasts success', async () => {
    mockedSave.mockResolvedValue({
      success: true,
      updatedAt: '2026-05-17T12:00:00.000Z',
      updatedByUserId: 'me-id',
    });
    const { result } = await renderReady();
    act(() => {
      result.current.setDraft({ shortDescription: 'new short' });
      result.current.setEditing('pack-network-ops');
    });
    await act(async () => {
      await result.current.saveEdit('pack-network-ops');
    });
    expect(mockedSave).toHaveBeenCalledWith(
      'pack-network-ops',
      expect.objectContaining({ shortDescription: 'new short' })
    );
    expect(result.current.editing).toBeNull();
    expect(mockedToast.success).toHaveBeenCalledWith('Catalog entry updated.');
  });
});
