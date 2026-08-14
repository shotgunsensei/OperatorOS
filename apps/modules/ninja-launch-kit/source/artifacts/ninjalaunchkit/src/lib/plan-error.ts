import { toast } from "sonner";

interface PlanErrorData {
  error?: string;
  message?: string;
  code?: string;
  currentPlan?: string;
}

export function isPlanLimitError(err: unknown): err is { status: 402; data: PlanErrorData } {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; data?: { error?: unknown } };
  return e.status === 402 && Boolean(e.data && (e.data as PlanErrorData).error === "PLAN_LIMIT_EXCEEDED");
}

/**
 * Returns true if the error was handled as a plan limit (and a toast was shown).
 * Caller should still bail out of any further error handling.
 */
export function handlePlanLimitError(
  err: unknown,
  navigateToPricing: () => void,
): boolean {
  if (!isPlanLimitError(err)) return false;
  const data = err.data;
  toast.error("Plan limit reached", {
    description: data.message ?? "Upgrade your plan to unlock this feature.",
    action: {
      label: "Upgrade",
      onClick: navigateToPricing,
    },
    duration: 8000,
  });
  return true;
}
