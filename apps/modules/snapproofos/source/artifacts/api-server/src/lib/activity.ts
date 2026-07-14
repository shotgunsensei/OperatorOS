import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import { activityTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function logActivity(
  db: any,
  organizationId: number,
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
  entityName: string,
  metadata: Record<string, any> = {},
): Promise<void> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const userName = user ? `${user.firstName} ${user.lastName}` : "Unknown";
    await db.insert(activityTable).values({
      organizationId,
      action,
      entityType,
      entityId,
      entityName,
      userId,
      userName,
      metadata,
    });
  } catch {
  }
}
