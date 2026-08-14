import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  adminDeleteUser,
  adminFetchUserEntitlements,
  adminFetchUsers,
  adminGrantEntitlement,
  adminRevokeEntitlement,
  adminUpdateUserRole,
} from '@/lib/api';
import type { AdminUser, UserEntitlement } from './UsersTab';

export function useAdminUsers(active: boolean) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userEnts, setUserEnts] = useState<UserEntitlement[] | null>(null);
  const [grantProductId, setGrantProductId] = useState('');
  const [grantSource, setGrantSource] = useState('admin-grant');

  useEffect(() => {
    if (!active) return;
    if (users !== null) return;
    adminFetchUsers()
      .then((r) => setUsers(r.users))
      .catch((e) => setUsersError(e.message || 'Failed to load users'));
  }, [active, users]);

  useEffect(() => {
    if (!selectedUserId) return;
    setUserEnts(null);
    adminFetchUserEntitlements(selectedUserId)
      .then((r) => setUserEnts(r.entitlements))
      .catch(() => setUserEnts([]));
  }, [selectedUserId]);

  const filteredUsers = (users || []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.clerkId || '').toLowerCase().includes(q)
    );
  });

  const reloadUsers = async () => {
    try {
      const r = await adminFetchUsers();
      setUsers(r.users);
    } catch (e: any) {
      setUsersError(e?.message || 'Failed to reload users');
    }
  };

  const grant = async () => {
    if (!selectedUserId || !grantProductId) return;
    try {
      await adminGrantEntitlement(selectedUserId, grantProductId, grantSource);
      toast.success('Entitlement granted.');
      const r = await adminFetchUserEntitlements(selectedUserId);
      setUserEnts(r.entitlements);
      setGrantProductId('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to grant entitlement.');
    }
  };

  const revoke = async (entitlementId: string) => {
    if (!selectedUserId) return;
    try {
      await adminRevokeEntitlement(selectedUserId, entitlementId);
      toast.success('Entitlement revoked.');
      const r = await adminFetchUserEntitlements(selectedUserId);
      setUserEnts(r.entitlements);
    } catch (e: any) {
      toast.error(e.message || 'Failed to revoke entitlement.');
    }
  };

  const toggleAdmin = async (target: AdminUser) => {
    const next = !target.isAdmin;
    const verb = next ? 'Promote to admin' : 'Demote to regular user';
    if (!window.confirm(`${verb} — ${target.email || target.displayName || target.id}?`)) return;
    try {
      await adminUpdateUserRole(target.id, { isAdmin: next });
      toast.success(next ? 'Promoted to admin.' : 'Demoted to regular user.');
      await reloadUsers();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update role.');
    }
  };

  const toggleSuperAdmin = async (target: AdminUser) => {
    const next = !target.isSuperAdmin;
    const verb = next ? 'Grant SUPER ADMIN to' : 'Revoke super admin from';
    if (
      !window.confirm(
        `${verb} ${target.email || target.displayName || target.id}? Super admins can manage other users.`
      )
    )
      return;
    try {
      await adminUpdateUserRole(target.id, { isSuperAdmin: next });
      toast.success(next ? 'Super admin granted.' : 'Super admin revoked.');
      await reloadUsers();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update role.');
    }
  };

  const deleteUser = async (target: AdminUser) => {
    const label = target.email || target.displayName || target.id;
    if (
      !window.confirm(
        `Delete user ${label}? This removes their profile, entitlements, and purchase history. This cannot be undone.`
      )
    )
      return;
    if (!window.confirm(`Final confirmation: permanently delete ${label}?`)) return;
    try {
      await adminDeleteUser(target.id);
      toast.success('User deleted.');
      if (selectedUserId === target.id) {
        setSelectedUserId(null);
        setUserEnts(null);
      }
      await reloadUsers();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete user.');
    }
  };

  return {
    users,
    usersError,
    search,
    setSearch,
    filteredUsers,
    selectedUserId,
    setSelectedUserId,
    userEnts,
    grantProductId,
    setGrantProductId,
    grantSource,
    setGrantSource,
    grant,
    revoke,
    toggleAdmin,
    toggleSuperAdmin,
    deleteUser,
  };
}
