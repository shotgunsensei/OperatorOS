import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { mutate: login, isPending } = useLogin();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ data: { email, password } }, {
      onSuccess: () => {
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err.error || "Failed to log in",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="max-w-md mx-auto mt-16 p-8 bg-card border border-border rounded-lg shadow-xl">
      <div className="flex justify-center mb-6">
        <img src="/images/snapproof-logo.png" alt="SnapProof OS" className="h-16 object-contain" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Welcome Back</h1>
      <p className="text-muted-foreground mb-6">Log in to your operations console.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="bg-background border-border" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-background border-border" />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Logging in..." : "Log In"}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account? <Link href="/register" className="text-primary hover:underline">Register</Link>
      </div>
    </div>
  );
}