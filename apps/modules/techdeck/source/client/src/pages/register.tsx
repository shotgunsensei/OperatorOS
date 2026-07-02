import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, UserPlus } from "lucide-react";
import logoImage from "@assets/ShotgunNinjaVaulticon_1770412982737.png";
import { getCurrentReturnUrl, getOperatorOsRequestAccessUrl, withReturnTo } from "@/lib/operatoros";

export default function RegisterPage() {
  const requestAccessUrl = withReturnTo(getOperatorOsRequestAccessUrl(), getCurrentReturnUrl());

  useEffect(() => {
    window.location.replace(requestAccessUrl);
  }, [requestAccessUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="command-surface w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={logoImage} alt="Tech Deck" className="w-10 h-10 rounded-md object-cover" />
          </div>
          <CardTitle className="text-xl" data-testid="text-register-title">
            Request Access in OperatorOS
          </CardTitle>
          <CardDescription>
            TechDeck account creation is centralized in OperatorOS so tenant membership, subscription state, and module entitlement stay in one control plane.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" data-testid="link-request-access">
            <a href={requestAccessUrl}>
              <UserPlus className="w-4 h-4 mr-2" />
              Continue to OperatorOS
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
