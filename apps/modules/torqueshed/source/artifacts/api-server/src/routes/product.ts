import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { Router } from "express";
import {
  attachments,
  auditEvents,
  buildStages,
  buildTasks,
  communityComments,
  communityFollows,
  communityPosts,
  communityReactions,
  communityReports,
  db,
  diagnosticEntries,
  diagnosticSessions,
  diagnosticTemplates,
  diagnosticTroubleCodes,
  marketplaceFavorites,
  marketplaceListings,
  marketplaceMessages,
  marketplaceReports,
  projectBuilds,
  serviceReminders,
  tokenLedgerEntries,
  tokenPurchases,
  torqueshedUsers,
  torqueAssistRequests,
  vehicleProfiles,
  vehicleRecords,
  vehicles,
  vendors,
} from "@workspace/db";
import {
  asyncRoute,
  HttpError,
  numberValue,
  recordValue,
  requireUser,
  stringValue,
} from "../lib/http";
import { runTorqueAssist } from "../services/torque-assist";
import { tokenBalance } from "../services/token-balance";

const router = Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const assistRate = new Map<string, { count: number; resetAt: number }>();

function uuidValue(value: unknown, field: string): string {
  const parsed = stringValue(value, field, { max: 36 });
  if (!parsed || !uuidPattern.test(parsed)) throw new HttpError(400, "invalid_request", `${field} must be a UUID.`);
  return parsed;
}

function dateValue(value: unknown, field: string, optional = false): Date | null {
  if ((value == null || value === "") && optional) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "invalid_request", `${field} must be a valid date.`);
  return parsed;
}

function optionalString(value: unknown, field: string, max = 500): string | null {
  return stringValue(value, field, { optional: true, max });
}

async function ownedVehicle(user: Awaited<ReturnType<typeof requireUser>>, vehicleId: string) {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.ownerUserId, user.id),
        eq(vehicles.tenantId, user.tenantId),
      ),
    )
    .limit(1);
  if (!vehicle) throw new HttpError(404, "vehicle_not_found", "Vehicle not found.");
  return vehicle;
}

async function ownedDiagnostic(user: Awaited<ReturnType<typeof requireUser>>, sessionId: string) {
  const [session] = await db
    .select()
    .from(diagnosticSessions)
    .where(
      and(
        eq(diagnosticSessions.id, sessionId),
        eq(diagnosticSessions.ownerUserId, user.id),
        eq(diagnosticSessions.tenantId, user.tenantId),
      ),
    )
    .limit(1);
  if (!session) throw new HttpError(404, "diagnostic_not_found", "Diagnostic session not found.");
  return session;
}

async function ownedBuild(user: Awaited<ReturnType<typeof requireUser>>, buildId: string) {
  const [build] = await db
    .select()
    .from(projectBuilds)
    .where(and(eq(projectBuilds.id, buildId), eq(projectBuilds.ownerUserId, user.id), eq(projectBuilds.tenantId, user.tenantId)))
    .limit(1);
  if (!build) throw new HttpError(404, "build_not_found", "Build not found.");
  return build;
}

async function tenantPost(user: Awaited<ReturnType<typeof requireUser>>, postId: string) {
  const [post] = await db
    .select()
    .from(communityPosts)
    .where(and(eq(communityPosts.id, postId), eq(communityPosts.tenantId, user.tenantId), eq(communityPosts.status, "published")))
    .limit(1);
  if (!post) throw new HttpError(404, "post_not_found", "Post not found.");
  return post;
}

async function tenantListing(user: Awaited<ReturnType<typeof requireUser>>, listingId: string) {
  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(
      and(
        eq(marketplaceListings.id, listingId),
        eq(marketplaceListings.tenantId, user.tenantId),
        eq(marketplaceListings.status, "published"),
        or(isNull(marketplaceListings.expiresAt), gt(marketplaceListings.expiresAt, new Date())),
      ),
    )
    .limit(1);
  if (!listing) throw new HttpError(404, "listing_not_found", "Listing not found.");
  return listing;
}

