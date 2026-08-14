import { upsertUser, hashPassword } from "./auth/authService";
import { storage } from "./storage";

export async function ensureDevSeed() {
  const bypass = process.env.DEV_AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";
  if (!bypass) return;

  const userId = process.env.DEV_USER_ID ?? "dev-user";
  const email = process.env.DEV_USER_EMAIL ?? "dev@localhost";
  const password = process.env.DEV_USER_PASSWORD ?? "DevPass1!";

  const passwordHash = await hashPassword(password);

  await upsertUser({
    id: userId,
    email,
    firstName: "Dev",
    lastName: "User",
    profileImageUrl: null,
    passwordHash,
  });

  const slug = process.env.DEV_TENANT_SLUG ?? "dev";
  let tenant = await storage.getTenantBySlug(slug);
  if (!tenant) {
    tenant = await storage.createTenant({
      name: "Dev Tenant",
      slug,
      plan: "free",
    });
  }

  const membership = await storage.getUserMembership(userId);
  if (!membership) {
    await storage.addMember(tenant.id, userId, "OWNER");
  }
}
