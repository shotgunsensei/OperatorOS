import { logger } from "./logger";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  delivered: boolean;
  reason?: string;
}

export type SendEmailFn = (input: SendEmailInput) => Promise<SendEmailResult>;

/**
 * Send a transactional email via Resend. Requires RESEND_API_KEY to actually
 * deliver — if it's not set we log and return delivered=false so callers can
 * decide whether to claim an idempotency slot anyway.
 *
 * Kept dependency-free (uses global fetch) so we don't have to add an SDK to
 * the api-server bundle for a single endpoint.
 */
export const sendEmail: SendEmailFn = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ??
    "Faultline Lab <noreply@faultlinelab.app>";

  if (!apiKey) {
    logger.warn(
      { to, subject },
      "RESEND_API_KEY not set; renewal email skipped",
    );
    return { delivered: false, reason: "no-api-key" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`Resend API error ${res.status}: ${body.slice(0, 200)}`);
  }

  return { delivered: true };
};
