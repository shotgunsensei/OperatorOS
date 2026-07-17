import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { subscriptionRenewalNoticesTable, usersTable } from "@workspace/db/schema";
import { logger } from "./logger";
import { sendEmail, type SendEmailFn } from "./email";
import { getUncachableStripeClient } from "../stripeClient";

const DAY_MS = 24 * 60 * 60 * 1000;
// Task spec: "A scheduled job in the API server scans active Pro subscriptions
// daily." We run on a 24h interval and also fire once on boot so a restarted
// server picks up any newly-eligible notices immediately.
const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type NoticeKind = "renewal-t5" | "cancel-t3" | "cancel-t1";

export interface SubscriptionCandidate {
  subscriptionId: string;
  userId: string;
  email: string;
  customerId: string | null;
  currentPeriodEnd: number; // Stripe epoch seconds
  cancelAtPeriodEnd: boolean;
  unitAmount: number | null; // minor units
  currency: string | null;
  interval: "month" | "year" | null;
  // Pre-existing unsubscribe token. May be null for users we haven't mailed
  // before; the scan loop will materialize one before sending.
  unsubscribeToken: string | null;
}

/**
 * Returns the user's unsubscribe token, generating and persisting a fresh
 * one on first use. Safe to call concurrently — uses a unique-index conflict
 * to avoid races, then re-reads.
 */
