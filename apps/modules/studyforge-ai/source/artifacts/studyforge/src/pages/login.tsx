import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export default function Login() {
  useDocumentMeta("Login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const { refresh } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ data: { email, password } });
      refresh();
      toast.success("Logged in successfully");
      window.location.href = "/app";
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to login");
    }
  };

  const handleDemo = (email: string) => {
    setEmail(email);
    setPassword("demo123");
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Login to access your study materials</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Logging in..." : "Login"}
            </Button>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Demo Accounts</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => handleDemo("student@example.com")}>Student</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleDemo("tutor@example.com")}>Tutor</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleDemo("admin@example.com")}>Admin</Button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Click a role to fill credentials, then press Login.</p>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/signup" className="text-primary hover:underline font-medium">Sign up</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}