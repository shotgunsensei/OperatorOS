import { useState, useEffect } from "react";
import { Download, X, Share, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import pulsedeskLogo from "@assets/pulsedesklogo_1775753913991.png";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) {
      setIsInstalled(true);
      return;
    }

    const dismissedAt = localStorage.getItem("pwa-install-dismissed");
    if (dismissedAt) {
      const hoursSince = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60);
      if (hoursSince < 72) {
        setDismissed(true);
        return;
      }
    }

    if (isIos()) {
      setShowIosPrompt(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
    } catch {
      // prompt failed or was already used
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
  };

  if (isInstalled || dismissed) return null;
  if (!deferredPrompt && !showIosPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300" data-testid="pwa-install-prompt">
      <div className="rounded-xl border bg-card shadow-lg p-4">
        <div className="flex items-start gap-3">
          <img src={pulsedeskLogo} alt="PulseDesk" className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Install PulseDesk</p>
            {showIosPrompt ? (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Tap <Share className="inline h-3 w-3 mx-0.5 -mt-0.5" /> Share, then <ArrowUp className="inline h-3 w-3 mx-0.5 -mt-0.5 rotate-90" /> "Add to Home Screen" for the full app experience.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Add to your home screen for quick access, offline support, and a native app experience.
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 -mt-0.5"
            data-testid="button-dismiss-install"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!showIosPrompt && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="flex-1 gap-1.5" onClick={handleInstall} data-testid="button-install-app">
              <Download className="h-3.5 w-3.5" />
              Install App
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss} className="text-xs text-muted-foreground">
              Not now
            </Button>
          </div>
        )}
        {showIosPrompt && (
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="ghost" onClick={handleDismiss} className="text-xs text-muted-foreground">
              Got it
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
