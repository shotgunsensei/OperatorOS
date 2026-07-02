import { useEffect } from "react";
import { useLocation } from "wouter";

const STORAGE_KEY = "td-mobile-redirect-dismissed";

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/**
 * Auto-redirect mobile UAs to /m on first authenticated load.
 * Respects user dismissal (stored in localStorage).
 */
export function useMobileRedirect(enabled: boolean) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (location.startsWith("/m")) return;
    if (location.startsWith("/portal")) return;
    if (location.startsWith("/login") || location.startsWith("/register")) return;

    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }

    if (isMobileUserAgent()) {
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {}
      setLocation("/m");
    }
  }, [enabled, location, setLocation]);
}

export function dismissMobileRedirect() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}
