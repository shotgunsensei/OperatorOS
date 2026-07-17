import { useGetAdminStats, useListAdminUsers, useGetAdminSettings, useUpdateAdminSettings } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ShieldAlert, Users, Database, Zap, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAdminSettingsQueryKey, getGetAdminStatsQueryKey, getListAdminUsersQueryKey } from "@workspace/api-client-react";

export default function Admin() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useGetAdminStats({ query: { retry: false, queryKey: getGetAdminStatsQueryKey() } });
  const { data: users, isLoading: usersLoading, error: usersError } = useListAdminUsers({ query: { retry: false, queryKey: getListAdminUsersQueryKey() } });
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useGetAdminSettings({ query: { retry: false, queryKey: getGetAdminSettingsQueryKey() } });
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();

  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (settings) {
      setAnnouncement(settings.announcement || "");
    }
  }, [settings]);

  const handleToggle = (key: 'demoMode' | 'signupOpen', value: boolean) => {
    if (!settings) return;
    updateSettings.mutate(
      { data: { ...settings, [key]: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
          toast.success("Settings updated");
        },
        onError: (err) => toast.error("Failed to update", { description: err.message })
      }
    );
  };

  const handleSaveAnnouncement = () => {
    if (!settings) return;
    updateSettings.mutate(
      { data: { ...settings, announcement } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
          toast.success("Announcement broadcasted");
        },
        onError: (err) => toast.error("Broadcast failed", { description: err.message })
      }
    );
  };

  const accessError = statsError || usersError || settingsError;
  if (accessError) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-12 border border-destructive/40 bg-destructive/5 rounded-md text-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold font-mono text-destructive">ACCESS_DENIED</h1>
        <p className="font-mono text-xs text-muted-foreground">
          You do not have admin clearance for this mainframe.
        </p>
      </div>
    );
  }
  if (statsLoading || usersLoading || settingsLoading) {
    return <div className="p-8 font-mono animate-pulse text-muted-foreground">ACCESSING_ADMIN_MAINFRAME...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">God Mode</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Global system overview & control</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono">TOTAL_OPERATORS</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.userCount || 0}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-[10px]">PRO: {stats?.proCount || 0}</Badge>
              <Badge variant="outline" className="text-[10px]">AGENCY: {stats?.agencyCount || 0}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono">TOTAL_PAYLOADS</CardTitle>
            <Database className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.kitCount || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium font-mono">TOTAL_EXPORTS</CardTitle>
            <Zap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.exportCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <Card className="col-span-2 border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>Operator Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="font-mono text-xs">EMAIL</TableHead>
                  <TableHead className="font-mono text-xs">PLAN</TableHead>
                  <TableHead className="font-mono text-xs">KITS</TableHead>
                  <TableHead className="font-mono text-xs">CREATED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <TableRow key={u.id} className="border-border/20">
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[10px] uppercase ${u.plan !== 'free' ? 'border-primary text-primary' : ''}`}>
                        {u.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{u.kitCount}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(u.createdAt), 'yyyy-MM-dd')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-destructive" />
              System Overrides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-mono text-destructive">DEMO_MODE</Label>
                <p className="text-xs text-muted-foreground">Allow guest generation</p>
              </div>
              <Switch 
                checked={settings?.demoMode} 
                onCheckedChange={(v) => handleToggle('demoMode', v)} 
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-mono">SIGNUPS_OPEN</Label>
                <p className="text-xs text-muted-foreground">Accept new registrations</p>
              </div>
              <Switch 
                checked={settings?.signupOpen} 
                onCheckedChange={(v) => handleToggle('signupOpen', v)} 
              />
            </div>
            
            <div className="pt-4 border-t border-border/30 space-y-3">
              <Label className="text-sm font-mono">GLOBAL_ANNOUNCEMENT</Label>
              <div className="flex gap-2">
                <Input 
                  value={announcement} 
                  onChange={(e) => setAnnouncement(e.target.value)} 
                  placeholder="System wide broadcast..."
                  className="font-mono text-xs"
                />
                <Button size="sm" onClick={handleSaveAnnouncement} disabled={updateSettings.isPending}>SAVE</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}