function allowAssist(userId: string) {
  const now = Date.now();
  const current = assistRate.get(userId);
  if (!current || current.resetAt <= now) {
    assistRate.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

router.get(
  "/dashboard",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const [garage, diagnostics, posts, listings, balance] = await Promise.all([
      db.select().from(vehicles).where(and(eq(vehicles.ownerUserId, user.id), eq(vehicles.tenantId, user.tenantId))).orderBy(desc(vehicles.updatedAt)).limit(20),
      db.select().from(diagnosticSessions).where(and(eq(diagnosticSessions.ownerUserId, user.id), eq(diagnosticSessions.tenantId, user.tenantId))).orderBy(desc(diagnosticSessions.updatedAt)).limit(10),
      db.select().from(communityPosts).where(and(eq(communityPosts.tenantId, user.tenantId), eq(communityPosts.status, "published"))).orderBy(desc(communityPosts.createdAt)).limit(20),
      db.select().from(marketplaceListings).where(and(eq(marketplaceListings.tenantId, user.tenantId), eq(marketplaceListings.status, "published"))).orderBy(desc(marketplaceListings.createdAt)).limit(20),
      tokenBalance(db, user),
    ]);
    return response.json({ vehicles: garage, diagnostics, posts, listings, tokens: balance });
  }),
);

router.get(
  "/vehicles",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const rows = await db
      .select({ vehicle: vehicles, profile: vehicleProfiles })
      .from(vehicles)
      .leftJoin(vehicleProfiles, eq(vehicleProfiles.vehicleId, vehicles.id))
      .where(and(eq(vehicles.ownerUserId, user.id), eq(vehicles.tenantId, user.tenantId)))
      .orderBy(desc(vehicles.updatedAt));
    return response.json({ vehicles: rows });
  }),
);

router.post(
  "/vehicles",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const year = numberValue(request.body?.year, "year", { min: 1886, max: new Date().getFullYear() + 2 });
    const [vehicle] = await db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(vehicles)
        .values({
          tenantId: user.tenantId,
          ownerUserId: user.id,
          vin: optionalString(request.body?.vin, "vin", 17)?.toUpperCase() ?? null,
          year: year!,
          make: stringValue(request.body?.make, "make", { max: 80 })!,
          model: stringValue(request.body?.model, "model", { max: 80 })!,
          trim: optionalString(request.body?.trim, "trim", 80),
          engine: optionalString(request.body?.engine, "engine", 120),
          transmission: optionalString(request.body?.transmission, "transmission", 120),
          drivetrain: optionalString(request.body?.drivetrain, "drivetrain", 80),
          mileage: numberValue(request.body?.mileage, "mileage", { min: 0, max: 10_000_000, optional: true }),
          nickname: optionalString(request.body?.nickname, "nickname", 80),
          visibility: "private",
        })
        .returning();
      if (!created) throw new Error("Failed to create vehicle");
      await transaction.insert(vehicleProfiles).values({
        vehicleId: created.id,
        summary: optionalString(request.body?.summary, "summary", 2_000) ?? "",
        specifications: recordValue(request.body?.specifications, "specifications"),
      });
      await transaction.insert(auditEvents).values({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: created.id,
      });
      return [created];
    });
    return response.status(201).json({ vehicle });
  }),
);

router.get(
  "/vehicles/:vehicleId",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicle = await ownedVehicle(user, uuidValue(request.params.vehicleId, "vehicleId"));
    const [profile, records, reminders, builds, diagnostics, media] = await Promise.all([
      db.query.vehicleProfiles.findFirst({ where: eq(vehicleProfiles.vehicleId, vehicle.id) }),
      db.select().from(vehicleRecords).where(eq(vehicleRecords.vehicleId, vehicle.id)).orderBy(desc(vehicleRecords.performedAt)),
      db.select().from(serviceReminders).where(eq(serviceReminders.vehicleId, vehicle.id)).orderBy(serviceReminders.dueAt),
      db.select().from(projectBuilds).where(and(eq(projectBuilds.vehicleId, vehicle.id), eq(projectBuilds.ownerUserId, user.id))).orderBy(desc(projectBuilds.updatedAt)),
      db.select().from(diagnosticSessions).where(and(eq(diagnosticSessions.vehicleId, vehicle.id), eq(diagnosticSessions.ownerUserId, user.id))).orderBy(desc(diagnosticSessions.updatedAt)),
      db.select().from(attachments).where(and(eq(attachments.tenantId, user.tenantId), eq(attachments.entityType, "vehicle"), eq(attachments.entityId, vehicle.id))).orderBy(desc(attachments.createdAt)),
    ]);
    return response.json({ vehicle, profile, records, reminders, builds, diagnostics, attachments: media });
  }),
);

