import { Info } from "lucide-react";

export function DemoBanner() {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";
  if (!isDemoMode) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/40 px-4 py-1.5 flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 text-xs" data-testid="banner-demo">
      <Info className="h-3.5 w-3.5" />
      <span className="font-medium">Demo Environment</span>
      <span className="text-amber-600/70 dark:text-amber-400/70">— Sample data is pre-loaded for evaluation purposes</span>
    </div>
  );
}
