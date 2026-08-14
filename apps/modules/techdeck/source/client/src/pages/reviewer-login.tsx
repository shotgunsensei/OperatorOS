import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { getCurrentReturnUrl, getOperatorOsLoginUrl, withReturnTo } from "@/lib/operatoros";

export default function ReviewerLoginPage() {
  const loginUrl = withReturnTo(getOperatorOsLoginUrl(), getCurrentReturnUrl());

  useEffect(() => {
    window.location.replace(loginUrl);
  }, [loginUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl" data-testid="text-login-title">OperatorOS Review Access</CardTitle>
          <CardDescription>
            Reviewer and demo access are issued through OperatorOS. TechDeck does not own a separate reviewer password login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" data-testid="link-operatoros-reviewer">
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