router.patch(
  "/vehicles/:vehicleId",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = uuidValue(request.params.vehicleId, "vehicleId");
    await ownedVehicle(user, vehicleId);
    const updates: Partial<typeof vehicles.$inferInsert> = { updatedAt: new Date() };
    if (request.body?.year != null) updates.year = numberValue(request.body.year, "year", { min: 1886, max: new Date().getFullYear() + 2 })!;
    for (const field of ["make", "model"] as const) {
      if (field in request.body) updates[field] = stringValue(request.body[field], field, { max: 120 })!;
    }
    for (const field of ["trim", "engine", "transmission", "drivetrain", "nickname"] as const) {
      if (field in request.body) updates[field] = optionalString(request.body[field], field, 120);
    }
    if (request.body?.mileage != null) updates.mileage = numberValue(request.body.mileage, "mileage", { min: 0, max: 10_000_000 });
    const [vehicle] = await db.update(vehicles).set(updates).where(eq(vehicles.id, vehicleId)).returning();
    return response.json({ vehicle });
  }),
);

router.get(
  "/vehicles/:vehicleId/records",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = uuidValue(request.params.vehicleId, "vehicleId");
    await ownedVehicle(user, vehicleId);
    const records = await db.select().from(vehicleRecords).where(eq(vehicleRecords.vehicleId, vehicleId)).orderBy(desc(vehicleRecords.performedAt));
    return response.json({ records });
  }),
);

router.post(
  "/vehicles/:vehicleId/records",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = uuidValue(request.params.vehicleId, "vehicleId");
    const vehicle = await ownedVehicle(user, vehicleId);
    const kind = stringValue(request.body?.kind, "kind", { max: 30 })!.toLowerCase();
    if (!new Set(["maintenance", "repair", "modification", "mileage", "inspection"]).has(kind)) {
      throw new HttpError(400, "invalid_record_kind", "Unsupported vehicle record kind.");
    }
    const mileage = numberValue(request.body?.mileage, "mileage", { min: 0, max: 10_000_000, optional: true });
    const [record] = await db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(vehicleRecords)
        .values({
          tenantId: user.tenantId,
          ownerUserId: user.id,
          vehicleId,
          vendorId: request.body?.vendorId ? uuidValue(request.body.vendorId, "vendorId") : null,
          kind,
          title: stringValue(request.body?.title, "title", { max: 160 })!,
          description: optionalString(request.body?.description, "description", 10_000) ?? "",
          mileage,
          costCents: numberValue(request.body?.costCents, "costCents", { min: 0, max: 100_000_000, optional: true }),
          laborMinutes: numberValue(request.body?.laborMinutes, "laborMinutes", { min: 0, max: 100_000, optional: true }),
          parts: Array.isArray(request.body?.parts) ? request.body.parts.slice(0, 200) : [],
          performedAt: dateValue(request.body?.performedAt ?? new Date(), "performedAt")!,
        })
        .returning();
      if (mileage != null && (vehicle.mileage == null || mileage > vehicle.mileage)) {
        await transaction.update(vehicles).set({ mileage, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
      } else {
        await transaction.update(vehicles).set({ updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
      }
      return [created];
    });
    return response.status(201).json({ record });
  }),
);

router.post(
  "/vehicles/:vehicleId/reminders",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = uuidValue(request.params.vehicleId, "vehicleId");
    await ownedVehicle(user, vehicleId);
    const [reminder] = await db.insert(serviceReminders).values({
      tenantId: user.tenantId,
      ownerUserId: user.id,
      vehicleId,
      title: stringValue(request.body?.title, "title", { max: 160 })!,
      dueAt: dateValue(request.body?.dueAt, "dueAt", true),
      dueMileage: numberValue(request.body?.dueMileage, "dueMileage", { min: 0, max: 10_000_000, optional: true }),
    }).returning();
    return response.status(201).json({ reminder });
  }),
);

