import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Login() {
  const { isAuthenticated, login, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">BF</div>
          </div>
          <CardTitle className="text-2xl">Sign in to BrandForge</CardTitle>
          <p className="text-muted-foreground mt-2">Your AI-powered marketing operating system</p>
        </CardHeader>
        <CardContent>
          <Button onClick={login} disabled={isLoading} size="lg" className="w-full">
            {isLoading ? "Loading..." : "Continue with Replit"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
