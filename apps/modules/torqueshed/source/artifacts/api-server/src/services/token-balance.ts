import { and, eq, sql } from "drizzle-orm";
import {
  tokenLedgerEntries,
  torqueAssistRequests,
  type TorqueShedUser,
} from "@workspace/db";

type DbExecutor = {
  select: typeof import("@workspace/db").db.select;
};

export async function tokenBalance(executor: DbExecutor, user: TorqueShedUser) {
  const [ledger] = await executor
    .select({ balance: sql<number>`coalesce(sum(${tokenLedgerEntries.delta}), 0)::int` })
    .from(tokenLedgerEntries)
    .where(
      and(
        eq(tokenLedgerEntries.ownerUserId, user.id),
        eq(tokenLedgerEntries.tenantId, user.tenantId),
      ),
    );
  const [pending] = await executor
    .select({ reserved: sql<number>`coalesce(sum(${torqueAssistRequests.reservedTokens}), 0)::int` })
    .from(torqueAssistRequests)
    .where(
      and(
        eq(torqueAssistRequests.ownerUserId, user.id),
        eq(torqueAssistRequests.tenantId, user.tenantId),
        eq(torqueAssistRequests.status, "pending"),
      ),
    );
  const balance = Number(ledger?.balance ?? 0);
  const reserved = Number(pending?.reserved ?? 0);
  return { balance, reserved, available: Math.max(0, balance - reserved) };
}
