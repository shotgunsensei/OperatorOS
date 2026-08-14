import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL || "no-reply@pulsedesk.support";
const fromName = process.env.SENDGRID_FROM_NAME || "PulseDesk";
const enabled = !!apiKey && apiKey.startsWith("SG.");

if (enabled) {
  sgMail.setApiKey(apiKey!);
}

export function isOutboundEnabled(): boolean {
  return enabled;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendOutbound(msg: OutboundEmail): Promise<{ ok: boolean; reason?: string }> {
  if (!enabled) return { ok: false, reason: "SENDGRID_API_KEY not configured" };
  if (!msg.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) return { ok: false, reason: "Invalid recipient" };
  try {
    await sgMail.send({
      to: msg.to,
      from: { email: fromEmail, name: fromName },
      subject: msg.subject,
      text: msg.text,
      html: msg.html || `<p>${msg.text.replace(/\n/g, "<br/>")}</p>`,
    });
    return { ok: true };
  } catch (err: any) {
    const reason = err?.response?.body?.errors?.[0]?.message || err?.message || "send failed";
    console.error("[outbound] send failed:", reason);
    return { ok: false, reason };
  }
}

const BASE_URL = process.env.PUBLIC_BASE_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "https://pulsedesk.support");

function shell(title: string, body: string, ctaUrl?: string, ctaLabel?: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7fa;padding:24px;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0">
  <tr><td style="padding:20px 24px;border-bottom:1px solid #f1f5f9">
    <span style="font-weight:600;font-size:14px;color:#0ea5e9;letter-spacing:.02em">PulseDesk</span>
  </td></tr>
  <tr><td style="padding:24px">
    <h1 style="font-size:18px;margin:0 0 12px 0">${title}</h1>
    <div style="font-size:14px;line-height:1.55;color:#334155">${body}</div>
    ${ctaUrl ? `<div style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500;font-size:13px">${ctaLabel || "Open in PulseDesk"}</a></div>` : ""}
  </td></tr>
  <tr><td style="padding:14px 24px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8">
    You're receiving this because you're a member of a PulseDesk organization. Manage notifications in Settings.
  </td></tr>
</table></body></html>`;
}

export function buildTicketEmail(opts: {
  type: "ticket_created" | "ticket_assigned" | "ticket_status_changed" | "ticket_escalated" | "ticket_note_added";
  ticketNumber: string;
  ticketTitle: string;
  ticketId: string;
  body?: string;
}): { subject: string; text: string; html: string } {
  const url = `${BASE_URL}/tickets/${opts.ticketId}`;
  const verbs: Record<string, string> = {
    ticket_created: "New ticket",
    ticket_assigned: "Assigned to you",
    ticket_status_changed: "Status updated",
    ticket_escalated: "Escalated",
    ticket_note_added: "New note",
  };
  const verb = verbs[opts.type] || "Update";
  const subject = `[${opts.ticketNumber}] ${verb} — ${opts.ticketTitle}`;
  const text = `${verb}: ${opts.ticketNumber} — ${opts.ticketTitle}\n${opts.body || ""}\n\nOpen: ${url}`;
  const html = shell(`${verb}: ${opts.ticketNumber}`, `<p style="margin:0 0 8px 0;font-weight:500">${opts.ticketTitle}</p>${opts.body ? `<p style="margin:0;color:#64748b">${opts.body}</p>` : ""}`, url, "View ticket");
  return { subject, text, html };
}

export function buildInviteEmail(opts: { orgName: string; inviteUrl: string; inviterName?: string }): { subject: string; text: string; html: string } {
  const subject = `You've been invited to ${opts.orgName} on PulseDesk`;
  const text = `${opts.inviterName ? opts.inviterName + " has invited you" : "You've been invited"} to join ${opts.orgName} on PulseDesk.\n\nAccept: ${opts.inviteUrl}`;
  const html = shell(`Join ${opts.orgName} on PulseDesk`, `<p>${opts.inviterName ? `<strong>${opts.inviterName}</strong> invited you` : "You've been invited"} to collaborate on healthcare-ops tickets, supplies, and facilities in <strong>${opts.orgName}</strong>.</p>`, opts.inviteUrl, "Accept invite");
  return { subject, text, html };
}
