import crypto from "crypto";
import {
  db,
  usersTable,
  userProfilesTable,
  userEntitlementsTable,
  purchasesTable,
  type User,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";
import { logger } from "./logger";
import type { VerifiedSsoToken } from "./operatorOsSso";
import {
  deriveLocalRole,
  snapshotFromToken,
  type EntitlementSnapshot,
} from "./operatorOsRole";

const BOOTSTRAP_SUPER_ADMIN_EMAILS: ReadonlySet<string> = new Set(
  ["john@shotgunninjas.com"].map((e) => e.toLowerCase()),
);

function isBootstrapEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return BOOTSTRAP_SUPER_ADMIN_EMAILS.has(email.toLowerCase());
}

async function fetchClerkProfile(
  clerkId: string,
): Promise<{ email: string | null; displayName: string | null; avatarUrl: string | null }> {
  try {
    const u: any = await (clerkClient as any).users.getUser(clerkId);
    const primaryId = u?.primaryEmailAddressId;
    const emails: any[] = u?.emailAddresses || [];
    const primary = emails.find((e) => e?.id === primaryId) || emails[0];
    const email: string | null = primary?.emailAddress || null;
    const first = u?.firstName || "";
    const last = u?.lastName || "";
    const displayName: string | null =
      [first, last].filter(Boolean).join(" ").trim() ||
      u?.username ||
      email ||
      null;
    const avatarUrl: string | null = u?.imageUrl || null;
    return { email, displayName, avatarUrl };
  } catch (err) {
    logger.warn({ err }, "clerkClient.users.getUser failed");
    return { email: null, displayName: null, avatarUrl: null };
  }
}

/**
 * Ensure a users row exists for this Clerk session. Backfills email from Clerk
 * if missing. Bootstrap super-admin promotion happens ONLY on row creation
 * (or one-time backfill if an existing row's email becomes known for the first
 * time), so a super admin can later demote the bootstrap account without it
 * being re-promoted on the next request.
 */
export async function ensureUserRow(clerkId: string): Promise<User> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    let user = existing[0];
    if (!user.email) {
      const fetched = await fetchClerkProfile(clerkId);
      if (fetched.email) {
        const updates: Partial<User> = {
          email: fetched.email,
          updatedAt: new Date(),
        };
        if (!user.displayName && fetched.displayName) {
          updates.displayName = fetched.displayName;
        }
        if (!user.avatarUrl && fetched.avatarUrl) {
          updates.avatarUrl = fetched.avatarUrl;
        }
        // One-time bootstrap on the same call where we first learn the email,
        // but ONLY if the user has never been promoted before. This prevents
        // a manual demotion from being silently undone.
        if (
          isBootstrapEmail(fetched.email) &&
          !user.isAdmin &&
          !user.isSuperAdmin
        ) {
          updates.isAdmin = true;
          updates.isSuperAdmin = true;
          logger.info(
            { email: fetched.email, clerkId },
            "Bootstrapped super admin on email backfill",
          );
        }
        await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id));
        user = { ...user, ...updates } as User;
      }
    }
    return user;
  }

  // Race-safe insert: fetch identity, attempt insert ignoring duplicates on
  // clerk_id, then re-select. This handles the "two parallel requests for a
  // brand-new user" case without producing duplicate rows.
  const fetched = await fetchClerkProfile(clerkId);
  const id = crypto.randomUUID();
  const isBoot = isBootstrapEmail(fetched.email);
  await db
    .insert(usersTable)
    .values({
      id,
      clerkId,
      email: fetched.email,
      displayName: fetched.displayName || "Investigator",
      avatarUrl: fetched.avatarUrl,
      isAdmin: isBoot,
      isSuperAdmin: isBoot,
    })
    .onConflictDoNothing({ target: usersTable.clerkId });
  if (isBoot) {
    logger.info(
      { email: fetched.email, clerkId },
      "Bootstrapped super admin on first sign-in",
    );
  }
  const inserted = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);
  return inserted[0];
}