router.get(
  "/diagnostics",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const sessions = await db.select().from(diagnosticSessions).where(and(eq(diagnosticSessions.ownerUserId, user.id), eq(diagnosticSessions.tenantId, user.tenantId))).orderBy(desc(diagnosticSessions.updatedAt));
    return response.json({ sessions });
  }),
);

router.post(
  "/diagnostics",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = uuidValue(request.body?.vehicleId, "vehicleId");
    await ownedVehicle(user, vehicleId);
    const [session] = await db.insert(diagnosticSessions).values({
      tenantId: user.tenantId,
      ownerUserId: user.id,
      vehicleId,
      title: stringValue(request.body?.title, "title", { max: 160 })!,
      customerConcern: stringValue(request.body?.customerConcern, "customerConcern", { max: 5_000 })!,
      symptoms: optionalString(request.body?.symptoms, "symptoms", 10_000) ?? "",
      conditions: recordValue(request.body?.conditions, "conditions"),
      freezeFrame: recordValue(request.body?.freezeFrame, "freezeFrame"),
    }).returning();
    return response.status(201).json({ session });
  }),
);

router.get(
  "/diagnostics/:sessionId",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const session = await ownedDiagnostic(user, uuidValue(request.params.sessionId, "sessionId"));
    const [codes, entries, analyses, media] = await Promise.all([
      db.select().from(diagnosticTroubleCodes).where(eq(diagnosticTroubleCodes.sessionId, session.id)).orderBy(diagnosticTroubleCodes.createdAt),
      db.select().from(diagnosticEntries).where(eq(diagnosticEntries.sessionId, session.id)).orderBy(diagnosticEntries.observedAt),
      db.select().from(torqueAssistRequests).where(and(eq(torqueAssistRequests.diagnosticSessionId, session.id), eq(torqueAssistRequests.ownerUserId, user.id))).orderBy(desc(torqueAssistRequests.createdAt)),
      db.select().from(attachments).where(and(eq(attachments.tenantId, user.tenantId), eq(attachments.entityType, "diagnostic"), eq(attachments.entityId, session.id))).orderBy(desc(attachments.createdAt)),
    ]);
    return response.json({ session, codes, entries, analyses, attachments: media });
  }),
);

router.patch(
  "/diagnostics/:sessionId",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const sessionId = uuidValue(request.params.sessionId, "sessionId");
    await ownedDiagnostic(user, sessionId);
    const updates: Partial<typeof diagnosticSessions.$inferInsert> = { updatedAt: new Date() };
    for (const [field, max] of [["confirmedRootCause", 5000], ["repairPerformed", 10000], ["verification", 10000], ["finalResolution", 10000]] as const) {
      if (field in request.body) updates[field] = optionalString(request.body[field], field, max);
    }
    if ("status" in request.body) updates.status = stringValue(request.body.status, "status", { max: 30 })!;
    if (updates.status === "resolved") updates.closedAt = new Date();
    const [session] = await db.update(diagnosticSessions).set(updates).where(eq(diagnosticSessions.id, sessionId)).returning();
    return response.json({ session });
  }),
);

router.post(
  "/diagnostics/:sessionId/codes",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const sessionId = uuidValue(request.params.sessionId, "sessionId");
    await ownedDiagnostic(user, sessionId);
    const [code] = await db.insert(diagnosticTroubleCodes).values({
      sessionId,
      code: stringValue(request.body?.code, "code", { max: 16 })!.toUpperCase(),
      description: optionalString(request.body?.description, "description", 500),
      status: optionalString(request.body?.status, "status", 30) ?? "active",
      freezeFrame: recordValue(request.body?.freezeFrame, "freezeFrame"),
    }).returning();
    return response.status(201).json({ code });
  }),
);

