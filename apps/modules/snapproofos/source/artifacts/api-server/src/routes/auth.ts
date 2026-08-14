import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, organizationsTable, teamMembersTable, brandingTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { generateToken, requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, firstName, lastName, organizationName } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let organizationId: number | null = null;
  let orgName: string | null = null;

  if (organizationName) {
    const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const [org] = await db.insert(organizationsTable).values({
      name: organizationName,
      slug: slug || "org-" + Date.now(),
    }).returning();
    organizationId = org.id;
    orgName = org.name;

    await db.insert(brandingTable).values({
      organizationId: org.id,
      companyName: organizationName,
    });
  }

  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash,
    firstName,
    lastName,
    role: "owner",
    organizationId,
    hasCompletedOnboarding: false,
  }).returning();

  if (organizationId) {
    await db.insert(teamMembersTable).values({
      organizationId,
      userId: user.id,
      role: "owner",
      status: "active",
    });
  }

  const token = generateToken({ userId: user.id, organizationId });
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("token", token, { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });

  res.status(201).json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organizationId,
    organizationName: orgName,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  let orgName: string | null = null;
  if (user.organizationId) {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.organizationId));
    if (org) orgName = org.name;
  }

  const token = generateToken({ userId: user.id, organizationId: user.organizationId });
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("token", token, { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: orgName,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("token");
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  let orgName: string | null = null;
  if (user.organizationId) {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.organizationId));
    if (org) orgName = org.name;
  }

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: orgName,
    hasCompletedOnboarding: user.hasCompletedOnboarding,
  });
});

router.get("/settings/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    jobTitle: user.jobTitle,
    avatarUrl: user.avatarUrl,
    role: user.role,
    organizationId: user.organizationId,
    createdAt: user.createdAt,
  });
});

router.patch("/settings/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId;
  const { firstName, lastName, phone, jobTitle } = req.body;
  const updates: any = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (phone !== undefined) updates.phone = phone;
  if (jobTitle !== undefined) updates.jobTitle = jobTitle;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    jobTitle: user.jobTitle,
    avatarUrl: user.avatarUrl,
    role: user.role,
    organizationId: user.organizationId,
    createdAt: user.createdAt,
  });
});

export default router;