/**
 * Upsert a users row from a successfully verified + consumed OperatorOS SSO
 * token. Keyed on `operator_identity_id` (the JWT `sub`), which is unique.
 *
 * On every launch we refresh the descriptive fields (email, name, avatar,
 * plan/org/role, last launch time) so OperatorOS remains the source of truth
 * for identity. We do NOT touch Clerk fields — accounts that arrived via
 * Clerk and accounts that arrived via OperatorOS are independent rows; a
 * single human with both auth methods will today have two rows. Linking them
 * is intentionally left for a future "claim account" flow.
 *
 * Bootstrap super-admin promotion runs once on row creation, or once on the
 * first launch where we learn an email, mirroring `ensureUserRow`.
 */
export async function ensureOperatorOsUserRow(token: VerifiedSsoToken): Promise<User> {
  const now = new Date();
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.operatorIdentityId, token.sub))
    .limit(1);

  const snapshot = snapshotFromToken(token);
  const localRole = deriveLocalRole(snapshot);

  if (existing.length > 0) {
    const user = existing[0];
    const updates: Partial<User> = {
      operatorPlanSlug: token.planSlug ?? user.operatorPlanSlug ?? null,
      operatorOrganizationId: token.organizationId ?? user.operatorOrganizationId ?? null,
      operatorRole: token.role ?? user.operatorRole ?? null,
      operatorLastLaunchAt: now,
      operatorosTenantId: token.tenantId ?? user.operatorosTenantId ?? null,
      localRole,
      lastEntitlementSyncAt: now,
      entitlementSnapshotJson: snapshot,
      updatedAt: now,
    };
    if (token.email && token.email !== user.email) updates.email = token.email;
    if (token.name && !user.displayName) updates.displayName = token.name;
    if (token.avatarUrl && !user.avatarUrl) updates.avatarUrl = token.avatarUrl;
    if (
      !user.isAdmin &&
      !user.isSuperAdmin &&
      isBootstrapEmail(updates.email ?? user.email)
    ) {
      updates.isAdmin = true;
      updates.isSuperAdmin = true;
      logger.info(
        { email: updates.email ?? user.email, operatorIdentityId: token.sub },
        "Bootstrapped super admin on OperatorOS launch",
      );
    }
    await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id));
    return { ...user, ...updates } as User;
  }

  const id = crypto.randomUUID();
  const isBoot = isBootstrapEmail(token.email);
  await db
    .insert(usersTable)
    .values({
      id,
      operatorIdentityId: token.sub,
      email: token.email ?? null,
      displayName: token.name || token.email || "Investigator",
      avatarUrl: token.avatarUrl ?? null,
      operatorPlanSlug: token.planSlug ?? null,
      operatorOrganizationId: token.organizationId ?? null,
      operatorRole: token.role ?? null,
      operatorLastLaunchAt: now,
      operatorosTenantId: token.tenantId ?? null,
      localRole,
      lastEntitlementSyncAt: now,
      entitlementSnapshotJson: snapshot,
      isAdmin: isBoot,
      isSuperAdmin: isBoot,
    })
    .onConflictDoNothing({ target: usersTable.operatorIdentityId });
  if (isBoot) {
    logger.info(
      { email: token.email, operatorIdentityId: token.sub },
      "Bootstrapped super admin on first OperatorOS launch",
    );
  }
  const inserted = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.operatorIdentityId, token.sub))
    .limit(1);
  return inserted[0];
}

/**
 * Merge two `users` rows that turn out to represent the same human (e.g.
 * one created via Clerk sign-up, the other via OperatorOS SSO). The
 * `primary` row is kept; the `other` row is deleted after its identity
 * columns, profile, entitlements, and purchases are folded into the primary.
 *
 * Conflict policy (deliberately conservative — we'd rather over-keep than
 * silently drop a paid entitlement or progress):
 *   - Identity columns (clerk_id, operator_identity_id, stripe_customer_id,
 *     stripe_subscription_id, operator_*): primary wins unless null, in
 *     which case other's value is copied in.
 *   - Admin flags: OR'd together (linking should never demote).
 *   - user_profiles: if both rows have a profile, the one with the newer
 *     `lastActiveAt` becomes the kept profile; otherwise just move other's
 *     onto primary. Either way `other.user_profiles` is removed.
 *   - user_entitlements: every row reassigned to primary, except active
 *     duplicates keyed on (entitlement_type, product_id) which are dropped.
 *   - purchases: all reassigned to primary.
 *   - The `other` users row is deleted last (cascade FKs are already
 *     resolved manually above).
 *
 * Returns the refreshed primary row.
 */