router.post(
  "/diagnostics/:sessionId/entries",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const sessionId = uuidValue(request.params.sessionId, "sessionId");
    await ownedDiagnostic(user, sessionId);
    const kind = stringValue(request.body?.kind, "kind", { max: 40 })!.toLowerCase();
    if (!new Set(["symptom", "condition", "inspection", "test", "measurement", "probable_cause", "root_cause", "repair", "verification", "resolution"]).has(kind)) {
      throw new HttpError(400, "invalid_entry_kind", "Unsupported diagnostic entry kind.");
    }
    const [entry] = await db.insert(diagnosticEntries).values({
      sessionId,
      kind,
      title: stringValue(request.body?.title, "title", { max: 160 })!,
      value: stringValue(request.body?.value, "value", { max: 10_000 })!,
      unit: optionalString(request.body?.unit, "unit", 40),
      outcome: optionalString(request.body?.outcome, "outcome", 500),
      metadata: recordValue(request.body?.metadata, "metadata"),
      observedAt: dateValue(request.body?.observedAt ?? new Date(), "observedAt")!,
    }).returning();
    return response.status(201).json({ entry });
  }),
);

router.post(
  "/diagnostics/:sessionId/assist",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    if (!allowAssist(user.id)) throw new HttpError(429, "rate_limited", "Torque Assist rate limit exceeded.");
    const idempotencyKey = stringValue(request.get("idempotency-key"), "Idempotency-Key", { min: 8, max: 200 })!;
    const analysis = await runTorqueAssist(user, uuidValue(request.params.sessionId, "sessionId"), idempotencyKey);
    const balance = await tokenBalance(db, user);
    return response.json({ analysis, tokens: balance });
  }),
);

router.get(
  "/diagnostic-templates",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const templates = await db.select().from(diagnosticTemplates).where(and(eq(diagnosticTemplates.tenantId, user.tenantId), or(eq(diagnosticTemplates.ownerUserId, user.id), eq(diagnosticTemplates.isShared, true)))).orderBy(desc(diagnosticTemplates.updatedAt));
    return response.json({ templates });
  }),
);

router.post(
  "/diagnostic-templates",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const [template] = await db.insert(diagnosticTemplates).values({
      tenantId: user.tenantId,
      ownerUserId: user.id,
      name: stringValue(request.body?.name, "name", { max: 160 })!,
      description: optionalString(request.body?.description, "description", 2_000) ?? "",
      concernPattern: optionalString(request.body?.concernPattern, "concernPattern", 2_000) ?? "",
      testPlan: Array.isArray(request.body?.testPlan) ? request.body.testPlan.slice(0, 100) : [],
      isShared: request.body?.isShared === true,
    }).returning();
    return response.status(201).json({ template });
  }),
);

router.get(
  "/token-balance",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const [balance, ledger, purchases] = await Promise.all([
      tokenBalance(db, user),
      db.select().from(tokenLedgerEntries).where(and(eq(tokenLedgerEntries.ownerUserId, user.id), eq(tokenLedgerEntries.tenantId, user.tenantId))).orderBy(desc(tokenLedgerEntries.createdAt)).limit(100),
      db.select().from(tokenPurchases).where(and(eq(tokenPurchases.ownerUserId, user.id), eq(tokenPurchases.tenantId, user.tenantId))).orderBy(desc(tokenPurchases.createdAt)).limit(100),
    ]);
    return response.json({ ...balance, ledger, purchases });
  }),
);

router.get(
  "/posts",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const posts = await db
      .select({ post: communityPosts, authorName: sql<string>`author.display_name`, commentCount: sql<number>`count(distinct ${communityComments.id})::int`, reactionCount: sql<number>`count(distinct (${communityReactions.userId}, ${communityReactions.reaction}))::int` })
      .from(communityPosts)
      .innerJoin(sql`torqueshed_users author`, sql`author.id = ${communityPosts.authorUserId}`)
      .leftJoin(communityComments, eq(communityComments.postId, communityPosts.id))
      .leftJoin(communityReactions, eq(communityReactions.postId, communityPosts.id))
      .where(and(eq(communityPosts.tenantId, user.tenantId), eq(communityPosts.status, "published")))
      .groupBy(communityPosts.id, sql`author.display_name`)
      .orderBy(desc(communityPosts.createdAt))
      .limit(100);
    return response.json({ posts });
  }),
);

