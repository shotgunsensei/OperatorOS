import { useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Smartphone, X, Share, PlusSquare } from "lucide-react";

const SESSION_KEY = "pwaInstallBannerDismissed";

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function PwaInstallBanner() {
  const { isInstallable, isIos, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState<boolean>(isDismissed);
  const [iosOpen, setIosOpen] = useState(false);

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
    }
    setDismissed(true);
  };

  if (!isInstallable || dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3"
      data-testid="pwa-install-banner"
    >
      <Smartphone className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          Add PulseDesk to your home screen
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
          Install the app for quick access from your phone or desktop
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isIos ? (
          <Popover open={iosOpen} onOpenChange={setIosOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                data-testid="button-pwa-install"
              >
                How to install
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" side="bottom" align="end">
              <p className="text-sm font-semibold mb-3">Add to Home Screen</p>
              <ol className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Share className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                  <span>Tap the <strong>Share</strong> button at the bottom of Safari</span>
                </li>
                <li className="flex items-start gap-2">
                  <PlusSquare className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                  <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                  <span>Tap <strong>Add</strong> to confirm — the app icon will appear on your home screen</span>
                </li>
              </ol>
            </PopoverContent>
          </Popover>
        ) : (
          <Button
            size="sm"
            variant="default"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
            onClick={promptInstall}
            data-testid="button-pwa-install"
          >
            Install app
          </Button>
        )}

        <button
          onClick={handleDismiss}
          className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors p-1 rounded"
          aria-label="Dismiss"
          data-testid="button-pwa-dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