export async function mergeUserRows(primary: User, other: User): Promise<User> {
  if (primary.id === other.id) return primary;

  const updates: Partial<User> = { updatedAt: new Date() };
  if (!primary.clerkId && other.clerkId) updates.clerkId = other.clerkId;
  if (!primary.operatorIdentityId && other.operatorIdentityId)
    updates.operatorIdentityId = other.operatorIdentityId;
  if (!primary.email && other.email) updates.email = other.email;
  if (!primary.displayName && other.displayName)
    updates.displayName = other.displayName;
  if (!primary.avatarUrl && other.avatarUrl) updates.avatarUrl = other.avatarUrl;
  if (!primary.stripeCustomerId && other.stripeCustomerId)
    updates.stripeCustomerId = other.stripeCustomerId;
  if (!primary.stripeSubscriptionId && other.stripeSubscriptionId)
    updates.stripeSubscriptionId = other.stripeSubscriptionId;
  if (other.isAdmin) updates.isAdmin = true;
  if (other.isSuperAdmin) updates.isSuperAdmin = true;
  if (!primary.operatorPlanSlug && other.operatorPlanSlug)
    updates.operatorPlanSlug = other.operatorPlanSlug;
  if (!primary.operatorOrganizationId && other.operatorOrganizationId)
    updates.operatorOrganizationId = other.operatorOrganizationId;
  if (!primary.operatorRole && other.operatorRole)
    updates.operatorRole = other.operatorRole;
  if (
    other.operatorLastLaunchAt &&
    (!primary.operatorLastLaunchAt ||
      other.operatorLastLaunchAt > primary.operatorLastLaunchAt)
  ) {
    updates.operatorLastLaunchAt = other.operatorLastLaunchAt;
  }
  if (!primary.operatorosTenantId && other.operatorosTenantId)
    updates.operatorosTenantId = other.operatorosTenantId;
  // Snapshot, localRole and lastEntitlementSyncAt move as a unit. Pick whichever
  // row has the newer sync timestamp so that authz state can never silently
  // regress to an older view after a link.
  const primarySyncMs = primary.lastEntitlementSyncAt?.getTime() ?? 0;
  const otherSyncMs = other.lastEntitlementSyncAt?.getTime() ?? 0;
  const otherSnap = other.entitlementSnapshotJson;
  if (otherSnap && otherSyncMs >= primarySyncMs) {
    updates.entitlementSnapshotJson = otherSnap;
    updates.lastEntitlementSyncAt =
      other.lastEntitlementSyncAt ?? primary.lastEntitlementSyncAt ?? null;
    if (other.localRole) updates.localRole = other.localRole;
  } else if (!primary.entitlementSnapshotJson && otherSnap) {
    // Primary has nothing; even an older snapshot is better than none.
    updates.entitlementSnapshotJson = otherSnap;
    updates.lastEntitlementSyncAt = other.lastEntitlementSyncAt ?? null;
    if (other.localRole && !primary.localRole) updates.localRole = other.localRole;
  }
  if (!primary.localRole && other.localRole && updates.localRole === undefined) {
    updates.localRole = other.localRole;
  }

  await db.transaction(async (tx) => {
    // Clear unique identity columns on `other` first to avoid violating the
    // unique constraints when we copy them onto `primary`.
    await tx
      .update(usersTable)
      .set({ clerkId: null, operatorIdentityId: null })
      .where(eq(usersTable.id, other.id));

    const primaryProfileRows = await tx
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, primary.id))
      .limit(1);
    const otherProfileRows = await tx
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, other.id))
      .limit(1);
    if (otherProfileRows.length > 0) {
      if (primaryProfileRows.length === 0) {
        await tx
          .update(userProfilesTable)
          .set({ userId: primary.id })
          .where(eq(userProfilesTable.userId, other.id));
      } else {
        const pData = primaryProfileRows[0].profileData as
          | { lastActiveAt?: number }
          | null;
        const oData = otherProfileRows[0].profileData as
          | { lastActiveAt?: number }
          | null;
        const pLast = pData?.lastActiveAt ?? 0;
        const oLast = oData?.lastActiveAt ?? 0;
        if (oLast > pLast) {
          await tx
            .update(userProfilesTable)
            .set({
              profileData: otherProfileRows[0].profileData,
              caseStates: otherProfileRows[0].caseStates,
              settings: otherProfileRows[0].settings,
              updatedAt: new Date(),
            })
            .where(eq(userProfilesTable.userId, primary.id));
        }
        await tx
          .delete(userProfilesTable)
          .where(eq(userProfilesTable.userId, other.id));
      }
    }

    const primaryEnts = await tx
      .select()
      .from(userEntitlementsTable)
      .where(eq(userEntitlementsTable.userId, primary.id));
    const activePrimaryKeys = new Set(
      primaryEnts
        .filter((e) => e.isActive)
        .map((e) => `${e.entitlementType}::${e.productId}`),
    );
    const otherEnts = await tx
      .select()
      .from(userEntitlementsTable)
      .where(eq(userEntitlementsTable.userId, other.id));
    for (const ent of otherEnts) {
      const key = `${ent.entitlementType}::${ent.productId}`;
      if (ent.isActive && activePrimaryKeys.has(key)) {
        await tx
          .delete(userEntitlementsTable)
          .where(eq(userEntitlementsTable.id, ent.id));
      } else {
        await tx
          .update(userEntitlementsTable)
          .set({ userId: primary.id })
          .where(eq(userEntitlementsTable.id, ent.id));
      }
    }

    await tx
      .update(purchasesTable)
      .set({ userId: primary.id })
      .where(eq(purchasesTable.userId, other.id));

    await tx
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, primary.id));

    await tx.delete(usersTable).where(eq(usersTable.id, other.id));
  });

  logger.info(
    { primaryId: primary.id, mergedId: other.id },
    "Merged duplicate user rows",
  );

  const refreshed = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, primary.id))
    .limit(1);
  return refreshed[0];
}

