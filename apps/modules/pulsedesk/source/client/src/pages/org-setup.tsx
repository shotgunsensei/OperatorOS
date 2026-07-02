import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";
import pulsedeskLogo from "@assets/pulsedesklogo_1775753913991.png";

export default function OrgSetup() {
  const { refreshAuth, logout } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshAuth();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/orgs/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshAuth();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-4">
            <img src={pulsedeskLogo} alt="PulseDesk" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Set Up Your Facility</h1>
          <p className="text-sm text-muted-foreground mt-1">Create a new organization or join an existing one</p>
        </div>

        <Tabs defaultValue="create">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="create">Create Facility</TabsTrigger>
            <TabsTrigger value="join">Join with Code</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> New Organization</CardTitle>
                <CardDescription>Set up PulseDesk for your hospital or facility</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input id="org-name" data-testid="input-org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Metro Health Network" className="mt-1" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || !name.trim()} data-testid="button-create-org">
                    {loading ? "Creating..." : "Create Organization"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="join">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Join Existing</CardTitle>
                <CardDescription>Enter an invite code from your organization</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleJoin} className="space-y-4">
                  <div>
                    <Label htmlFor="invite-code">Invite Code</Label>
                    <Input id="invite-code" data-testid="input-invite-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code..." className="mt-1" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || !code.trim()} data-testid="button-join-org">
                    {loading ? "Joining..." : "Join Organization"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout-setup">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
