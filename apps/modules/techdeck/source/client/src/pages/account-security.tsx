import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Lock, ShieldCheck } from "lucide-react";
import { getCurrentReturnUrl, getOperatorOsLoginUrl, withReturnTo } from "@/lib/operatoros";

export default function AccountSecurityPage() {
  const operatorOsSecurityUrl = withReturnTo(getOperatorOsLoginUrl(), getCurrentReturnUrl());

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-account-security-title">Account Security</h1>
        <p className="text-muted-foreground mt-1">
          Identity settings are managed by OperatorOS.
        </p>
      </div>

      <Card className="command-surface" data-testid="card-operatoros-security">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">OperatorOS-Controlled Identity</CardTitle>
          </div>
          <CardDescription>
            TechDeck no longer owns passwords, MFA setup, account recovery, or standalone credential changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 mt-0.5 text-primary" />
              <p>
                Use OperatorOS to manage your login, security profile, tenant membership, and module entitlements. TechDeck only consumes the authenticated OperatorOS module context.
              </p>
            </div>
          </div>
          <Button asChild data-testid="button-open-operatoros-security">
            <a href={operatorOsSecurityUrl}>
              Open OperatorOS account security
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
