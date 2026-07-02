import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6" data-testid="page-not-found">
      <Card className="command-surface w-full max-w-md">
        <CardContent className="p-8 text-center space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Route not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This Tech Deck route is not available in the current workspace shell.
              Use the command center or return to the previous page.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-2">
            <Button variant="outline" onClick={() => window.history.back()} data-testid="button-not-found-back">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button asChild data-testid="button-not-found-dashboard">
              <Link href="/">
                <LayoutDashboard className="w-4 h-4 mr-1" />
                Command Center
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
