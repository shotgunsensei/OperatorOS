import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface SafariNavigator extends Navigator {
  standalone?: boolean;
}

declare global {
  interface Window {
    __pwaInstallPrompt: BeforeInstallPromptEvent | null;
  }
}

interface UsePwaInstallResult {
  isInstallable: boolean;
  isIos: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<void>;
}

function getEarlyPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  const p = window.__pwaInstallPrompt ?? null;
  return p;
}

export function usePwaInstall(): UsePwaInstallResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(getEarlyPrompt);

  const isIos =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !("MSStream" in window);

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as SafariNavigator).standalone === true);

  useEffect(() => {
    // Pick up the event if it was already captured before React mounted
    if (window.__pwaInstallPrompt && !deferredPrompt) {
      setDeferredPrompt(window.__pwaInstallPrompt);
    }

    // Also listen for future firings (e.g. on subsequent navigations)
    const handler = (e: Event) => {
      e.preventDefault();
      const bip = e as BeforeInstallPromptEvent;
      window.__pwaInstallPrompt = bip;
      setDeferredPrompt(bip);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    window.__pwaInstallPrompt = null;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      sessionStorage.setItem("pwaInstallBannerDismissed", "true");
    }
  };

  const isInstallable = !isStandalone && (!!deferredPrompt || isIos);

  return { isInstallable, isIos, isStandalone, promptInstall };
}
