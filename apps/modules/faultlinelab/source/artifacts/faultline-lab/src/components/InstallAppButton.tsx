import { useEffect, useState, useCallback } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'faultline:install-dismissed-at';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  if (document.referrer.startsWith('android-app://')) return true;
  return false;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isIpadOs =
    navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return isIosDevice || isIpadOs;
}

function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function InstallAppButton() {
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => recentlyDismissed());

  useEffect(() => {
    if (installed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    mql?.addEventListener?.('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mql?.removeEventListener?.('change', onDisplayChange);
    };
  }, [installed]);

  const handleClick = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalled(true);
        }
        setDeferredPrompt(null);
      } catch {
        setDeferredPrompt(null);
      }
      return;
    }
    if (isIos() && isSafari()) {
      setShowIosSheet(true);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  }, []);

  if (installed) return null;
  if (dismissed && !showIosSheet) return null;

  const canPrompt = !!deferredPrompt;
  const iosFallback = !canPrompt && isIos() && isSafari();

  if (!canPrompt && !iosFallback) return null;

  return (
    <>
      <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-cyan-500/40 bg-zinc-950/95 px-3 py-2 shadow-lg shadow-cyan-500/10 backdrop-blur"
        data-testid="install-app-button"
      >
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-cyan-300 transition-colors hover:text-cyan-200"
        >
          <Download size={14} />
          <span>Install Faultline Lab</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          data-testid="install-app-dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {showIosSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setShowIosSheet(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-cyan-500/40 bg-zinc-950 p-5 font-mono text-sm text-zinc-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-cyan-300 uppercase tracking-wider text-xs">Install on iOS</h2>
              <button
                type="button"
                onClick={() => setShowIosSheet(false)}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <ol className="space-y-3 text-zinc-300">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/40 text-[10px] text-cyan-300">
                  1
                </span>
                <span className="flex-1">
                  Tap the <Share size={14} className="inline -mt-1 mx-1 text-cyan-300" /> Share icon in
                  Safari&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/40 text-[10px] text-cyan-300">
                  2
                </span>
                <span className="flex-1">
                  Choose <span className="text-cyan-300">Add to Home Screen</span>{' '}
                  <Plus size={14} className="inline -mt-1 mx-1 text-cyan-300" />.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/40 text-[10px] text-cyan-300">
                  3
                </span>
                <span className="flex-1">
                  Tap <span className="text-cyan-300">Add</span>. Faultline Lab will launch from your home
                  screen like a native app.
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
