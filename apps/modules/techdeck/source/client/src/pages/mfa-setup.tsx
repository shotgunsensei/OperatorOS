import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { getCurrentReturnUrl, getOperatorOsLoginUrl, withReturnTo } from "@/lib/operatoros";

export default function MfaSetupPage() {
  const operatorOsSecurityUrl = withReturnTo(getOperatorOsLoginUrl(), getCurrentReturnUrl());

  useEffect(() => {
    window.location.replace(operatorOsSecurityUrl);
  }, [operatorOsSecurityUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>
          <CardTitle data-testid="text-mfa-setup-title">MFA Is Managed By OperatorOS</CardTitle>
          <CardDescription>
            TechDeck consumes OperatorOS SSO and does not maintain a separate MFA enrollment flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" data-testid="button-open-operatoros-mfa">
            <a href={operatorOsSecurityUrl}>
              Continue to OperatorOS
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
