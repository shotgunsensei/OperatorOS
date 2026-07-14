import type { User } from "@workspace/db";

export type PlanId = "free" | "pro" | "agency";
export type ExportFormat = "txt" | "markdown" | "json";

export interface PlanLimits {
  monthlyKits: number | null; // null = unlimited
  brandProfiles: number | null;
  exportFormats: ExportFormat[];
  watermarkExports: boolean;
  adVariants: boolean;
  emailSmsSequences: boolean;
  clientWorkspaces: boolean;
  whiteLabel: boolean;
  teamAccess: boolean;
  commercialUseRights: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    monthlyKits: 2,
    brandProfiles: 0,
    exportFormats: ["txt"],
    watermarkExports: true,
    adVariants: false,
    emailSmsSequences: false,
    clientWorkspaces: false,
    whiteLabel: false,
    teamAccess: false,
    commercialUseRights: false,
  },
  pro: {
    monthlyKits: null,
    brandProfiles: 5,
    exportFormats: ["txt", "markdown", "json"],
    watermarkExports: false,
    adVariants: true,
    emailSmsSequences: true,
    clientWorkspaces: false,
    whiteLabel: false,
    teamAccess: false,
    commercialUseRights: false,
  },
  agency: {
    monthlyKits: null,
    brandProfiles: null,
    exportFormats: ["txt", "markdown", "json"],
    watermarkExports: false,
    adVariants: true,
    emailSmsSequences: true,
    clientWorkspaces: true,
    whiteLabel: true,
    teamAccess: true,
    commercialUseRights: true,
  },
};

export function planFor(user: Pick<User, "plan">): PlanLimits {
  const id = (user.plan as PlanId) ?? "free";
  return PLAN_LIMITS[id] ?? PLAN_LIMITS.free;
}

export function planIdFor(user: Pick<User, "plan">): PlanId {
  const id = user.plan as PlanId;
  return id === "pro" || id === "agency" ? id : "free";
}
