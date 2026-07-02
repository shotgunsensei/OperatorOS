import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const errorMessage = import.meta.env.DEV ? this.state.error?.message : undefined;

      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid="error-boundary">
          <div className="command-surface max-w-md text-center space-y-4 p-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              This page hit an unexpected error. You can try again, or reload the app if it persists.
            </p>
            {errorMessage && (
              <pre className="text-xs text-left bg-muted/50 p-3 rounded-md overflow-auto max-h-40">
                {errorMessage}
              </pre>
            )}
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" onClick={this.handleReset} data-testid="button-error-retry">
                <RefreshCw className="w-4 h-4 mr-2" /> Try again
              </Button>
              <Button onClick={this.handleReload} data-testid="button-error-reload">
                Reload app
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
