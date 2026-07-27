import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Users, FileCode, BarChart3, Loader2, Search, Trash2, Save, Plus, RefreshCw, ChevronLeft, ChevronRight, X, Pencil, Crown } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

interface UserRecord {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  subscriptionTier: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isAdmin: boolean;
  createdAt: string;
}

interface ScriptRecord {
  id: number;
  name: string;
  description: string;
  format: string;
  category: string;
  source: string;
  downloadCount: number;
  createdAt: string;
}

interface Stats {
  totalUsers: number;
  totalScripts: number;
  subscribedUsers: number;
}

type Tab = "overview" | "users" | "scripts";

function useAdminCheck() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/admin/check`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);
  return isAdmin;
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="glass p-6 rounded-2xl border border-white/5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold font-display">{value}</p>
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/admin/stats`, { credentials: "include" })
      .then(r => r.json())
      .then(setStats);
  }, []);

  if (!stats) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <StatCard label="Total Users" value={stats.totalUsers} icon={<Users className="w-5 h-5" />} />
      <StatCard label="Total Scripts" value={stats.totalScripts} icon={<FileCode className="w-5 h-5" />} />
      <StatCard label="Active Subscriptions" value={stats.subscribedUsers} icon={<BarChart3 className="w-5 h-5" />} />
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "15" });
    if (search) params.set("search", search);
    fetch(`${API_BASE}/api/admin/users?${params}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setUsers(d.users); setTotalPages(d.totalPages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    await fetch(`${API_BASE}/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: editingUser.email,
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        subscriptionTier: editingUser.subscriptionTier || null,
        isAdmin: editingUser.isAdmin,
      }),
    });
    setSaving(false);
    setEditingUser(null);
    fetchUsers();
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
    await fetch(`${API_BASE}/api/admin/users/${id}`, { method: "DELETE", credentials: "include" });
    fetchUsers();
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Search</button>
      </form>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-muted-foreground">
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Email</th>
                <th className="pb-3 pr-4">Tier</th>
                <th className="pb-3 pr-4">Admin</th>
                <th className="pb-3 pr-4">Joined</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-4 font-medium">{u.firstName || ''} {u.lastName || ''}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{u.email || '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.subscriptionTier === 'enterprise' ? 'bg-ninja-red/20 text-ninja-red' : u.subscriptionTier === 'pro' ? 'bg-primary/20 text-primary' : u.subscriptionTier === 'starter' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-muted-foreground'}`}>
                      {u.subscriptionTier || 'none'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{u.isAdmin ? <Shield className="w-4 h-4 text-yellow-400" /> : '—'}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setEditingUser({ ...u })} title="Edit user" className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteUser(u.id)} title="Delete user" className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
        </div>
      )}

      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setEditingUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass rounded-2xl p-6 w-full max-w-md border border-white/10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Edit User</h3>
                <button onClick={() => setEditingUser(null)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">First Name</label>
                    <input value={editingUser.firstName || ""} onChange={e => setEditingUser({ ...editingUser, firstName: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Last Name</label>
                    <input value={editingUser.lastName || ""} onChange={e => setEditingUser({ ...editingUser, lastName: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                  <input value={editingUser.email || ""} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm" />
                </div>

                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Subscription Management</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Subscription Tier</label>
                    <select value={editingUser.subscriptionTier || ""} onChange={e => setEditingUser({ ...editingUser, subscriptionTier: e.target.value || null })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm">
                      <option value="">None (No Access)</option>
                      <option value="starter">Starter ($10/mo)</option>
                      <option value="pro">Pro ($20/mo)</option>
                      <option value="enterprise">Enterprise ($100/mo)</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">Manually assign a subscription tier to grant or revoke access.</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={editingUser.isAdmin} onChange={e => setEditingUser({ ...editingUser, isAdmin: e.target.checked })} className="w-4 h-4 rounded accent-primary" />
                    <span className="text-sm">Admin Access</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingUser(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5">Cancel</button>
                <button onClick={handleSaveUser} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScriptsTab() {
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingScript, setEditingScript] = useState<ScriptRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchScripts = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    fetch(`${API_BASE}/api/admin/scripts?${params}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setScripts(d.scripts); setTotalPages(d.totalPages); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchScripts(); }, [page]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchScripts(); };

  const handleSync = async () => {
    setSyncing(true);
    await fetch(`${API_BASE}/api/admin/sync-github`, { method: "POST", credentials: "include" });
    setSyncing(false);
    fetchScripts();
  };

  const handleSaveScript = async () => {
    if (!editingScript) return;
    setSaving(true);
    await fetch(`${API_BASE}/api/admin/scripts/${editingScript.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: editingScript.name,
        description: editingScript.description,
        format: editingScript.format,
        category: editingScript.category,
      }),
    });
    setSaving(false);
    setEditingScript(null);
    fetchScripts();
  };

  const handleDeleteScript = async (id: number) => {
    if (!confirm("Delete this script? This cannot be undone.")) return;
    await fetch(`${API_BASE}/api/admin/scripts/${id}`, { method: "DELETE", credentials: "include" });
    fetchScripts();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search scripts..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Search</button>
        </form>
        <button onClick={handleSync} disabled={syncing} className="px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sync GitHub
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-muted-foreground">
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">Format</th>
                <th className="pb-3 pr-4">Category</th>
                <th className="pb-3 pr-4">Source</th>
                <th className="pb-3 pr-4">Downloads</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map(s => (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-4 font-medium max-w-[200px] truncate">{s.name}</td>
                  <td className="py-3 pr-4"><span className="px-2 py-0.5 bg-white/5 rounded-md text-xs">{s.format}</span></td>
                  <td className="py-3 pr-4 text-muted-foreground capitalize">{s.category}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{s.source}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{s.downloadCount}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setEditingScript({ ...s })} title="Edit script" className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteScript(s.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
        </div>
      )}

      <AnimatePresence>
        {editingScript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setEditingScript(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass rounded-2xl p-6 w-full max-w-md border border-white/10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Edit Script</h3>
                <button onClick={() => setEditingScript(null)} className="p-1 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                  <input value={editingScript.name} onChange={e => setEditingScript({ ...editingScript, name: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                  <textarea value={editingScript.description} onChange={e => setEditingScript({ ...editingScript, description: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm h-24 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Format</label>
                    <select value={editingScript.format} onChange={e => setEditingScript({ ...editingScript, format: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm">
                      <option value="PowerShell">PowerShell</option>
                      <option value="Batch">Batch</option>
                      <option value="Python">Python</option>
                      <option value="Bash">Bash</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                    <input value={editingScript.category} onChange={e => setEditingScript({ ...editingScript, category: e.target.value })} className="w-full px-3 py-2 bg-background border border-white/10 rounded-lg text-sm" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingScript(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5">Cancel</button>
                <button onClick={handleSaveScript} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Admin() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = useAdminCheck();
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="glass p-8 rounded-2xl text-center max-w-md border border-destructive/20">
          <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You do not have admin privileges.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "scripts", label: "Scripts", icon: <FileCode className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-display">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage users, subscriptions, and scripts</p>
          </div>
        </div>

        <div className="flex gap-2 mb-8 border-b border-white/10 pb-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                tab === t.id ? 'bg-white/5 text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.02]'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "overview" && <OverviewTab />}
          {tab === "users" && <UsersTab />}
          {tab === "scripts" && <ScriptsTab />}
        </motion.div>
      </div>
    </div>
  );
}
