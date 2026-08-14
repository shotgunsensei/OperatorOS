import type { User } from "@workspace/db";

export type PlanName = "free" | "pro" | "tutor";

export interface PlanLimits {
  maxStudySets: number | null;
  maxFlashcardsPerSet: number | null;
  maxQuizAttemptsPerMonth: number | null;
  examCountdowns: boolean;
  advancedExports: boolean;
  spacedRepetition: boolean;
  tutorGroups: boolean;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxStudySets: 3,
    maxFlashcardsPerSet: 25,
    maxQuizAttemptsPerMonth: 3,
    examCountdowns: false,
    advancedExports: false,
    spacedRepetition: false,
    tutorGroups: false,
  },
  pro: {
    maxStudySets: null,
    maxFlashcardsPerSet: null,
    maxQuizAttemptsPerMonth: null,
    examCountdowns: true,
    advancedExports: true,
    spacedRepetition: true,
    tutorGroups: false,
  },
  tutor: {
    maxStudySets: null,
    maxFlashcardsPerSet: null,
    maxQuizAttemptsPerMonth: null,
    examCountdowns: true,
    advancedExports: true,
    spacedRepetition: true,
    tutorGroups: true,
  },
};

export function planOf(user: User): PlanName {
  const p = (user.plan ?? "free") as PlanName;
  return p === "pro" || p === "tutor" ? p : "free";
}

export function limitsFor(user: User): PlanLimits {
  return PLAN_LIMITS[planOf(user)];
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function limitErrorBody(feature: string, currentPlan: PlanName, upgradeTo: PlanName, message: string) {
  return {
    error: message,
    limitReached: true,
    feature,
    currentPlan,
    upgradeTo,
  };
}
