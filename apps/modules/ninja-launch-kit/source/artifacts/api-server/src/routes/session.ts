import { sendValidationError } from "../lib/http-errors";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, launchKitsTable, adminSettingsTable } from "@workspace/db";
import { LoginBody, SignupBody, GetSessionResponse, SubmitContactBody, SubmitContactResponse } from "@workspace/api-zod";
import { setSessionCookie, clearSessionCookie } from "../lib/session";
import { authLimiter, writeLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

async function buildSession(userId: number | null): Promise<unknown> {
  const [settings] = await db.select().from(adminSettingsTable).limit(1);
  const demoMode = settings?.demoMode ?? true;
  if (userId == null) {
    return {
      user: null,
      demoMode,
      usage: { kitsThisMonth: 0, monthlyLimit: 2 },
    };
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    return {
      user: null,
      demoMode,
      usage: { kitsThisMonth: 0, monthlyLimit: 2 },
    };
  }
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const allKits = await db.select().from(launchKitsTable).where(eq(launchKitsTable.userId, user.id));
  const kitsThisMonth = allKits.filter((k) => k.createdAt >= startOfMonth).length;
  const monthlyLimit = user.plan === "free" ? 2 : null;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      role: user.role,
      createdAt: user.createdAt,
    },
    demoMode,
    usage: { kitsThisMonth, monthlyLimit },
  };
}

router.get("/session", async (req, res): Promise<void> => {
  const data = await buildSession(req.user?.id ?? null);
  res.json(GetSessionResponse.parse(data));
});

router.post("/session/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({ email, name: email.split("@")[0] ?? "Operator", plan: "free", role: "user" })
      .returning();
  }
  setSessionCookie(res, user.id);
  const data = await buildSession(user.id);
  res.json(GetSessionResponse.parse(data));
});

router.post("/session/signup", authLimiter, async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim() || email.split("@")[0] || "Operator";
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({ email, name, plan: "free", role: "user" })
      .returning();
  }
  setSessionCookie(res, user.id);
  const data = await buildSession(user.id);
  res.json(GetSessionResponse.parse(data));
});

router.post("/session/logout", async (_req, res): Promise<void> => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.post("/contact", writeLimiter, async (req, res): Promise<void> => {
  const parsed = SubmitContactBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  req.log.info({ from: parsed.data.email }, "Contact form received");
  const data = SubmitContactResponse.parse({
    ok: true,
    message: "Thanks — we'll get back to you within one business day.",
  });
  res.json(data);
});

export default router;
