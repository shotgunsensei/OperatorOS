import { lt } from "drizzle-orm";
import { db, crossPromoClicksTable } from "@workspace/db";
import { logger } from "./logger";

export const CROSS_PROMO_RETENTION_DAYS = 180;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function pruneCrossPromoClicks(
  retentionDays: number = CROSS_PROMO_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(crossPromoClicksTable)
    .where(lt(crossPromoClicksTable.createdAt, cutoff));
  return result.rowCount ?? 0;
}

export function startCrossPromoRetentionJob(): NodeJS.Timeout | null {
  if (!process.env.DATABASE_URL) {
    logger.warn(
      "DATABASE_URL not set; skipping cross-promo retention job",
    );
    return null;
  }

  const run = () => {
    pruneCrossPromoClicks()
      .then((deleted) => {
        if (deleted > 0) {
          logger.info(
            { deleted, retentionDays: CROSS_PROMO_RETENTION_DAYS },
            "Pruned old cross-promo clicks",
          );
        }
      })
      .catch((err) => {
        logger.error({ err }, "Failed to prune cross-promo clicks");
      });
  };

  run();
  const handle = setInterval(run, PRUNE_INTERVAL_MS);
  handle.unref?.();
  return handle;
}
