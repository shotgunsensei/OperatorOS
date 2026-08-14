const DEFAULT_MASTER_ADMIN_EMAIL = "john@shotgunninjas.com";

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function getMasterAdminEmails(): string[] {
  const configured = (process.env.PULSEDESK_MASTER_ADMIN_EMAIL ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  return Array.from(new Set([DEFAULT_MASTER_ADMIN_EMAIL, ...configured].map(normalizeEmail)));
}

export function isMasterAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && getMasterAdminEmails().includes(normalized);
}

export function isDemoSeedsEnabled(): boolean {
  return process.env.ENABLE_DEMO_SEEDS === "true";
}

export function isLocalReviewerEnabled(): boolean {
  return process.env.ENABLE_LOCAL_REVIEWER === "true";
}
