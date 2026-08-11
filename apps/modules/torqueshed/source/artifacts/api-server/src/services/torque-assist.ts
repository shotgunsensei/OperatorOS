import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  diagnosticEntries,
  diagnosticSessions,
  diagnosticTroubleCodes,
  tokenLedgerEntries,
  torqueshedUsers,
  torqueAssistRequests,
  vehicles,
  type TorqueShedUser,
} from "@workspace/db";
import { HttpError } from "../lib/http";
import { tokenBalance } from "./token-balance";
import { torqueAssistAdapter } from "./torque-assist-adapter";

const TOKEN_COST = 2;

function contextDigest(context: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

export async function runTorqueAssist(
  user: TorqueShedUser,
  sessionId: string,
  idempotencyKey: string,
) {
  const existing = await db.query.torqueAssistRequests.findFirst({
    where: and(
      eq(torqueAssistRequests.ownerUserId, user.id),
      eq(torqueAssistRequests.idempotencyKey, idempotencyKey),
    ),
  });
  if (existing) {
    if (existing.status === "completed") return existing;
    if (existing.status === "pending") {
      throw new HttpError(409, "analysis_in_progress", "This Torque Assist request is still processing.");
    }
    throw new HttpError(409, "idempotency_replayed", "This request key belongs to a failed analysis. Use a new key to retry.");
  }

  const [row] = await db
    .select({ session: diagnosticSessions, vehicle: vehicles })
    .from(diagnosticSessions)
    .innerJoin(vehicles, eq(diagnosticSessions.vehicleId, vehicles.id))
    .where(
      and(
        eq(diagnosticSessions.id, sessionId),
        eq(diagnosticSessions.ownerUserId, user.id),
        eq(diagnosticSessions.tenantId, user.tenantId),
        eq(vehicles.ownerUserId, user.id),
        eq(vehicles.tenantId, user.tenantId),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "diagnostic_not_found", "Diagnostic session not found.");

  const [troubleCodes, entries] = await Promise.all([
    db
      .select()
      .from(diagnosticTroubleCodes)
      .where(eq(diagnosticTroubleCodes.sessionId, sessionId))
      .orderBy(asc(diagnosticTroubleCodes.createdAt)),
    db
      .select()
      .from(diagnosticEntries)
      .where(eq(diagnosticEntries.sessionId, sessionId))
      .orderBy(asc(diagnosticEntries.observedAt)),
  ]);
  const context = {
    vehicle: {
      year: row.vehicle.year,
      make: row.vehicle.make,
      model: row.vehicle.model,
      trim: row.vehicle.trim,
      engine: row.vehicle.engine,
      transmission: row.vehicle.transmission,
      drivetrain: row.vehicle.drivetrain,
      mileage: row.vehicle.mileage,
    },
    diagnosticSession: {
      title: row.session.title,
      customerConcern: row.session.customerConcern,
      symptoms: row.session.symptoms,
      conditions: row.session.conditions,
      freezeFrame: row.session.freezeFrame,
      priorProbableCauses: row.session.probableCauses,
      confirmedRootCause: row.session.confirmedRootCause,
      repairPerformed: row.session.repairPerformed,
      verification: row.session.verification,
    },
    troubleCodes: troubleCodes.map(({ code, description, status, freezeFrame }) => ({
      code,
      description,
      status,
      freezeFrame,
    })),
    observationsAndTests: entries.map(({ kind, title, value, unit, outcome, metadata, observedAt }) => ({
      kind,
      title,
      value,
      unit,
      outcome,
      metadata,
      observedAt,
    })),
  };
  const hash = contextDigest(context);

  const [requestRow] = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select ${torqueshedUsers.id} from ${torqueshedUsers} where ${torqueshedUsers.id} = ${user.id} for update`);
    const balance = await tokenBalance(transaction as never, user);
    if (balance.available < TOKEN_COST) {
      throw new HttpError(402, "insufficient_tokens", "Purchase Torque Assist tokens before running this analysis.");
    }
    return transaction
      .insert(torqueAssistRequests)
      .values({
        tenantId: user.tenantId,
        ownerUserId: user.id,
        diagnosticSessionId: sessionId,
        idempotencyKey,
        contextHash: hash,
        reservedTokens: TOKEN_COST,
      })
      .returning();
  });
  if (!requestRow) throw new Error("Failed to reserve Torque Assist request");

  try {
    const adapterResult = await torqueAssistAdapter().analyze(context);
    const [completed] = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select ${torqueshedUsers.id} from ${torqueshedUsers} where ${torqueshedUsers.id} = ${user.id} for update`);
      await transaction.insert(tokenLedgerEntries).values({
        tenantId: user.tenantId,
        ownerUserId: user.id,
        delta: -TOKEN_COST,
        entryType: "torque_assist_usage",
        description: `Torque Assist analysis for ${row.vehicle.year} ${row.vehicle.make} ${row.vehicle.model}`,
        torqueAssistRequestId: requestRow.id,
      });
      return transaction
        .update(torqueAssistRequests)
        .set({
          status: "completed",
          reservedTokens: 0,
          chargedTokens: TOKEN_COST,
          providerResponseId: adapterResult.providerResponseId,
          model: adapterResult.model,
          inputTokens: adapterResult.inputTokens,
          outputTokens: adapterResult.outputTokens,
          result: adapterResult.plan,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(torqueAssistRequests.id, requestRow.id),
            eq(torqueAssistRequests.status, "pending"),
          ),
        )
        .returning();
    });
    if (!completed) throw new Error("Failed to complete Torque Assist request");
    return completed;
  } catch (error) {
    await db
      .update(torqueAssistRequests)
      .set({
        status: "failed",
        reservedTokens: 0,
        errorCode: error instanceof HttpError ? error.code : "analysis_failed",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(torqueAssistRequests.id, requestRow.id),
          eq(torqueAssistRequests.status, "pending"),
        ),
      );
    throw error;
  }
}
