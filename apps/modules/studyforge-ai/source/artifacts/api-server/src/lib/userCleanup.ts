import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  sessionsTable,
  studySetsTable,
  flashcardsTable,
  quizQuestionsTable,
  quizAttemptsTable,
  studySessionsTable,
  examCountdownsTable,
  foldersTable,
} from "@workspace/db";

/**
 * Permanently delete a user and ALL data they own.
 *
 * The schema does not declare FK cascades, so we manually delete in dependency
 * order inside a single transaction to keep the operation atomic.
 */
export async function deleteUserCascade(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const sets = await tx
      .select({ id: studySetsTable.id })
      .from(studySetsTable)
      .where(eq(studySetsTable.userId, userId));
    const setIds = sets.map((s) => s.id);

    if (setIds.length > 0) {
      await tx.delete(flashcardsTable).where(inArray(flashcardsTable.studySetId, setIds));
      await tx.delete(quizQuestionsTable).where(inArray(quizQuestionsTable.studySetId, setIds));
      await tx.delete(studySessionsTable).where(inArray(studySessionsTable.studySetId, setIds));
    }

    await tx.delete(quizAttemptsTable).where(eq(quizAttemptsTable.userId, userId));
    await tx.delete(examCountdownsTable).where(eq(examCountdownsTable.userId, userId));
    await tx.delete(studySetsTable).where(eq(studySetsTable.userId, userId));
    await tx.delete(foldersTable).where(eq(foldersTable.userId, userId));
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });
}
