import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  adminDeleteUser: vi.fn(),
  adminFetchUserEntitlements: vi.fn(),
  adminFetchUsers: vi.fn(),
  adminGrantEntitlement: vi.fn(),
  adminRevokeEntitlement: vi.fn(),
  adminUpdateUserRole: vi.fn(),
}));

import { toast } from 'sonner';
import {
  adminDeleteUser,
  adminFetchUserEntitlements,
  adminFetchUsers,
  adminGrantEntitlement,
  adminRevokeEntitlement,
  adminUpdateUserRole,
} from '@/lib/api';
import { useAdminUsers } from './useAdminUsers';
import type { AdminUser } from './UsersTab';

const mockedToast = vi.mocked(toast);
const mockedDeleteUser = vi.mocked(adminDeleteUser);
const mockedFetchEnts = vi.mocked(adminFetchUserEntitlements);
const mockedFetchUsers = vi.mocked(adminFetchUsers);
const mockedGrant = vi.mocked(adminGrantEntitlement);
const mockedRevoke = vi.mocked(adminRevokeEntitlement);
const mockedUpdateRole = vi.mocked(adminUpdateUserRole);

const userA: AdminUser = {
  id: 'u-1',
  clerkId: 'clerk-1',
  email: 'a@example.com',
  displayName: 'Alpha',
  isAdmin: false,
  isSuperAdmin: false,
};
const userB: AdminUser = {
  id: 'u-2',
  clerkId: 'clerk-2',
  email: 'b@example.com',
  displayName: 'Bravo',
  isAdmin: true,
  isSuperAdmin: false,
};

const ent = {
  id: 'ent-1',
  productId: 'pack-network-ops',
  entitlementType: 'pack',
  source: 'admin-grant',
  isActive: true,
  grantedAt: '2026-05-01T00:00:00.000Z',
};

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchUsers.mockResolvedValue({ users: [userA, userB] });
  mockedFetchEnts.mockResolvedValue({ entitlements: [ent] });
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  confirmSpy.mockRestore();
  cleanup();
});

async function renderReady(active = true) {
  const r = renderHook(({ a }) => useAdminUsers(a), { initialProps: { a: active } });
  if (active) {
    await waitFor(() => expect(r.result.current.users).not.toBeNull());
  }
  return r;
}

