import { Router, type IRouter } from "express";
import { eq, and, sql, ilike, desc } from "drizzle-orm";
import { db, customersTable, jobsTable } from "@workspace/db";
import { CreateCustomerBody, UpdateCustomerBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/customers", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.json({ customers: [], total: 0 }); return; }

  const search = req.query.search as string | undefined;
  const limit = parseInt((req.query.limit as string) || "50", 10);
  const offset = parseInt((req.query.offset as string) || "0", 10);

  let conditions = [eq(customersTable.organizationId, orgId)];
  if (search) conditions.push(ilike(customersTable.name, `%${search}%`));
  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const customers = await db.select().from(customersTable).where(where!).orderBy(desc(customersTable.createdAt)).limit(limit).offset(offset);
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(customersTable).where(where!);

  const enriched = await Promise.all(customers.map(async (c) => {
    const [jc] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(eq(jobsTable.customerId, c.id));
    return { ...c, jobsCount: jc.count };
  }));

  res.json({ customers: enriched, total: countResult.count });
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  const userId = (req as any).userId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [customer] = await db.insert(customersTable).values({
    organizationId: orgId,
    name: parsed.data.name,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    company: parsed.data.company || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
  }).returning();

  await logActivity(db, orgId, userId, "created", "customer", customer.id, customer.name);

  res.status(201).json({ ...customer, jobsCount: 0 });
});

router.get("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const [jc] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(eq(jobsTable.customerId, id));
  res.json({ ...customer, jobsCount: jc.count });
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: any = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }

  const [customer] = await db.update(customersTable).set(updates).where(eq(customersTable.id, id)).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const [jc] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(eq(jobsTable.customerId, id));
  res.json({ ...customer, jobsCount: jc.count });
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [customer] = await db.delete(customersTable).where(eq(customersTable.id, id)).returning();
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  res.sendStatus(204);
});

export default router;