router.post(
  "/posts",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = request.body?.vehicleId ? uuidValue(request.body.vehicleId, "vehicleId") : null;
    if (vehicleId) await ownedVehicle(user, vehicleId);
    const buildId = request.body?.buildId ? uuidValue(request.body.buildId, "buildId") : null;
    if (buildId) await ownedBuild(user, buildId);
    const [post] = await db.insert(communityPosts).values({
      tenantId: user.tenantId,
      authorUserId: user.id,
      vehicleId,
      buildId,
      kind: optionalString(request.body?.kind, "kind", 40) ?? "build_update",
      category: optionalString(request.body?.category, "category", 60) ?? "general",
      title: stringValue(request.body?.title, "title", { min: 4, max: 160 })!,
      body: stringValue(request.body?.body, "body", { min: 10, max: 20_000 })!,
    }).returning();
    return response.status(201).json({ post });
  }),
);

router.post(
  "/posts/:postId/comments",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const postId = uuidValue(request.params.postId, "postId");
    await tenantPost(user, postId);
    const parentCommentId = request.body?.parentCommentId ? uuidValue(request.body.parentCommentId, "parentCommentId") : null;
    if (parentCommentId) {
      const [parent] = await db.select({ id: communityComments.id }).from(communityComments).where(and(eq(communityComments.id, parentCommentId), eq(communityComments.postId, postId), eq(communityComments.tenantId, user.tenantId))).limit(1);
      if (!parent) throw new HttpError(404, "comment_not_found", "Parent comment not found.");
    }
    const [comment] = await db.insert(communityComments).values({
      tenantId: user.tenantId,
      postId,
      authorUserId: user.id,
      parentCommentId,
      body: stringValue(request.body?.body, "body", { min: 1, max: 10_000 })!,
    }).returning();
    return response.status(201).json({ comment });
  }),
);

router.put(
  "/posts/:postId/reactions/:reaction",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const postId = uuidValue(request.params.postId, "postId");
    const reaction = stringValue(request.params.reaction, "reaction", { max: 30 })!;
    await tenantPost(user, postId);
    await db.insert(communityReactions).values({ postId, userId: user.id, reaction }).onConflictDoNothing();
    return response.status(204).send();
  }),
);

router.post(
  "/posts/:postId/reports",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const postId = uuidValue(request.params.postId, "postId");
    await tenantPost(user, postId);
    const [report] = await db.insert(communityReports).values({
      tenantId: user.tenantId,
      postId,
      reporterUserId: user.id,
      reason: stringValue(request.body?.reason, "reason", { max: 120 })!,
      details: optionalString(request.body?.details, "details", 2_000),
    }).returning();
    return response.status(201).json({ report });
  }),
);

router.put(
  "/profiles/:userId/follow",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const followedUserId = stringValue(request.params.userId, "userId", { max: 100 })!;
    if (followedUserId === user.id) throw new HttpError(400, "invalid_follow", "You cannot follow yourself.");
    const [profile] = await db.select({ id: torqueshedUsers.id }).from(torqueshedUsers).where(and(eq(torqueshedUsers.id, followedUserId), eq(torqueshedUsers.tenantId, user.tenantId))).limit(1);
    if (!profile) throw new HttpError(404, "profile_not_found", "Profile not found.");
    await db.insert(communityFollows).values({ tenantId: user.tenantId, followerUserId: user.id, followedUserId }).onConflictDoNothing();
    return response.status(204).send();
  }),
);

router.get(
  "/listings",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
    const type = typeof request.query.type === "string" ? request.query.type.trim().toLowerCase() : "";
    const filters = [eq(marketplaceListings.tenantId, user.tenantId), eq(marketplaceListings.status, "published"), or(isNull(marketplaceListings.expiresAt), gt(marketplaceListings.expiresAt, new Date()))!];
    if (type) filters.push(eq(marketplaceListings.listingType, type));
    if (search) filters.push(or(ilike(marketplaceListings.title, `%${search}%`), ilike(marketplaceListings.description, `%${search}%`))!);
    const listings = await db.select().from(marketplaceListings).where(and(...filters)).orderBy(desc(marketplaceListings.createdAt)).limit(100);
    return response.json({ listings });
  }),
);

