import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, SignupBody, UpdateProfileBody } from "@workspace/api-zod";
import {
  destroySession,
  getCurrentUser,
  hashPassword,
  requireAuth,
  rotateSession,
  validatePasswordStrength,
  verifyPassword,
} from "../lib/auth";
import { deleteUserCascade } from "../lib/userCleanup";
import { rateLimit } from "../lib/rateLimit";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: "auth" });

const router: IRouter = Router();

function userToSession(u: { id: number; email: string; name: string; role: string; plan: string; createdAt: Date }) {
  return {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      createdAt: u.createdAt.toISOString(),
    },
  };
}

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (!user) {
    res.json({ user: null });
    return;
  }
  res.json(userToSession(user));
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  // Rotate token on successful login to defeat session fixation.
  await rotateSession(req, res, user.id);
  res.json(userToSession(user));
});

router.post("/auth/signup", authLimiter, async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const passwordError = validatePasswordStrength(parsed.data.password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "An account with that email already exists" });
    return;
  }
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      name: parsed.data.name.trim() || email.split("@")[0],
      passwordHash: hashPassword(parsed.data.password),
      role: "student",
      plan: "free",
    })
    .returning();
  await rotateSession(req, res, user.id);
  res.json(userToSession(user));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await destroySession(req, res);
  res.json({ ok: true });
});

router.patch("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Name cannot be empty" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ name })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(userToSession(updated));
});

router.delete("/auth/account", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  // Demo accounts are protected so the seed users remain available for everyone.
  if (user.email.endsWith("@example.com")) {
    res.status(403).json({ error: "Demo accounts cannot be deleted" });
    return;
  }
  // Transactional cascade delete across all tables that reference the user.
  await deleteUserCascade(user.id);
  await destroySession(req, res);
  res.json({ ok: true });
});

export default router;
