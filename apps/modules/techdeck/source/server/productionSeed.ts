import { db } from "./db";
import { tenants, pendingInvitations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function ensureProductionSetup() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  try {
    console.log("[setup] OperatorOS owns production super-admin bootstrap; local admin seed skipped");
    await ensureXodusLegacyTenant();
    await ensurePendingInvitation("Xodus Technology Professionals", "rbest@xodus-is.com", "TECH");
    console.log("[setup] Production setup checks complete");
  } catch (err) {
    console.error("[setup] Production setup error (non-fatal):", err);
  }
}

async function ensureXodusLegacyTenant() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.name, "Xodus Technology Professionals"));
  if (!tenant) return;

  console.log("[setup] Xodus tenant exists. Local plan/subscription repair skipped; OperatorOS owns entitlements.");
}

async function ensurePendingInvitation(tenantName: string, email: string, role: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.name, tenantName));
  if (!tenant) return;

  const [existing] = await db
    .select()
    .from(pendingInvitations)
    .where(
      and(eq(pendingInvitations.tenantId, tenant.id), eq(pendingInvitations.email, email.toLowerCase()))
    );

  if (!existing) {
    await db.insert(pendingInvitations).values({
      tenantId: tenant.id,
      email: email.toLowerCase(),
      role: role as any,
    });
    console.log(`[setup] Added pending invitation for ${email} to ${tenantName}`);
  }
}
