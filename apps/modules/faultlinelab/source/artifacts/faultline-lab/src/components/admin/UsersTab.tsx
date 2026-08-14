import { Plus, Shield, ShieldOff, Trash2, UserSearch } from 'lucide-react';
import { CATALOG } from '@/data/catalog';

export interface AdminUser {
  id: string;
  clerkId: string | null;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface UserEntitlement {
  id: string;
  productId: string;
  entitlementType: string;
  source: string;
  isActive: boolean;
  grantedAt: string;
}

interface Props {
  users: AdminUser[] | null;
  usersError: string | null;
  search: string;
  setSearch: (v: string) => void;
  filteredUsers: AdminUser[];
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  userEnts: UserEntitlement[] | null;
  grantProductId: string;
  setGrantProductId: (v: string) => void;
  grantSource: string;
  setGrantSource: (v: string) => void;
  isSuperAdmin: boolean;
  toggleAdmin: (u: AdminUser) => void;
  toggleSuperAdmin: (u: AdminUser) => void;
  deleteUser: (u: AdminUser) => void;
  grant: () => void;
  revoke: (entitlementId: string) => void;
}

export function UsersTab({
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
  isSuperAdmin,
  toggleAdmin,
  toggleSuperAdmin,
  deleteUser,
  grant,
  revoke,
}: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserSearch size={14} className="text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
          />
        </div>
        {usersError && <p className="text-xs text-red-400">{usersError}</p>}
        {!users && !usersError && <p className="text-xs text-zinc-500">Loading users…</p>}
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {filteredUsers.map((u) => (
            <div
              key={u.id}
              className={`w-full px-3 py-2 rounded-lg border transition-colors ${
                selectedUserId === u.id
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-zinc-800/60 hover:border-zinc-700/60'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedUserId(u.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-zinc-100 truncate">
                    {u.displayName || u.email || u.clerkId || u.id}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {u.isSuperAdmin && (
                      <span
                        title="Super admin"
                        className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                      >
                        Super
                      </span>
                    )}
                    {u.isAdmin && <Shield size={12} className="text-emerald-400" />}
                  </span>
                </div>
                {u.email && (
                  <span className="text-[11px] text-zinc-500 truncate block">{u.email}</span>
                )}
              </button>
              {isSuperAdmin && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleAdmin(u)}
                    disabled={u.isSuperAdmin}
                    title={
                      u.isSuperAdmin
                        ? 'Revoke super admin first'
                        : u.isAdmin
                          ? 'Demote to regular user'
                          : 'Promote to admin'
                    }
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border border-zinc-800 hover:border-emerald-500/40 hover:text-emerald-300 text-zinc-400 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400"
                  >
                    {u.isAdmin ? <ShieldOff size={11} /> : <Shield size={11} />}
                    {u.isAdmin ? 'Demote' : 'Promote'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSuperAdmin(u)}
                    title={u.isSuperAdmin ? 'Revoke super admin' : 'Grant super admin'}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border border-zinc-800 hover:border-cyan-500/40 hover:text-cyan-300 text-zinc-400"
                  >
                    <Shield size={11} />
                    {u.isSuperAdmin ? 'Unsuper' : 'Super'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteUser(u)}
                    title="Delete user (server blocks self-deletion)"
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border border-zinc-800 hover:border-red-500/40 hover:text-red-300 text-zinc-400 ml-auto"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
          {users && filteredUsers.length === 0 && (
            <p className="text-xs text-zinc-500">No users match your search.</p>
          )}
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4">
        {!selectedUserId ? (
          <p className="text-sm text-zinc-500">Select a user to inspect entitlements.</p>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-3">User entitlements</h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
              <select
                value={grantProductId}
                onChange={(e) => setGrantProductId(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-100"
              >
                <option value="">Choose product to grant…</option>
                {CATALOG.filter((p) => p.id !== 'base-free').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={grantSource}
                onChange={(e) => setGrantSource(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-100"
                title="Grant source"
              >
                <option value="admin-grant">Admin grant</option>
                <option value="promo-grant">Promo unlock</option>
                <option value="comp">Comp / support</option>
                <option value="beta">Beta access</option>
              </select>
              <button
                onClick={grant}
                disabled={!grantProductId}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <Plus size={12} /> Grant
              </button>
            </div>
            {userEnts === null ? (
              <p className="text-xs text-zinc-500">Loading entitlements…</p>
            ) : userEnts.length === 0 ? (
              <p className="text-xs text-zinc-500">No active entitlements.</p>
            ) : (
              <div className="space-y-1.5">
                {userEnts.map((e) => {
                  const product = CATALOG.find((p) => p.id === e.productId);
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 border border-zinc-800/60 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-100 truncate">
                          {product?.name || e.productId}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono truncate">
                          {e.entitlementType} · {e.source}
                          {!e.isActive && ' · revoked'}
                        </p>
                      </div>
                      {e.isActive && (
                        <button
                          onClick={() => revoke(e.id)}
                          className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
                          title="Revoke"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