export async function ensureUnsubscribeToken(userId: string): Promise<string> {
  const existing = await db
    .select({ token: usersTable.unsubscribeToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const current = existing[0]?.token;
  if (current) return current;
  const token = randomBytes(24).toString("base64url");
  await db
    .update(usersTable)
    .set({ unsubscribeToken: token, updatedAt: new Date() })
    .where(
      sql`${usersTable.id} = ${userId} AND ${usersTable.unsubscribeToken} IS NULL`,
    );
  const refreshed = await db
    .select({ token: usersTable.unsubscribeToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return refreshed[0]?.token ?? token;
}

export interface DecisionContext {
  now?: number; // ms since epoch
}

/**
 * Pure: decide which (still-eligible) notices apply to a subscription right
 * now. Returns an empty array if nothing should be sent. Idempotency is
 * enforced at the DB layer, not here.
 *
 * Windows:
 *   - renewal-t5 (auto-renewal heads-up): 0 < daysUntil <= 5
 *     and !cancelAtPeriodEnd
 *   - cancel-t3 (expiration warning):     0 < daysUntil <= 3
 *     and cancelAtPeriodEnd
 *   - cancel-t1 (expiration warning):     0 < daysUntil <= 1
 *     and cancelAtPeriodEnd
 */
export function decideNotices(
  sub: SubscriptionCandidate,
  ctx: DecisionContext = {},
): NoticeKind[] {
  const now = ctx.now ?? Date.now();
  const renewMs = sub.currentPeriodEnd * 1000;
  const msUntil = renewMs - now;
  if (msUntil <= 0) return [];

  const daysUntil = msUntil / DAY_MS;
  const kinds: NoticeKind[] = [];
  if (sub.cancelAtPeriodEnd) {
    if (daysUntil <= 3) kinds.push("cancel-t3");
    if (daysUntil <= 1) kinds.push("cancel-t1");
  } else {
    if (daysUntil <= 5) kinds.push("renewal-t5");
  }
  return kinds;
}

/**
 * Try to claim the idempotency slot for (subscriptionId, periodEnd, kind).
 * Returns true if this run won the race and may proceed to send. Returns
 * false if a previous run already sent this notice.
 */
export async function claimNoticeSlot(opts: {
  subscriptionId: string;
  periodEnd: number;
  kind: NoticeKind;
  userId: string;
  email: string;
}): Promise<boolean> {
  const result = await db
    .insert(subscriptionRenewalNoticesTable)
    .values({
      id: randomUUID(),
      userId: opts.userId,
      subscriptionId: opts.subscriptionId,
      periodEnd: opts.periodEnd,
      kind: opts.kind,
      email: opts.email,
    })
    .onConflictDoNothing({
      target: [
        subscriptionRenewalNoticesTable.subscriptionId,
        subscriptionRenewalNoticesTable.periodEnd,
        subscriptionRenewalNoticesTable.kind,
      ],
    })
    .returning({ id: subscriptionRenewalNoticesTable.id });
  return result.length > 0;
}

/**
 * If the claim was made but the email send fails, release the slot so the
 * next scan can retry.
 */
export async function releaseNoticeSlot(opts: {
  subscriptionId: string;
  periodEnd: number;
  kind: NoticeKind;
}): Promise<void> {
  await db.execute(sql`
    DELETE FROM subscription_renewal_notices
    WHERE subscription_id = ${opts.subscriptionId}
      AND period_end = ${opts.periodEnd}
      AND kind = ${opts.kind}
  `);
}

/**
 * Pulls every active/trialing subscription that has a matching local user
 * with an email on file. The first-item join is best-effort — single-item
 * subscriptions are the only shape this app produces today.
 */
export async function listSubscriptionCandidates(): Promise<
  SubscriptionCandidate[]
> {
  const rows = await db.execute(sql`
    SELECT
      s.id              AS subscription_id,
      s.current_period_end AS current_period_end,
      s.cancel_at_period_end AS cancel_at_period_end,
      s.customer        AS customer,
      u.id              AS user_id,
      u.email           AS email,
      u.unsubscribe_token AS unsubscribe_token,
      pr.unit_amount    AS unit_amount,
      pr.currency       AS currency,
      pr.recurring->>'interval' AS interval
    FROM stripe.subscriptions s
    JOIN users u ON u.stripe_subscription_id = s.id
    LEFT JOIN stripe.prices pr
      ON pr.id = (s.items->'data'->0->'price'->>'id')
    WHERE s.status IN ('active', 'trialing')
      AND s.current_period_end IS NOT NULL
      AND u.email IS NOT NULL
      AND u.renewal_emails_enabled = true
      AND (
        -- Filter to Pro subscriptions only. Subscriptions created by our
        -- checkout flow always carry catalogProductId='pro-subscription' in
        -- their metadata (see routes/stripe.ts checkout-by-catalog). We also
        -- accept rows whose underlying product is mapped to our pro-subscription
        -- catalog id in stripe.products.metadata, to cover any subscriptions
        -- created before the metadata was added.
        s.metadata->>'catalogProductId' = 'pro-subscription'
        OR EXISTS (
          SELECT 1 FROM stripe.products prod
          WHERE prod.id = (s.items->'data'->0->'price'->>'product')
            AND prod.metadata->>'catalogId' = 'pro-subscription'
        )
      )
  `);

  const candidates: SubscriptionCandidate[] = [];
  for (const r of rows.rows as Array<Record<string, unknown>>) {
    const periodEnd = Number(r.current_period_end);
    if (!Number.isFinite(periodEnd) || periodEnd <= 0) continue;
    const email = typeof r.email === "string" ? r.email : null;
    if (!email) continue;
    const interval = r.interval === "month" || r.interval === "year"
      ? (r.interval as "month" | "year")
      : null;
    candidates.push({
      subscriptionId: String(r.subscription_id),
      userId: String(r.user_id),
      email,
      customerId: typeof r.customer === "string" ? r.customer : null,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
      unitAmount:
        typeof r.unit_amount === "number"
          ? r.unit_amount
          : typeof r.unit_amount === "string" && r.unit_amount.length > 0
            ? Number(r.unit_amount)
            : null,
      currency: typeof r.currency === "string" ? r.currency : null,
      interval,
      unsubscribeToken:
        typeof r.unsubscribe_token === "string" ? r.unsubscribe_token : null,
    });
  }
  return candidates;
}

function formatAmount(unitAmount: number | null, currency: string | null): string | null {
  if (unitAmount === null || !Number.isFinite(unitAmount)) return null;
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(unitAmount / 100);
  } catch {
    return `$${(unitAmount / 100).toFixed(2)}`;
  }
}

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderNoticeEmail(
  kind: NoticeKind,
  sub: SubscriptionCandidate,
  manageUrl: string,
  unsubscribeUrl?: string,
): RenderedEmail {
  const dateLabel = formatDate(sub.currentPeriodEnd);
  const amount = formatAmount(sub.unitAmount, sub.currency);
  const intervalWord =
    sub.interval === "year" ? "annually" : sub.interval === "month" ? "monthly" : null;
  const chargeLine = amount
    ? `${amount}${intervalWord ? ` (${intervalWord})` : ""} will be charged to your card on file.`
    : "Your card on file will be charged the usual amount.";

  const unsubText = unsubscribeUrl
    ? ["", `Don't want these reminders? Unsubscribe with one click: ${unsubscribeUrl}`]
    : [];
  const unsubHtml = unsubscribeUrl
    ? `<p style="margin:16px 0 0;color:#666;font-size:12px;">Don't want these reminders? <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe with one click</a>.</p>`
    : "";

  if (kind === "renewal-t5") {
    const subject = `Your Faultline Lab Pro subscription renews on ${dateLabel}`;
    const text = [
      "Heads up — your Faultline Lab Pro subscription renews soon.",
      "",
      `Renewal date: ${dateLabel}`,
      chargeLine,
      "",
      `Manage or cancel your subscription anytime: ${manageUrl}`,
      ...unsubText,
      "",
      "— Faultline Lab",
    ].join("\n");
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Your Faultline Lab Pro subscription renews on ${dateLabel}</h2>
        <p style="margin:0 0 16px;">${chargeLine}</p>
        <p style="margin:0 0 24px;">No action needed if you'd like to keep going.</p>
        <p style="margin:0 0 24px;">
          <a href="${manageUrl}" style="display:inline-block;background:#22d3ee;color:#0a0e14;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Manage subscription</a>
        </p>
        <p style="margin:0;color:#666;font-size:12px;">You can cancel anytime from the billing portal.</p>
        ${unsubHtml}
      </div>
    `.trim();
    return { subject, html, text };
  }

  // cancel-t3 / cancel-t1
  const tomorrowLabel = kind === "cancel-t1" ? "tomorrow" : null;
  const subject =
    kind === "cancel-t1"
      ? `Your Faultline Lab Pro access ends tomorrow (${dateLabel})`
      : `Your Faultline Lab Pro access ends on ${dateLabel}`;
  const resumeLine = amount
    ? `If you resume before ${dateLabel}, billing continues at ${amount}${intervalWord ? ` ${intervalWord}` : ""} and your access never lapses.`
    : `Resume before ${dateLabel} and your access never lapses.`;
  const headlineSuffix = tomorrowLabel
    ? `tomorrow, ${dateLabel}`
    : `on ${dateLabel}`;
  const text = [
    `Your Faultline Lab Pro access ends ${headlineSuffix}.`,
    "",
    `Access ends: ${dateLabel}`,
    "You won't be charged again. After your access ends you'll keep your guest progress, but the Pro cases and features will lock.",
    "",
    resumeLine,
    `Manage or resume your subscription: ${manageUrl}`,
    ...unsubText,
    "",
    "— Faultline Lab",
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:18px;">Your Faultline Lab Pro access ends ${headlineSuffix}</h2>
      <p style="margin:0 0 8px;"><strong>Access ends:</strong> ${dateLabel}</p>
      <p style="margin:0 0 16px;">You won't be charged again. After your access ends you'll keep your guest progress, but the Pro cases and features will lock.</p>
      <p style="margin:0 0 16px;">${resumeLine}</p>
      <p style="margin:0 0 24px;">
        <a href="${manageUrl}" style="display:inline-block;background:#22d3ee;color:#0a0e14;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Resume subscription</a>
      </p>
      <p style="margin:0;color:#666;font-size:12px;">You can resume anytime before your access ends and keep every Pro case.</p>
      ${unsubHtml}
    </div>
  `.trim();
  return { subject, html, text };
}

function appBaseUrl(): string {
  const dom =
    process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN;
  return dom ? `https://${dom}` : "http://localhost";
}

async function createManageUrl(
  customerId: string | null,
  fallbackUrl: string,
): Promise<string> {
  if (!customerId) return fallbackUrl;
  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appBaseUrl()}/?account=return`,
    });
    return session.url ?? fallbackUrl;
  } catch (err) {
    logger.warn(
      { err, customerId },
      "Failed to create billing portal session for renewal email; using fallback",
    );
    return fallbackUrl;
  }
}

export interface RunRenewalNoticeScanDeps {
  listCandidates?: () => Promise<SubscriptionCandidate[]>;
  buildManageUrl?: (sub: SubscriptionCandidate) => Promise<string>;
  send?: SendEmailFn;
  now?: number;
}

export interface RunRenewalNoticeScanResult {
  scanned: number;
  sent: number;
  skippedDuplicate: number;
  failed: number;
}

export async function runRenewalNoticeScan(
  deps: RunRenewalNoticeScanDeps = {},
): Promise<RunRenewalNoticeScanResult> {
  const list = deps.listCandidates ?? listSubscriptionCandidates;
  const send = deps.send ?? sendEmail;
  const fallback = `${appBaseUrl()}/?view=account`;
  const buildUrl =
    deps.buildManageUrl ??
    ((sub: SubscriptionCandidate) => createManageUrl(sub.customerId, fallback));

  const candidates = await list();
  let sent = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const sub of candidates) {
    const kinds = decideNotices(sub, { now: deps.now });
    if (kinds.length === 0) continue;
    for (const kind of kinds) {
      const claimed = await claimNoticeSlot({
        subscriptionId: sub.subscriptionId,
        periodEnd: sub.currentPeriodEnd,
        kind,
        userId: sub.userId,
        email: sub.email,
      });
      if (!claimed) {
        skippedDuplicate += 1;
        continue;
      }
      try {
        const manageUrl = await buildUrl(sub);
        const token =
          sub.unsubscribeToken ?? (await ensureUnsubscribeToken(sub.userId));
        const unsubscribeUrl = `${appBaseUrl()}/api/email-preferences/unsubscribe?token=${encodeURIComponent(token)}`;
        const rendered = renderNoticeEmail(kind, sub, manageUrl, unsubscribeUrl);
        const result = await send({
          to: sub.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        if (result.delivered) {
          sent += 1;
        } else {
          // Email infra unavailable (e.g. missing API key). Release the slot
          // so a future scan with credentials can retry instead of silently
          // burning the notice.
          await releaseNoticeSlot({
            subscriptionId: sub.subscriptionId,
            periodEnd: sub.currentPeriodEnd,
            kind,
          });
        }
      } catch (err) {
        failed += 1;
        logger.error(
          { err, subscriptionId: sub.subscriptionId, kind },
          "Failed to send subscription renewal notice",
        );
        await releaseNoticeSlot({
          subscriptionId: sub.subscriptionId,
          periodEnd: sub.currentPeriodEnd,
          kind,
        }).catch(() => {});
      }
    }
  }

  return { scanned: candidates.length, sent, skippedDuplicate, failed };
}

export function startSubscriptionRenewalNoticeJob(): NodeJS.Timeout | null {
  if (!process.env.DATABASE_URL) {
    logger.warn(
      "DATABASE_URL not set; skipping subscription renewal notice job",
    );
    return null;
  }

  const run = () => {
    runRenewalNoticeScan()
      .then((res) => {
        if (res.sent > 0 || res.failed > 0) {
          logger.info(res, "Subscription renewal notice scan finished");
        }
      })
      .catch((err) => {
        logger.error({ err }, "Subscription renewal notice scan failed");
      });
  };

  run();
  const handle = setInterval(run, SCAN_INTERVAL_MS);
  handle.unref?.();
  return handle;
}
