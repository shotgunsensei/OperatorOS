import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, foldersTable, studySetsTable } from "@workspace/db";
import { CreateFolderBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/folders", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  // Single LEFT JOIN + GROUP BY instead of fetch-then-count.
  const rows = await db
    .select({
      id: foldersTable.id,
      name: foldersTable.name,
      color: foldersTable.color,
      studySetCount: sql<number>`count(${studySetsTable.id})::int`,
    })
    .from(foldersTable)
    .leftJoin(
      studySetsTable,
      and(eq(studySetsTable.folderId, foldersTable.id), eq(studySetsTable.userId, user.id)),
    )
    .where(eq(foldersTable.userId, user.id))
    .groupBy(foldersTable.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      studySetCount: Number(r.studySetCount),
    })),
  );
});

router.post("/folders", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = CreateFolderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [folder] = await db
    .insert(foldersTable)
    .values({
      userId: user.id,
      name: parsed.data.name.trim(),
      color: parsed.data.color || "#7c3aed",
    })
    .returning();
  res.status(201).json({ id: folder.id, name: folder.name, color: folder.color, studySetCount: 0 });
});

router.delete("/folders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(and(eq(foldersTable.id, id), eq(foldersTable.userId, user.id)));
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(studySetsTable)
      .set({ folderId: null })
      .where(eq(studySetsTable.folderId, id));
    await tx.delete(foldersTable).where(eq(foldersTable.id, id));
  });
  res.json({ ok: true });
});

export default router;
