/**
 * Email service abstraction.
 *
 * Explicit delivery states:
 *   - `disabled` — production/development fail safely when unconfigured.
 *   - `test`     — deterministic delivery metadata in isolated test mode.
 *   - `resend` — posts to the Resend HTTPS API when an API key and explicit
 *                sender address are configured.
 *
 * Provider selection is derived only from server-side environment state.
 *
 * The public surface is deliberately small (`sendInviteEmail`) so callers
 * never have to know which provider is active. New transactional emails
 * should be added here as named functions, not as ad-hoc HTTP calls in
 * route handlers.
 */
import { resolveAppBaseUrl } from './public-url.js';

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
  provider: 'disabled' | 'test' | 'resend';
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
  // Task #66: EMAIL_FROM is the primary FROM; INVITE_FROM_EMAIL is a
  // dedicated fallback so ops can split transactional channels later
  // without touching the rest of the email surface.
  return (
    process.env.EMAIL_FROM ||
    process.env.INVITE_FROM_EMAIL ||
    'OperatorOS <no-reply@operatoros.local>'
  );
}

/** Public probe used by /v1/platform/health. Booleans only — never the value. */
export function getEmailFromHealth(): { configured: boolean; provider: 'resend' | 'test' | 'disabled' } {
  const testEnvironment = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test';
  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY && (process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL),
  );
  return {
    configured: resendConfigured,
    provider: resendConfigured ? 'resend' : (testEnvironment ? 'test' : 'disabled'),
  };
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
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return {
      ok: false,
      provider: 'resend',
      error: `RESEND_HTTP_${res.status}`,
    };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  if (!data.id) return { ok: false, provider: 'resend', error: 'RESEND_RESPONSE_INVALID' };
  return { ok: true, provider: 'resend', id: data.id };
}

function sendViaTest(_input: InviteEmailInput): SendResult {
  return { ok: true, provider: 'test', id: 'operatoros-test-invite' };
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<SendResult> {
  try {
    const resendConfigured = Boolean(
      process.env.RESEND_API_KEY && (process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL),
    );
    if (resendConfigured) {
      return await sendViaResend(input);
    }
    if (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test') {
      return sendViaTest(input);
    }
    return { ok: false, provider: 'disabled', error: 'EMAIL_PROVIDER_DISABLED' };
  } catch (err: any) {
    return {
      ok: false,
      provider: process.env.RESEND_API_KEY && (process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL)
        ? 'resend'
        : ((process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test') ? 'test' : 'disabled'),
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
    process.env.OPERATOROS_BASE_URL ||
    process.env.INVITE_ACCEPT_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.WEB_BASE_URL ||
    // Prod-aware fallback: never bake an unreachable localhost link into an
    // outbound invite email when running in production.
    resolveAppBaseUrl()
  ).replace(/\/+$/, '');
  return `${base}/invites/${encodeURIComponent(token)}`;
}
