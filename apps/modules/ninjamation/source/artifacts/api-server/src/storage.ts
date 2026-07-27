import { usersTable, scriptsTable } from '@workspace/db';
import { eq, sql, and, ilike, or, count, desc } from 'drizzle-orm';
import { db } from '@workspace/db';

export class Storage {
  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user;
  }

  async getUserByStripeCustomerId(customerId: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.stripeCustomerId, customerId));
    return user;
  }

  async upsertUser(userData: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
  }) {
    const existing = await this.getUser(userData.id);
    if (existing) {
      const [user] = await db.update(usersTable)
        .set({ ...userData, updatedAt: new Date() })
        .where(eq(usersTable.id, userData.id))
        .returning();
      return user;
    }
    const [user] = await db.insert(usersTable).values(userData).returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, stripeInfo: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    subscriptionTier?: string | null;
  }) {
    const [user] = await db.update(usersTable)
      .set({ ...stripeInfo, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  async listScripts(options: {
    format?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { format, category, search, page = 1, limit = 20 } = options;
    const conditions = [];

    if (format) {
      conditions.push(eq(scriptsTable.format, format));
    }
    if (category) {
      conditions.push(eq(scriptsTable.category, category));
    }
    if (search) {
      conditions.push(
        or(
          ilike(scriptsTable.name, `%${search}%`),
          ilike(scriptsTable.description, `%${search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * limit;

    const [scripts, totalResult] = await Promise.all([
      db.select({
        id: scriptsTable.id,
        name: scriptsTable.name,
        description: scriptsTable.description,
        format: scriptsTable.format,
        category: scriptsTable.category,
        source: scriptsTable.source,
        downloadCount: scriptsTable.downloadCount,
        createdAt: scriptsTable.createdAt,
      })
        .from(scriptsTable)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(scriptsTable.name),
      db.select({ count: count() })
        .from(scriptsTable)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      scripts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getScript(id: number) {
    const [script] = await db.select().from(scriptsTable).where(eq(scriptsTable.id, id));
    return script || null;
  }

  async incrementDownloadCount(id: number) {
    await db.update(scriptsTable)
      .set({ downloadCount: sql`${scriptsTable.downloadCount} + 1` })
      .where(eq(scriptsTable.id, id));
  }

  async getFormatsAndCategories() {
    const [formats, categories] = await Promise.all([
      db.selectDistinct({ format: scriptsTable.format }).from(scriptsTable),
      db.selectDistinct({ category: scriptsTable.category }).from(scriptsTable),
    ]);
    return {
      formats: formats.map(f => f.format),
      categories: categories.map(c => c.category),
    };
  }

  async upsertScript(data: {
    name: string;
    description: string;
    content: string;
    fileName: string;
    format: string;
    category: string;
    source: string;
    githubPath?: string;
  }) {
    if (data.githubPath) {
      const existing = await db.select()
        .from(scriptsTable)
        .where(eq(scriptsTable.githubPath, data.githubPath));
      if (existing.length > 0) {
        const [updated] = await db.update(scriptsTable)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(scriptsTable.githubPath, data.githubPath))
          .returning();
        return { script: updated, isNew: false };
      }
    }
    const [script] = await db.insert(scriptsTable).values(data).returning();
    return { script, isNew: true };
  }
  async listUsers(options: { search?: string; page?: number; limit?: number }) {
    const { search, page = 1, limit = 20 } = options;
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * limit;

    const [users, totalResult] = await Promise.all([
      db.select().from(usersTable).where(whereClause).limit(limit).offset(offset).orderBy(desc(usersTable.createdAt)),
      db.select({ count: count() }).from(usersTable).where(whereClause),
    ]);

    return {
      users,
      total: totalResult[0]?.count ?? 0,
      page,
      totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limit),
    };
  }

  async updateUser(userId: string, data: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    subscriptionTier?: string | null;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    isAdmin?: boolean;
  }) {
    const [user] = await db.update(usersTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  async deleteUser(userId: string) {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }

  async updateScript(id: number, data: {
    name?: string;
    description?: string;
    content?: string;
    fileName?: string;
    format?: string;
    category?: string;
  }) {
    const [script] = await db.update(scriptsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scriptsTable.id, id))
      .returning();
    return script;
  }

  async deleteScript(id: number) {
    await db.delete(scriptsTable).where(eq(scriptsTable.id, id));
  }

  async createScript(data: {
    name: string;
    description: string;
    content: string;
    fileName: string;
    format: string;
    category: string;
    source: string;
  }) {
    const [script] = await db.insert(scriptsTable).values(data).returning();
    return script;
  }

  async getStats() {
    const [userCount] = await db.select({ count: count() }).from(usersTable);
    const [scriptCount] = await db.select({ count: count() }).from(scriptsTable);
    const [subscribedCount] = await db.select({ count: count() }).from(usersTable)
      .where(sql`${usersTable.subscriptionTier} IS NOT NULL`);

    return {
      totalUsers: userCount?.count ?? 0,
      totalScripts: scriptCount?.count ?? 0,
      subscribedUsers: subscribedCount?.count ?? 0,
    };
  }
}

export const storage = new Storage();