describe('useAdminUsers', () => {
  it('does not fetch users when inactive', async () => {
    await renderReady(false);
    expect(mockedFetchUsers).not.toHaveBeenCalled();
  });

  it('loads users when active and filters by search', async () => {
    const { result } = await renderReady();
    expect(result.current.users).toHaveLength(2);
    act(() => result.current.setSearch('bravo'));
    expect(result.current.filteredUsers).toEqual([userB]);
  });

  it('records an error when user fetch fails', async () => {
    mockedFetchUsers.mockReset();
    mockedFetchUsers.mockRejectedValue(new Error('users-fail'));
    const { result } = renderHook(() => useAdminUsers(true));
    await waitFor(() => expect(result.current.usersError).toBe('users-fail'));
    expect(result.current.users).toBeNull();
  });

  it('loads entitlements when selecting a user', async () => {
    const { result } = await renderReady();
    act(() => result.current.setSelectedUserId('u-1'));
    await waitFor(() => expect(result.current.userEnts).toEqual([ent]));
    expect(mockedFetchEnts).toHaveBeenCalledWith('u-1');
  });

  it('grant requires a selected user and product id', async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.grant();
    });
    expect(mockedGrant).not.toHaveBeenCalled();
  });

  it('grant calls API, refreshes entitlements, and clears product on success', async () => {
    mockedGrant.mockResolvedValue({ success: true } as never);
    const { result } = await renderReady();
    act(() => {
      result.current.setSelectedUserId('u-1');
      result.current.setGrantProductId('pack-network-ops');
    });
    await waitFor(() => expect(result.current.userEnts).toEqual([ent]));
    await act(async () => {
      await result.current.grant();
    });
    expect(mockedGrant).toHaveBeenCalledWith('u-1', 'pack-network-ops', 'admin-grant');
    expect(mockedToast.success).toHaveBeenCalledWith('Entitlement granted.');
    expect(result.current.grantProductId).toBe('');
  });

  it('grant surfaces an error toast on API failure', async () => {
    mockedGrant.mockRejectedValue(new Error('grant-fail'));
    const { result } = await renderReady();
    act(() => {
      result.current.setSelectedUserId('u-1');
      result.current.setGrantProductId('pack-network-ops');
    });
    await act(async () => {
      await result.current.grant();
    });
    expect(mockedToast.error).toHaveBeenCalledWith('grant-fail');
  });

  it('revoke calls API and refreshes entitlements', async () => {
    mockedRevoke.mockResolvedValue({ success: true } as never);
    const { result } = await renderReady();
    act(() => result.current.setSelectedUserId('u-1'));
    await waitFor(() => expect(result.current.userEnts).toEqual([ent]));
    await act(async () => {
      await result.current.revoke('ent-1');
    });
    expect(mockedRevoke).toHaveBeenCalledWith('u-1', 'ent-1');
    expect(mockedToast.success).toHaveBeenCalledWith('Entitlement revoked.');
  });

  it('revoke shows error toast on failure', async () => {
    mockedRevoke.mockRejectedValue(new Error('revoke-fail'));
    const { result } = await renderReady();
    act(() => result.current.setSelectedUserId('u-1'));
    await waitFor(() => expect(result.current.userEnts).toEqual([ent]));
    await act(async () => {
      await result.current.revoke('ent-1');
    });
    expect(mockedToast.error).toHaveBeenCalledWith('revoke-fail');
  });

  it('toggleAdmin promotes after confirmation and reloads users', async () => {
    mockedUpdateRole.mockResolvedValue({ success: true });
    const { result } = await renderReady();
    await act(async () => {
      await result.current.toggleAdmin(userA);
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockedUpdateRole).toHaveBeenCalledWith('u-1', { isAdmin: true });
    expect(mockedToast.success).toHaveBeenCalledWith('Promoted to admin.');
    expect(mockedFetchUsers).toHaveBeenCalledTimes(2);
  });

  it('toggleAdmin aborts when confirmation is rejected', async () => {
    confirmSpy.mockReturnValue(false);
    const { result } = await renderReady();
    await act(async () => {
      await result.current.toggleAdmin(userA);
    });
    expect(mockedUpdateRole).not.toHaveBeenCalled();
  });

  it('toggleAdmin error path shows toast and does not reload', async () => {
    mockedUpdateRole.mockRejectedValue(new Error('role-fail'));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.toggleAdmin(userA);
    });
    expect(mockedToast.error).toHaveBeenCalledWith('role-fail');
    expect(mockedFetchUsers).toHaveBeenCalledTimes(1);
  });

  it('toggleSuperAdmin grants super admin after confirmation', async () => {
    mockedUpdateRole.mockResolvedValue({ success: true });
    const { result } = await renderReady();
    await act(async () => {
      await result.current.toggleSuperAdmin(userB);
    });
    expect(mockedUpdateRole).toHaveBeenCalledWith('u-2', { isSuperAdmin: true });
    expect(mockedToast.success).toHaveBeenCalledWith('Super admin granted.');
  });

  it('toggleSuperAdmin shows toast on API error', async () => {
    mockedUpdateRole.mockRejectedValue(new Error('super-fail'));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.toggleSuperAdmin(userB);
    });
    expect(mockedToast.error).toHaveBeenCalledWith('super-fail');
  });

  it('deleteUser requires both confirmations and clears selection when deleting selected user', async () => {
    mockedDeleteUser.mockResolvedValue({ success: true });
    const { result } = await renderReady();
    act(() => result.current.setSelectedUserId('u-1'));
    await waitFor(() => expect(result.current.userEnts).toEqual([ent]));
    await act(async () => {
      await result.current.deleteUser(userA);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(mockedDeleteUser).toHaveBeenCalledWith('u-1');
    expect(mockedToast.success).toHaveBeenCalledWith('User deleted.');
    expect(result.current.selectedUserId).toBeNull();
    expect(result.current.userEnts).toBeNull();
    expect(mockedFetchUsers).toHaveBeenCalledTimes(2);
  });

  it('deleteUser aborts if the second confirmation is declined', async () => {
    confirmSpy.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const { result } = await renderReady();
    await act(async () => {
      await result.current.deleteUser(userA);
    });
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it('deleteUser shows error toast on failure', async () => {
    mockedDeleteUser.mockRejectedValue(new Error('delete-fail'));
    const { result } = await renderReady();
    await act(async () => {
      await result.current.deleteUser(userA);
    });
    expect(mockedToast.error).toHaveBeenCalledWith('delete-fail');
  });
});
