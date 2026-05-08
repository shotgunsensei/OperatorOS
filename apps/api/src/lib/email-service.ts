/**
 * Email service abstraction.
 *
 * Two providers ship out of the box:
 *   - `log`    — writes the rendered email to stdout (default in dev / when
 *                no API key is configured). Lets the invite flow run end-to-end
 *                without hard-failing in environments without an outbound
 *                email connector.
 *   - `resend` — posts to the Resend HTTPS API when `RESEND_API_KEY` is set.
 *                Picked automatically; no extra config required.
 *
 * Provider selection is intentionally last-write-wins on env so a single
 * boolean (presence of RESEND_API_KEY) flips dev → prod without code edits.
 *
 * The public surface is deliberately small (`sendInviteEmail`) so callers
 * never have to know which provider is active. New transactional emails
 * should be added here as named functions, not as ad-hoc HTTP calls in
 * route handlers.
 */

export interface InviteEmailInput {
  to: string;
  tenantName: string;
  inviterName: string;
  inviterEmail: string;
  role: 'owner' | 'admin' | 'member';
  acceptUrl: string;
  expiresAt: Date;
}

export interface SendResult {
  ok: boolean;
  provider: 'log' | 'resend';
  /** Provider-issued message id, when available. */
  id?: string;
  /** Populated when ok=false; safe to surface in audit logs. */
  error?: string;
}

function inviteSubject(input: InviteEmailInput): string {
  return `${input.inviterName} invited you to ${input.tenantName} on OperatorOS`;
}

function inviteText(input: InviteEmailInput): string {
  const expires = input.expiresAt.toUTCString();
  return [
    `Hi,`,
    ``,
    `${input.inviterName} (${input.inviterEmail}) has invited you to join the`,
    `"${input.tenantName}" workspace on OperatorOS as a ${input.role}.`,
    ``,
    `Accept the invite here:`,
    input.acceptUrl,
    ``,
    `This invite expires on ${expires}.`,
    ``,
    `If you weren't expecting this email you can safely ignore it.`,
    ``,
    `— OperatorOS`,
  ].join('\n');
}

function inviteHtml(input: InviteEmailInput): string {
  const expires = input.expiresAt.toUTCString();
  // Inline styles only — every meaningful mail client strips <style> blocks.
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111; line-height: 1.5;">
  <p>Hi,</p>
  <p>
    <strong>${escapeHtml(input.inviterName)}</strong>
    (${escapeHtml(input.inviterEmail)}) has invited you to join the
    <strong>${escapeHtml(input.tenantName)}</strong> workspace on OperatorOS
    as a <strong>${escapeHtml(input.role)}</strong>.
  </p>
  <p>
    <a href="${escapeAttr(input.acceptUrl)}"
       style="display:inline-block;padding:10px 18px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
      Accept invite
    </a>
  </p>
  <p style="color:#555;font-size:13px;">
    Or paste this link into your browser:<br/>
    <a href="${escapeAttr(input.acceptUrl)}">${escapeHtml(input.acceptUrl)}</a>
  </p>
  <p style="color:#555;font-size:13px;">This invite expires on ${escapeHtml(expires)}.</p>
  <p style="color:#888;font-size:12px;">If you weren't expecting this email you can safely ignore it.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'OperatorOS <no-reply@operatoros.local>';
}

async function sendViaResend(input: InviteEmailInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      subject: inviteSubject(input),
      text: inviteText(input),
      html: inviteHtml(input),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      provider: 'resend',
      error: `resend ${res.status}: ${body.slice(0, 240)}`,
    };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, provider: 'resend', id: data.id };
}

function sendViaLog(input: InviteEmailInput): SendResult {
  const subject = inviteSubject(input);
  // Single-line summary so it's easy to grep, then the body for completeness.
  console.log(
    `[email:log] to=${input.to} subject="${subject}" acceptUrl=${input.acceptUrl} expires=${input.expiresAt.toISOString()}`,
  );
  console.log(`[email:log:body]\n${inviteText(input)}`);
  return { ok: true, provider: 'log' };
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<SendResult> {
  try {
    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(input);
    }
    return sendViaLog(input);
  } catch (err: any) {
    return {
      ok: false,
      provider: process.env.RESEND_API_KEY ? 'resend' : 'log',
      error: String(err?.message ?? err).slice(0, 240),
    };
  }
}

/**
 * Construct the user-facing accept URL for an invite token. We point at the
 * web app (not the bare API) so the recipient hits a normal browser flow that
 * can prompt them to sign in / sign up before the actual `POST
 * /v1/invites/:token/accept` call. Falls back to a localhost URL in dev.
 */
export function buildInviteAcceptUrl(token: string): string {
  const base = (
    process.env.INVITE_ACCEPT_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.WEB_BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  return `${base}/invites/${encodeURIComponent(token)}`;
}