router.post(
  "/listings",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const listingType = (optionalString(request.body?.listingType ?? request.body?.type, "listingType", 30) ?? "sell").toLowerCase();
    if (!new Set(["sell", "trade", "wanted"]).has(listingType)) throw new HttpError(400, "invalid_listing_type", "Unsupported listing type.");
    const status = request.body?.status === "published" ? "published" : "draft";
    const [listing] = await db.transaction(async (transaction) => {
      const [created] = await transaction.insert(marketplaceListings).values({
        tenantId: user.tenantId,
        sellerUserId: user.id,
        category: optionalString(request.body?.category, "category", 80) ?? "parts",
        listingType,
        title: stringValue(request.body?.title, "title", { min: 4, max: 160 })!,
        description: stringValue(request.body?.description, "description", { min: 10, max: 10_000 })!,
        condition: stringValue(request.body?.condition, "condition", { max: 80 })!,
        price: numberValue(request.body?.price, "price", { min: 0, max: 10_000_000, optional: listingType !== "sell", integer: false })?.toFixed(2) ?? null,
        locationLabel: optionalString(request.body?.locationLabel, "locationLabel", 120),
        status,
        expiresAt: dateValue(request.body?.expiresAt, "expiresAt", true) ?? (status === "published" ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) : null),
      }).returning();
      await transaction.insert(auditEvents).values({ tenantId: user.tenantId, actorUserId: user.id, action: "listing.created", entityType: "marketplace_listing", entityId: created!.id, metadata: { status } });
      return [created];
    });
    return response.status(201).json({ listing });
  }),
);

router.put(
  "/listings/:listingId/favorite",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const listingId = uuidValue(request.params.listingId, "listingId");
    await tenantListing(user, listingId);
    await db.insert(marketplaceFavorites).values({ listingId, userId: user.id }).onConflictDoNothing();
    return response.status(204).send();
  }),
);

router.post(
  "/listings/:listingId/messages",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const listingId = uuidValue(request.params.listingId, "listingId");
    const listing = await tenantListing(user, listingId);
    if (listing.sellerUserId === user.id) throw new HttpError(400, "invalid_message", "You cannot message yourself about your own listing.");
    const [message] = await db.insert(marketplaceMessages).values({ tenantId: user.tenantId, listingId, senderUserId: user.id, recipientUserId: listing.sellerUserId, body: stringValue(request.body?.body, "body", { min: 1, max: 5_000 })! }).returning();
    return response.status(201).json({ message });
  }),
);

router.post(
  "/listings/:listingId/reports",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const listingId = uuidValue(request.params.listingId, "listingId");
    await tenantListing(user, listingId);
    const [report] = await db.insert(marketplaceReports).values({ tenantId: user.tenantId, listingId, reporterUserId: user.id, reason: stringValue(request.body?.reason, "reason", { max: 120 })!, details: optionalString(request.body?.details, "details", 2_000) }).returning();
    return response.status(201).json({ report });
  }),
);

router.get(
  "/builds",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const builds = await db.select().from(projectBuilds).where(and(eq(projectBuilds.ownerUserId, user.id), eq(projectBuilds.tenantId, user.tenantId))).orderBy(desc(projectBuilds.updatedAt));
    return response.json({ builds });
  }),
);

router.post(
  "/builds",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const vehicleId = request.body?.vehicleId ? uuidValue(request.body.vehicleId, "vehicleId") : null;
    if (vehicleId) await ownedVehicle(user, vehicleId);
    const [build] = await db.insert(projectBuilds).values({ tenantId: user.tenantId, ownerUserId: user.id, vehicleId, title: stringValue(request.body?.title, "title", { max: 160 })!, description: optionalString(request.body?.description, "description", 10_000) ?? "", budgetCents: numberValue(request.body?.budgetCents, "budgetCents", { min: 0, max: 100_000_000, optional: true }), startedAt: dateValue(request.body?.startedAt, "startedAt", true), targetAt: dateValue(request.body?.targetAt, "targetAt", true) }).returning();
    return response.status(201).json({ build });
  }),
);

router.post(
  "/builds/:buildId/stages",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const buildId = uuidValue(request.params.buildId, "buildId");
    await ownedBuild(user, buildId);
    const [stage] = await db.insert(buildStages).values({ buildId, title: stringValue(request.body?.title, "title", { max: 160 })!, description: optionalString(request.body?.description, "description", 5_000) ?? "", position: numberValue(request.body?.position ?? 0, "position", { min: 0, max: 10_000 })! }).returning();
    return response.status(201).json({ stage });
  }),
);

