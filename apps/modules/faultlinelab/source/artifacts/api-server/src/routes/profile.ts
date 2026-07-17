import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getCatalogOverridesVersion,
  loadCatalogOverridesPayload,
  onCatalogOverridesChanged,
} from "../lib/catalogEvents";
import { computeEntitlementsPayload } from "../lib/entitlementsPayload";
import type { User } from "@workspace/db";
import { clearSessionCookie } from "../lib/sessionCookie";

const router = Router();

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;

    const profile = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);
    if (profile.length === 0) {
      return res.json({ profile: null, settings: null, caseStates: null });
    }

    return res.json({
      profile: profile[0].profileData,
      settings: profile[0].settings,
      caseStates: profile[0].caseStates,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/profile", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const { profile, settings, caseStates } = req.body;

    const existing = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(userProfilesTable).values({
        userId,
        profileData: profile,
        caseStates: caseStates || {},
        settings: settings || { soundEnabled: false, animationsEnabled: true, terminalFontSize: 14 },
      });
    } else {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (profile) updates.profileData = profile;
      if (settings) updates.settings = settings;
      if (caseStates) updates.caseStates = caseStates;

      await db.update(userProfilesTable)
        .set(updates)
        .where(eq(userProfilesTable.userId, userId));
    }

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/entitlements", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const payload = await computeEntitlementsPayload(userId);
    return res.json(payload);
  } catch (err) {
    req.log.error({ err }, "Failed to load entitlements");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * `/api/me` exposes the minimal identity payload the SPA needs in order to
 * decide between guest mode and signed-in mode when the auth source is
 * server-issued (OperatorOS SSO cookie). Clerk-driven sessions normally
 * surface user data via the Clerk frontend SDK; this endpoint is the
 * cookie-only path's equivalent and is also safe to call for Clerk users.
 */
router.get("/me", requireAuth, async (req, res) => {
  const user = (req as any).appUser as User;
  const snap = user.entitlementSnapshotJson ?? null;
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isAdmin: !!user.isAdmin,
      isSuperAdmin: !!user.isSuperAdmin,
      authSource: user.operatorIdentityId ? "operatoros" : user.clerkId ? "clerk" : "unknown",
      localRole: user.localRole ?? null,
      operator: user.operatorIdentityId
        ? {
            planSlug: user.operatorPlanSlug,
            organizationId: user.operatorOrganizationId,
            tenantId: user.operatorosTenantId ?? null,
            role: user.operatorRole,
            moduleRole: snap?.moduleRole ?? null,
            tenantRole: snap?.tenantRole ?? null,
            accessLevel: snap?.accessLevel ?? null,
            moduleEnabled: snap?.moduleEnabled ?? true,
            subscriptionStatus: snap?.subscriptionStatus ?? null,
            features: snap?.features ?? [],
            lastLaunchAt: user.operatorLastLaunchAt?.toISOString?.() ?? null,
            lastEntitlementSyncAt:
              user.lastEntitlementSyncAt?.toISOString?.() ?? null,
          }
        : null,
    },
  });
});

/**
 * Clears the local SSO session cookie. Idempotent — always returns 200.
 * Does not touch Clerk; Clerk-driven sign-out is handled by the Clerk SDK
 * on the client. We intentionally do not call back to OperatorOS — the
 * remote session lives on the OperatorOS shell, not in our app.
 */
router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true });
});

router.get("/catalog/overrides", async (req, res) => {
  try {
    const payload = await loadCatalogOverridesPayload();
    return res.json(payload);
  } catch (err) {
    req.log.error({ err }, "Failed to load public catalog overrides");
    return res.json({ overrides: [], version: getCatalogOverridesVersion() });
  }
});

router.get("/catalog/overrides/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const write = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  res.write("retry: 5000\n\n");

  try {
    const initial = await loadCatalogOverridesPayload();
    write("overrides", initial);
  } catch (err) {
    req.log.warn({ err }, "SSE initial overrides load failed");
  }

  let lastSentVersion = getCatalogOverridesVersion();
  const unsubscribe = onCatalogOverridesChanged(async (version) => {
    if (version === lastSentVersion) return;
    try {
      const payload = await loadCatalogOverridesPayload();
      lastSentVersion = payload.version;
      write("overrides", payload);
    } catch (err) {
      req.log.warn({ err }, "SSE overrides push failed");
    }
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    try {
      res.end();
    } catch {}
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

export default router;
