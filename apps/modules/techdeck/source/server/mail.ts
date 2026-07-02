/**
 * Mail service abstraction.
 *
 * Provider resolution:
 *   1. If SMTP_HOST + SMTP_USER + SMTP_PASS are set, uses nodemailer SMTP.
 *   2. Otherwise no-ops with a logged warning so the app keeps working.
 *
 * Replace with SendGrid/Resend/Postmark by adding a new branch.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

export interface MailProvider {
  name: string;
  send(message: MailMessage): Promise<void>;
}

class NoopMailProvider implements MailProvider {
  name = "noop";
  private warned = false;
  async send(message: MailMessage): Promise<void> {
    if (!this.warned) {
      console.warn(
        "[mail] No SMTP credentials configured. Email sending is disabled. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM to enable.",
      );
      this.warned = true;
    }
    console.info(`[mail:noop] would send to=${message.to} subject="${message.subject}"`);
  }
}

class SmtpMailProvider implements MailProvider {
  name = "smtp";
  private transporterPromise: Promise<any> | null = null;

  private async getTransporter() {
    if (!this.transporterPromise) {
      this.transporterPromise = (async () => {
        const nodemailer = await import("nodemailer").catch(() => null);
        if (!nodemailer) {
          throw new Error(
            "[mail] nodemailer is not installed. Install with the package manager to enable SMTP.",
          );
        }
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST!,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER!,
            pass: process.env.SMTP_PASS!,
          },
        });
      })();
    }
    return this.transporterPromise;
  }

  async send(message: MailMessage): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: message.from || process.env.MAIL_FROM || `Tech Deck <no-reply@techdeck.app>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

let provider: MailProvider | null = null;

function getProvider(): MailProvider {
  if (provider) return provider;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    provider = new SmtpMailProvider();
    console.info(`[mail] Provider initialized: smtp (${process.env.SMTP_HOST})`);
  } else {
    provider = new NoopMailProvider();
  }
  return provider;
}

export async function sendMail(message: MailMessage): Promise<void> {
  try {
    await getProvider().send(message);
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    throw err;
  }
}

// Pre-built templates
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Reset your Tech Deck password",
    text: `A password reset was requested for your Tech Deck account.\n\nClick the link below to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `
      <p>A password reset was requested for your Tech Deck account.</p>
      <p>Click the link below to reset your password (valid for 1 hour):</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, ignore this email.</p>
      <hr>
      <p style="color:#888;font-size:12px">Tech Deck — Built by Shotgun Ninjas Productions</p>
    `,
  });
}

export async function sendInvitationEmail(to: string, inviterName: string, tenantName: string, acceptUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: `${inviterName} invited you to ${tenantName} on Tech Deck`,
    text: `${inviterName} has invited you to join "${tenantName}" on Tech Deck.\n\nAccept the invitation:\n${acceptUrl}`,
    html: `
      <p><strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong> on Tech Deck.</p>
      <p><a href="${acceptUrl}">Accept invitation</a></p>
      <hr>
      <p style="color:#888;font-size:12px">Tech Deck — Built by Shotgun Ninjas Productions</p>
    `,
  });
}

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
