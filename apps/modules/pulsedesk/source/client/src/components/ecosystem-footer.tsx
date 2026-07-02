interface EcosystemFooterProps {
  variant?: "full" | "compact" | "sidebar";
}

export function EcosystemFooter({ variant = "full" }: EcosystemFooterProps) {
  if (variant === "sidebar") {
    return (
      <div className="px-2 pt-2 text-[10px] text-sidebar-foreground/40 leading-relaxed" data-testid="ecosystem-footer-sidebar">
        <a
          href="https://shotgunninjas.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-sidebar-foreground/70 transition-colors"
          data-testid="link-shotgunninjas"
        >
          Built by Shotgun Ninjas Productions
        </a>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="text-center text-[11px] text-muted-foreground" data-testid="ecosystem-footer-compact">
        Built by{" "}
        <a
          href="https://shotgunninjas.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
          data-testid="link-shotgunninjas"
        >
          Shotgun Ninjas Productions
        </a>
      </div>
    );
  }

  return (
    <div className="w-full py-4 border-t bg-background text-xs text-muted-foreground" data-testid="ecosystem-footer">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <a href="/privacy" className="hover:text-foreground transition-colors underline-offset-2 hover:underline" data-testid="link-privacy">Privacy</a>
          <span aria-hidden>·</span>
          <a href="/terms" className="hover:text-foreground transition-colors underline-offset-2 hover:underline" data-testid="link-terms">Terms</a>
          <span aria-hidden>·</span>
          <a href="mailto:support@pulsedesk.support" className="hover:text-foreground transition-colors underline-offset-2 hover:underline" data-testid="link-support">Support</a>
        </div>
        <div className="text-center">
          Built by{" "}
          <a
            href="https://shotgunninjas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:text-foreground transition-colors underline-offset-2 hover:underline"
            data-testid="link-shotgunninjas"
          >
            Shotgun Ninjas Productions
          </a>
        </div>
      </div>
    </div>
  );
}
