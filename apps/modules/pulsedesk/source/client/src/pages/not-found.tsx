import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import pulsedeskLogo from "@assets/pulsedesklogo_1775753913991.png";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-muted mx-auto">
          <img src={pulsedeskLogo} alt="PulseDesk" className="h-10 w-10 object-contain opacity-50" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-1">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or you may not have access to it.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-not-found-home">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function Unauthorized() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-900/20 mx-auto">
          <img src={pulsedeskLogo} alt="PulseDesk" className="h-10 w-10 object-contain opacity-60" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-1">Access restricted</h1>
          <p className="text-sm text-muted-foreground">
            You don't have the required permissions to view this page.
            Contact your administrator if you believe this is an error.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-unauthorized-home">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
