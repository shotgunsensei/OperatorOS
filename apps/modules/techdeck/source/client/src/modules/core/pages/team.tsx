import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users,
  Plus,
  Shield,
  Crown,
  Wrench,
  User,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MemberWithUser } from "@/lib/types";

function getRoleIcon(role: string) {
  switch (role) {
    case "OWNER":
      return Crown;
    case "ADMIN":
      return Shield;
    case "TECH":
      return Wrench;
    case "CLIENT":
      return User;
    default:
      return User;
  }
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" {
  switch (role) {
    case "OWNER":
      return "default";
    case "ADMIN":
      return "default";
    default:
      return "secondary";
  }
}

export default function TeamPage() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/members"],
  });

  const inviteMember = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest("POST", "/api/members/invite", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setOpen(false);
      toast({ title: "Member invited" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-team-title">
            Team
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your organization members and roles.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-invite-member">
              <Plus className="w-4 h-4 mr-1" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                inviteMember.mutate({
                  email: fd.get("email") as string,
                  role: fd.get("role") as string,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="pl-9"
                    placeholder="colleague@example.com"
                    data-testid="input-invite-email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select name="role" defaultValue="TECH">
                  <SelectTrigger data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="TECH">Tech</SelectItem>
                    <SelectItem value="CLIENT">Client</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Admins can manage everything. Techs can manage evidence. Clients
                  can only view assigned evidence.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={inviteMember.isPending}
                data-testid="button-submit-invite"
              >
                {inviteMember.isPending ? "Inviting..." : "Send Invite"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!members?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No team members yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {members.map((member) => {
            const RoleIcon = getRoleIcon(member.role);
            const initials = `${(member.user.firstName || "")[0] || ""}${
              (member.user.lastName || "")[0] || ""
            }`;

            return (
              <Card key={member.id} data-testid={`card-member-${member.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-9 h-9">
                        <AvatarImage
                          src={member.user.profileImageUrl || undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {initials || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {member.user.firstName} {member.user.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.user.email}
                        </p>
                      </div>
                    </div>
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      <RoleIcon className="w-3 h-3 mr-1" />
                      {member.role}
                    </Badge>
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
