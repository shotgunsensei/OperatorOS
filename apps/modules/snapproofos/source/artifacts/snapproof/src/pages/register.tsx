import { useState } from "react";
import { useRegister } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    organizationName: ""
  });
  const { mutate: register, isPending } = useRegister();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register({ data: formData }, {
      onSuccess: () => {
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err.error || "Failed to register",
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
      <h1 className="text-2xl font-bold mb-2">Create Account</h1>
      <p className="text-muted-foreground mb-6">Start building client-ready reports.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input id="firstName" value={formData.firstName} onChange={handleChange} required className="bg-background border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input id="lastName" value={formData.lastName} onChange={handleChange} required className="bg-background border-border" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={formData.email} onChange={handleChange} required className="bg-background border-border" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={formData.password} onChange={handleChange} required className="bg-background border-border" minLength={8} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="organizationName">Company Name (Optional)</Label>
          <Input id="organizationName" value={formData.organizationName} onChange={handleChange} className="bg-background border-border" />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating account..." : "Create Account"}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="text-primary hover:underline">Log in</Link>
      </div>
    </div>
  );
}