router.post(
  "/builds/:buildId/tasks",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const buildId = uuidValue(request.params.buildId, "buildId");
    await ownedBuild(user, buildId);
    const stageId = request.body?.stageId ? uuidValue(request.body.stageId, "stageId") : null;
    if (stageId) {
      const [stage] = await db.select({ id: buildStages.id }).from(buildStages).where(and(eq(buildStages.id, stageId), eq(buildStages.buildId, buildId))).limit(1);
      if (!stage) throw new HttpError(404, "stage_not_found", "Build stage not found.");
    }
    const [task] = await db.insert(buildTasks).values({ buildId, stageId, title: stringValue(request.body?.title, "title", { max: 160 })!, notes: optionalString(request.body?.notes, "notes", 5_000) ?? "", dueAt: dateValue(request.body?.dueAt, "dueAt", true), position: numberValue(request.body?.position ?? 0, "position", { min: 0, max: 10_000 })! }).returning();
    return response.status(201).json({ task });
  }),
);

router.post(
  "/attachments",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const entityType = stringValue(request.body?.entityType, "entityType", { max: 40 })!;
    const entityId = uuidValue(request.body?.entityId, "entityId");
    if (entityType === "vehicle") await ownedVehicle(user, entityId);
    else if (entityType === "diagnostic") await ownedDiagnostic(user, entityId);
    else if (entityType === "build") await ownedBuild(user, entityId);
    else if (entityType === "listing") {
      const [listing] = await db.select({ id: marketplaceListings.id }).from(marketplaceListings).where(and(eq(marketplaceListings.id, entityId), eq(marketplaceListings.sellerUserId, user.id), eq(marketplaceListings.tenantId, user.tenantId))).limit(1);
      if (!listing) throw new HttpError(404, "listing_not_found", "Listing not found.");
    } else if (entityType === "post") {
      const [post] = await db.select({ id: communityPosts.id }).from(communityPosts).where(and(eq(communityPosts.id, entityId), eq(communityPosts.authorUserId, user.id), eq(communityPosts.tenantId, user.tenantId))).limit(1);
      if (!post) throw new HttpError(404, "post_not_found", "Post not found.");
    } else {
      throw new HttpError(400, "invalid_entity_type", "Unsupported attachment entity type.");
    }
    const byteSize = numberValue(request.body?.byteSize, "byteSize", { min: 1, max: 25 * 1024 * 1024 })!;
    const [attachment] = await db.insert(attachments).values({
      tenantId: user.tenantId,
      ownerUserId: user.id,
      entityType,
      entityId,
      kind: stringValue(request.body?.kind, "kind", { max: 40 })!,
      storageKey: stringValue(request.body?.storageKey, "storageKey", { max: 500 })!,
      originalName: stringValue(request.body?.originalName, "originalName", { max: 255 })!,
      contentType: stringValue(request.body?.contentType, "contentType", { max: 120 })!,
      byteSize,
      caption: optionalString(request.body?.caption, "caption", 500),
    }).returning();
    return response.status(201).json({ attachment });
  }),
);

router.get(
  "/vendors",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const rows = await db.select().from(vendors).where(and(eq(vendors.ownerUserId, user.id), eq(vendors.tenantId, user.tenantId))).orderBy(vendors.name);
    return response.json({ vendors: rows });
  }),
);

router.post(
  "/vendors",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    const [vendor] = await db.insert(vendors).values({ tenantId: user.tenantId, ownerUserId: user.id, name: stringValue(request.body?.name, "name", { max: 160 })!, website: optionalString(request.body?.website, "website", 500), phone: optionalString(request.body?.phone, "phone", 80), notes: optionalString(request.body?.notes, "notes", 2_000) }).returning();
    return response.status(201).json({ vendor });
  }),
);

router.get(
  "/admin/audit",
  asyncRoute(async (request, response) => {
    const user = await requireUser(request);
    if (user.platformRole !== "admin" && user.platformRole !== "super_admin" && user.tenantRole !== "owner" && user.tenantRole !== "admin") {
      throw new HttpError(403, "forbidden", "Administrator access is required.");
    }
    const events = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, user.tenantId)).orderBy(desc(auditEvents.createdAt)).limit(250);
    return response.json({ events });
  }),
);

export default router;