/**
 * Resolve the local user row corresponding to the Clerk session present on
 * this request, if any. Unlike `resolveUser` in the auth middleware, this
 * helper IGNORES any local session cookie — it strictly returns the Clerk
 * side of the request. Useful for account-linking endpoints, where the
 * request may carry both an OperatorOS session cookie AND a Clerk session.
 */
/**
 * Persist a freshly-computed entitlement snapshot for an OperatorOS user.
 * Recomputes `localRole` and stamps `lastEntitlementSyncAt`. Used by the
 * `/api/operatoros/entitlements/sync` push endpoint when the parent app
 * needs to flip entitlements out-of-band (subscription cancelled, module
 * disabled, plan upgraded, etc.).
 */
export async function applyEntitlementSnapshot(
  user: User,
  snapshot: EntitlementSnapshot,
): Promise<User> {
  const now = new Date();
  const localRole = deriveLocalRole(snapshot);
  const updates: Partial<User> = {
    entitlementSnapshotJson: snapshot,
    localRole,
    lastEntitlementSyncAt: now,
    operatorPlanSlug: snapshot.planSlug ?? user.operatorPlanSlug ?? null,
    updatedAt: now,
  };
  await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id));
  return { ...user, ...updates } as User;
}

export async function resolveClerkUserFromRequest(
  req: Request,
): Promise<User | null> {
  const auth = getAuth(req);
  const clerkId: string | undefined =
    (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || undefined;
  if (!clerkId) return null;
  return await ensureUserRow(clerkId);
}
