import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, ShieldCheck } from "lucide-react";
import logoImage from "@assets/ShotgunNinjaVaulticon_1770412982737.png";
import { getCurrentReturnUrl, getOperatorOsLoginUrl, withReturnTo } from "@/lib/operatoros";

export default function LoginPage() {
  const loginUrl = withReturnTo(getOperatorOsLoginUrl(), getCurrentReturnUrl());

  useEffect(() => {
    window.location.replace(loginUrl);
  }, [loginUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="command-surface w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={logoImage} alt="Tech Deck" className="w-10 h-10 rounded-md object-cover" />
          </div>
          <CardTitle className="text-xl" data-testid="text-login-title">
            OperatorOS Sign In Required
          </CardTitle>
          <CardDescription>
            TechDeck no longer accepts direct password sign-in. OperatorOS owns identity, SSO, tenants, roles, and entitlements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" data-testid="link-operatoros-launch">
            <a href={loginUrl}>
              <ShieldCheck className="w-4 h-4 mr-2" />
              Continue to OperatorOS
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
