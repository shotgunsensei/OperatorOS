import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, teamMembersTable, usersTable } from "@workspace/db";
import { InviteTeamMemberBody, UpdateTeamMemberBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/team/members", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.json([]); return; }

  const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.organizationId, orgId));

  const enriched = await Promise.all(members.map(async (m) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
    return {
      id: m.id,
      userId: m.userId,
      email: user?.email || "",
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    };
  }));

  res.json(enriched);
});

router.post("/team/invite", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  const userId = (req as any).userId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const parsed = InviteTeamMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));

  if (!existingUser) {
    const passwordHash = await bcrypt.hash("invited-" + Date.now(), 10);
    [existingUser] = await db.insert(usersTable).values({
      email: parsed.data.email,
      passwordHash,
      firstName: parsed.data.firstName || "Invited",
      lastName: parsed.data.lastName || "User",
      role: parsed.data.role,
      organizationId: orgId,
    }).returning();
  }

  const [member] = await db.insert(teamMembersTable).values({
    organizationId: orgId,
    userId: existingUser.id,
    role: parsed.data.role,
    status: "invited",
  }).returning();

  await logActivity(db, orgId, userId, "invited", "team_member", member.id, parsed.data.email);

  res.status(201).json({
    id: member.id,
    userId: existingUser.id,
    email: existingUser.email,
    firstName: existingUser.firstName,
    lastName: existingUser.lastName,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
  });
});

router.patch("/team/members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [member] = await db.update(teamMembersTable).set({ role: parsed.data.role }).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Team member not found" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, member.userId));
  res.json({
    id: member.id,
    userId: member.userId,
    email: user?.email || "",
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
  });
});

router.delete("/team/members/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [member] = await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Team member not found" }); return; }
  res.sendStatus(204);
});

export default router;
