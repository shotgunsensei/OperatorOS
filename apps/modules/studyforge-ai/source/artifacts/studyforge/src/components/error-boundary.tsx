import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Top-level React error boundary. Stops a render-time crash in any page
 * from blanking the whole app and gives the user a recovery action.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          <h2 className="text-2xl font-bold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error. You can try again, or head back to the dashboard.
          </p>
          <pre className="text-xs text-left bg-muted/40 p-3 rounded-md overflow-auto max-h-40">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={this.reset}>Try again</Button>
            <Button onClick={() => { window.location.href = import.meta.env.BASE_URL; }}>
              Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
