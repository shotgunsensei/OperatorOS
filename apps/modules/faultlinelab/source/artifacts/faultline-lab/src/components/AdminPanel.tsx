import { useState, useSyncExternalStore } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { CATALOG, subscribeCatalog } from '@/data/catalog';
import {
  addOwnedProduct,
  getEntitlements,
  removeOwnedProduct,
  subscribeEntitlements,
} from '@/lib/entitlements';
import { Shield } from 'lucide-react';
import AdminCaseAuthoringPanel from './AdminCaseAuthoringPanel';
import { CatalogTab } from './admin/CatalogTab';
import CrossPromoTab from './admin/CrossPromoTab';
import { UsersTab } from './admin/UsersTab';
import { CatalogHistoryDrawer } from './admin/CatalogHistoryDrawer';
import { AdminHeader, type AdminTab } from './admin/AdminHeader';
import { useCatalogOverrides } from './admin/useCatalogOverrides';
import { useAdminUsers } from './admin/useAdminUsers';

export default function AdminPanel() {
  const setView = useAppStore((s) => s.setView);
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );
  const [tab, setTab] = useState<AdminTab>('catalog');
  useSyncExternalStore(
    (cb) => subscribeCatalog(cb),
    () => CATALOG.length
  );

  const catalog = useCatalogOverrides();
  const usersState = useAdminUsers(tab === 'users');

  if (!ent.isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0e14] text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <Shield className="w-10 h-10 text-zinc-700 mb-4" />
        <h1 className="text-lg font-semibold mb-1">Admin only</h1>
        <p className="text-sm text-zinc-400 mb-4">You need admin access to view this page.</p>
        <button
          onClick={() => setView('incident-board')}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-sm"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e14] text-zinc-100">
      <AdminHeader tab={tab} onTabChange={setTab} onBack={() => setView('incident-board')} />

      <main className="max-w-6xl mx-auto px-4 py-6 pb-24">
        {tab === 'catalog' && (
          <CatalogTab
            overrides={catalog.overrides}
            overrideMeta={catalog.overrideMeta}
            editing={catalog.editing}
            draft={catalog.draft}
            setDraft={catalog.setDraft}
            setEditing={catalog.setEditing}
            startEdit={catalog.startEdit}
            saveEdit={(id) => void catalog.saveEdit(id)}
            updateOverride={(id, patch) => void catalog.updateOverride(id, patch)}
            revert={(id) => void catalog.revert(id)}
            openHistory={(id) => void catalog.openHistory(id)}
          />
        )}

        {tab === 'users' && (
          <UsersTab
            users={usersState.users}
            usersError={usersState.usersError}
            search={usersState.search}
            setSearch={usersState.setSearch}
            filteredUsers={usersState.filteredUsers}
            selectedUserId={usersState.selectedUserId}
            setSelectedUserId={usersState.setSelectedUserId}
            userEnts={usersState.userEnts}
            grantProductId={usersState.grantProductId}
            setGrantProductId={usersState.setGrantProductId}
            grantSource={usersState.grantSource}
            setGrantSource={usersState.setGrantSource}
            isSuperAdmin={!!ent.isSuperAdmin}
            toggleAdmin={(u) => void usersState.toggleAdmin(u)}
            toggleSuperAdmin={(u) => void usersState.toggleSuperAdmin(u)}
            deleteUser={(u) => void usersState.deleteUser(u)}
            grant={() => void usersState.grant()}
            revoke={(id) => void usersState.revoke(id)}
          />
        )}
        {tab === 'authoring' && <AdminCaseAuthoringPanel />}
        {tab === 'cross-promo' && <CrossPromoTab />}
      </main>

      {catalog.historyFor && (
        <CatalogHistoryDrawer
          productId={catalog.historyFor}
          entries={catalog.historyEntries}
          loading={catalog.historyLoading}
          onClose={() => catalog.setHistoryFor(null)}
          onRollback={(entry) => void catalog.rollbackTo(catalog.historyFor!, entry)}
        />
      )}
    </div>
  );
}

// Local mock-mode helper exposed for use in dev when API is missing
export function applyLocalEntitlement(productId: string, action: 'grant' | 'revoke') {
  if (action === 'grant') addOwnedProduct(productId);
  else removeOwnedProduct(productId);
}
