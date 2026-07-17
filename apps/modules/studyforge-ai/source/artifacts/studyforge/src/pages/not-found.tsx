import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";

export default function NotFound() {
  useDocumentMeta("Page Not Found");
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-10 pb-8 px-8">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Compass className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold mb-2">404 — Page not found</h1>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or may have moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="~/">
              <Button variant="outline" className="w-full sm:w-auto">Go to homepage</Button>
            </Link>
            <Link href="~/app">
              <Button className="w-full sm:w-auto">Open dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
