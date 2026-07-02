import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldOff, ExternalLink, Users } from "lucide-react";

/**
 * Public landing page shown when OperatorOS reports that the signed-in
 * user does not have access to the Tech Deck module. Rendered for the
 * 401 `module_access_denied` SSO reject code (browser clients).
 */
export default function AccessDeniedPage() {
  const operatorosUrl =
    (import.meta.env.VITE_OPERATOROS_URL as string | undefined)
    || (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined)
    || "https://operatoros.net";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-background"
      data-testid="page-access-denied"
    >
      <Card className="command-surface max-w-lg w-full">
        <CardContent className="p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 text-destructive">
            <ShieldOff className="w-7 h-7" />
          </div>
          <div>
            <Badge variant="outline" className="mb-3">Reason: module not entitled</Badge>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-access-denied-title">
              Access to Tech Deck is managed by OperatorOS
            </h1>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-access-denied-body">
              Your OperatorOS account does not currently have access to the Tech Deck module,
              or the latest entitlement snapshot has not synced into this child app.
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-4 text-left text-sm">
            <div className="flex gap-3">
              <Users className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="font-medium">What to do next</p>
                <p className="mt-1 text-muted-foreground">
                  Contact your tenant admin to confirm your role and module access, then relaunch Tech Deck from OperatorOS.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1">
            <Button asChild data-testid="button-open-operatoros">
              <a href={operatorosUrl} rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open OperatorOS
              </a>
            </Button>
            <Button asChild variant="outline" data-testid="button-contact-admin">
              <a href="mailto:hello@techdeck.app?subject=Tech%20Deck%20access%20review">
                Contact tenant admin
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
