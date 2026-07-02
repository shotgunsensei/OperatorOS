import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Upload,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { Client } from "@shared/schema";
import type { MemberWithUser } from "@/lib/types";

interface ClientAccessEntry {
  id: string;
  tenantId: string;
  clientId: string;
  userId: string;
  canUpload: boolean;
  createdAt: string | null;
  clientName: string | null;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

export default function ClientAccessPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [canUpload, setCanUpload] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: accessList, isLoading } = useQuery<ClientAccessEntry[]>({
    queryKey: ["/api/client-access"],
  });

  const { data: members } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/members"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const clientMembers = members?.filter((m) => m.role === "CLIENT") || [];

  const addMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/client-access", {
        userId: selectedUserId,
        clientId: selectedClientId,
        canUpload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-access"] });
      toast({ title: "Client access granted" });
      setSelectedUserId("");
      setSelectedClientId("");
      setCanUpload(false);
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/client-access/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-access"] });
      toast({ title: "Client access revoked" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleUploadMutation = useMutation({
    mutationFn: async ({ id, canUpload }: { id: string; canUpload: boolean }) => {
      await apiRequest("PATCH", `/api/client-access/${id}`, { canUpload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-access"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-client-access-title">
            Client Access
          </h1>
          <p className="text-sm text-muted-foreground">
            Assign CLIENT users to specific clients and control upload permissions.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-client-access">
              <UserPlus className="w-4 h-4 mr-1" />
              Grant Access
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Client Access</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Client User</p>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger data-testid="select-access-user">
                    <SelectValue placeholder="Select a CLIENT user" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientMembers.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No CLIENT role users found
                      </SelectItem>
                    ) : (
                      clientMembers.map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.user.firstName} {m.user.lastName} ({m.user.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Client</p>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger data-testid="select-access-client">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Allow Upload</p>
                  <p className="text-xs text-muted-foreground">
                    Let this user upload evidence to this client
                  </p>
                </div>
                <Switch
                  checked={canUpload}
                  onCheckedChange={setCanUpload}
                  data-testid="switch-can-upload"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!selectedUserId || !selectedClientId || addMutation.isPending}
                data-testid="button-confirm-grant-access"
              >
                {addMutation.isPending ? "Granting..." : "Grant Access"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!accessList?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No client access assignments yet</p>
          <p className="text-xs mt-1">
            First, invite users with the CLIENT role from the Team page, then grant them access here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accessList.map((entry) => {
            const userName = [entry.userFirstName, entry.userLastName]
              .filter(Boolean)
              .join(" ") || entry.userEmail || "Unknown";
            return (
              <Card key={entry.id} data-testid={`card-access-${entry.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-access-user-${entry.id}`}>
                          {userName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{entry.clientName || "Unknown client"}</span>
                          {entry.canUpload && (
                            <Badge variant="secondary" className="text-xs">
                              <Upload className="w-3 h-3 mr-1" />
                              Can Upload
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Upload</span>
                        <Switch
                          checked={entry.canUpload}
                          onCheckedChange={(checked) =>
                            toggleUploadMutation.mutate({ id: entry.id, canUpload: checked })
                          }
                          data-testid={`switch-upload-${entry.id}`}
                        />
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-revoke-${entry.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove {userName}'s access to {entry.clientName}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeMutation.mutate(entry.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
