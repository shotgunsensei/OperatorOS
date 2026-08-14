import { useState } from "react";
import {
  useGetBillingStatus,
  useCreateBillingPortal,
  useLogout,
  useGetDashboard,
  useUpdateProfile,
  useDeleteAccount,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { Loader2, User, CreditCard, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function Account() {
  useDocumentMeta("Account Settings", "Manage your StudyForge profile, subscription, and account.");
  const { user, refresh } = useAuth();
  const { data: billing, isLoading: billingLoading } = useGetBillingStatus();
  const { data: dashboard } = useGetDashboard();
  const portal = useCreateBillingPortal();
  const logout = useLogout();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isDemoAccount = user?.email.endsWith("@example.com") ?? false;

  const startEdit = () => {
    setNameDraft(user?.name ?? "");
    setEditingName(true);
  };

  const cancelEdit = () => {
    setEditingName(false);
    setNameDraft("");
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      return;
    }
    try {
      await updateProfile.mutateAsync({ data: { name: trimmed } });
      await refresh();
      toast.success("Profile updated");
      setEditingName(false);
    } catch {
      toast.error("Failed to update profile");
    }
  };

  const handlePortal = async () => {
    try {
      const res = await portal.mutateAsync();
      if (res.demoMode) {
        toast.info(res.message);
      } else if (res.url) {
        window.location.href = res.url;
      }
    } catch {
      toast.error("Failed to open billing portal");
    }
  };

  const handleLogout = async () => {
    await logout.mutateAsync();
    refresh();
    window.location.href = "/";
  };

  const handleDelete = async () => {
    try {
      await deleteAccount.mutateAsync();
      toast.success("Account deleted");
      window.location.href = "/";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      toast.error(message);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage your profile and subscription.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" aria-hidden="true" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Name</div>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={80}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <Button size="icon" onClick={saveName} disabled={updateProfile.isPending} aria-label="Save name">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button size="icon" variant="outline" onClick={cancelEdit} aria-label="Cancel">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-lg">{user.name}</div>
                <Button size="icon" variant="ghost" onClick={startEdit} aria-label="Edit name">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Email</div>
            <div className="text-lg">{user.email}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Role</div>
            <div className="capitalize">{user.role}</div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/50 border-t border-border py-4">
          <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
            Log Out
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" aria-hidden="true" /> Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {billingLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : billing ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Current Plan</div>
                  <div className="text-xl font-bold uppercase tracking-wider text-primary">{billing.plan}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
                  <div className="text-sm">
                    {billing.demoMode ? (
                      <span className="text-accent font-medium">Demo Mode</span>
                    ) : billing.cancelAtPeriodEnd ? (
                      <span className="text-destructive font-medium">Cancels {billing.renewsAt && new Date(billing.renewsAt).toLocaleDateString()}</span>
                    ) : billing.renewsAt ? (
                      <span className="text-green-500 font-medium">Renews {new Date(billing.renewsAt).toLocaleDateString()}</span>
                    ) : (
                      "Active"
                    )}
                  </div>
                </div>
              </div>
              {dashboard && (
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Study Sets</div>
                    <div className="text-lg font-semibold">
                      {dashboard.planUsage.studySetsUsed}
                      <span className="text-sm text-muted-foreground font-normal"> / {dashboard.planUsage.studySetsLimit ?? "∞"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Quizzes / mo</div>
                    <div className="text-lg font-semibold">
                      {dashboard.planUsage.quizAttemptsThisMonth}
                      <span className="text-sm text-muted-foreground font-normal"> / {dashboard.planUsage.quizAttemptsLimit ?? "∞"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Cards</div>
                    <div className="text-lg font-semibold">{dashboard.flashcardsCount}</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-destructive">Failed to load billing status</div>
          )}
        </CardContent>
        <CardFooter className="bg-muted/50 border-t border-border py-4 flex gap-4">
          {billing?.plan === "free" ? (
            <Link href="~/pricing" className="w-full">
              <Button className="w-full">Upgrade Plan</Button>
            </Link>
          ) : (
            <Button onClick={handlePortal} disabled={portal.isPending} className="w-full">
              {portal.isPending ? "Loading..." : "Manage Billing & Payment"}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" /> Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated study sets, flashcards, quizzes, and exam countdowns. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardFooter className="bg-destructive/5 border-t border-destructive/30 py-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isDemoAccount}>
                {isDemoAccount ? "Demo accounts cannot be deleted" : "Delete my account"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your profile, study sets, flashcards, quiz attempts, exam countdowns, and folders. There is no recovery.
                  <br /><br />
                  Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                aria-label="Type DELETE to confirm"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirm("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteConfirm !== "DELETE" || deleteAccount.isPending}
                  onClick={handleDelete}
                >
                  {deleteAccount.isPending ? "Deleting..." : "Delete forever"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}
