import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { ArrowLeft, AlertTriangle, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentReturnUrl, getOperatorOsLoginUrl, withReturnTo } from "@/lib/operatoros";

export default function DeleteAccountPage() {
  const { user, isLoading: authLoading } = useAuth();
  const operatorOsLoginUrl = withReturnTo(getOperatorOsLoginUrl(), getCurrentReturnUrl());
  const [confirmText, setConfirmText] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  const { data: accountInfo, isLoading: infoLoading } = useQuery<{
    tenantCount: number;
    soloTenants: string[];
  }>({
    queryKey: ["/api/account/info"],
    enabled: !!user,
  });

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await apiRequest("DELETE", "/api/account");
      setDeleted(true);
      queryClient.clear();
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Failed to delete account");
      setDeleting(false);
    }
  };

  if (deleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-delete-success">Account Deleted</h2>
            <p className="text-sm text-muted-foreground">
              Your account and all associated data have been permanently removed.
              You will be redirected shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                <a href="/"><ArrowLeft className="w-4 h-4" /></a>
              </Button>
              <span className="font-semibold text-sm tracking-tight">Tech Deck</span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="max-w-md mx-auto px-6 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Sign in required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            You need to sign in to delete your account and data.
          </p>
          <Button asChild data-testid="button-sign-in-to-delete">
            <a href={operatorOsLoginUrl}>Sign in with OperatorOS</a>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8" data-testid="button-back">
              <a href="/"><ArrowLeft className="w-4 h-4" /></a>
            </Button>
            <span className="font-semibold text-sm tracking-tight">Tech Deck</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-12">
        <Card className="border-destructive/30">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-lg" data-testid="text-delete-title">Delete Account</CardTitle>
                <CardDescription>Permanently remove your account and data</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-destructive/5 border border-destructive/20 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-destructive mb-1">This action is permanent and cannot be undone.</p>
                  <p className="text-muted-foreground">Deleting your account will:</p>
                </div>
              </div>
              <ul className="text-sm text-muted-foreground ml-6 space-y-1 list-disc">
                <li>Remove your user profile and login credentials</li>
                <li>Remove your membership from all organizations</li>
                <li>Permanently delete any organizations where you are the only member, including all tickets, clients, invoices, time entries, evidence, and other data</li>
              </ul>
            </div>

            {infoLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : accountInfo && (accountInfo.tenantCount > 0 || accountInfo.soloTenants.length > 0) ? (
              <div className="rounded-md bg-muted/50 p-4 text-sm space-y-1">
                <p>You are a member of <strong>{accountInfo.tenantCount}</strong> organization{accountInfo.tenantCount !== 1 ? "s" : ""}.</p>
                {accountInfo.soloTenants.length > 0 && (
                  <p className="text-destructive">
                    The following will be permanently deleted: {accountInfo.soloTenants.map((n, i) => (
                      <strong key={i}>{i > 0 ? ", " : ""}{n}</strong>
                    ))}
                  </p>
                )}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="confirm">Type <strong>DELETE</strong> to confirm</Label>
              <Input
                id="confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                data-testid="input-confirm-delete"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="text-delete-error">{error}</p>
            )}

            <Button
              variant="destructive"
              className="w-full"
              disabled={confirmText !== "DELETE" || deleting}
              onClick={() => setShowDialog(true)}
              data-testid="button-delete-account"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete My Account
            </Button>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account, all your data, and any
              organizations where you are the only member. This action cannot be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
