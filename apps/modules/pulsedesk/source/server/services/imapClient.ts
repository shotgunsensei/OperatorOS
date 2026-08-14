import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedEmail } from "./emailProcessor";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  folder?: string;
  useOAuth?: boolean;
}

export interface FetchedImapEmail {
  uid: number;
  email: ParsedEmail;
}

function createClient(config: ImapConfig, socketTimeout = 15000) {
  const auth: any = config.useOAuth
    ? { user: config.user, accessToken: config.password }
    : { user: config.user, pass: config.password };

  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth,
    logger: false,
    greetingTimeout: 10000,
    socketTimeout,
  });
}

export async function testImapConnection(config: ImapConfig): Promise<{ success: boolean; error?: string; mailboxInfo?: { exists: number; unseen: number } }> {
  const folder = config.folder || "INBOX";
  const client = createClient(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const status = await client.status(folder, { messages: true, unseen: true });
      return {
        success: true,
        mailboxInfo: {
          exists: status.messages || 0,
          unseen: status.unseen || 0,
        },
      };
    } finally {
      lock.release();
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Connection failed" };
  } finally {
    try { await client.logout(); } catch {}
  }
}

export async function fetchUnseenEmails(config: ImapConfig, inboundAlias: string, maxMessages: number = 20): Promise<FetchedImapEmail[]> {
  const folder = config.folder || "INBOX";
  const client = createClient(config, 30000);
  const results: FetchedImapEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      if (!searchResult || searchResult.length === 0) return results;

      const uidsToFetch = searchResult.slice(0, maxMessages);

      for (const uid of uidsToFetch) {
        try {
          const message = await client.fetchOne(uid, { source: true }, { uid: true }) as any;
          if (!message?.source) continue;

          const parsed = await simpleParser(message.source as Buffer);

          const fromAddr = Array.isArray(parsed.from?.value)
            ? parsed.from.value[0]
            : parsed.from?.value;

          const toAddress = `${inboundAlias}@pulsedesk.support`;

          const email: ParsedEmail = {
            messageId: parsed.messageId || undefined,
            from: {
              email: fromAddr?.address || "unknown@unknown",
              name: fromAddr?.name || "",
            },
            to: toAddress,
            subject: parsed.subject || "(no subject)",
            bodyPlain: parsed.text || "",
            bodyHtml: parsed.html || "",
            inReplyTo: parsed.inReplyTo as string | undefined,
            references: Array.isArray(parsed.references)
              ? parsed.references.join(" ")
              : (parsed.references as string | undefined),
            headers: extractHeaders(parsed.headers),
            attachments: (parsed.attachments || []).map(a => ({
              filename: a.filename || "attachment",
              size: a.size || 0,
              contentType: a.contentType || "application/octet-stream",
            })),
            provider: "imap",
          };

          results.push({ uid, email });
        } catch (msgErr: any) {
          console.error(`[imap] Error processing UID ${uid}:`, msgErr.message);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch {}
  }

  return results;
}

export async function markMessagesSeen(config: ImapConfig, uids: number[]): Promise<void> {
  if (uids.length === 0) return;

  const folder = config.folder || "INBOX";
  const client = createClient(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      for (const uid of uids) {
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch {}
  }
}

function extractHeaders(headers: any): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  try {
    if (typeof headers.get === "function") {
      for (const key of ["from", "to", "subject", "date", "message-id", "in-reply-to", "references"]) {
        const val = headers.get(key);
        if (val) {
          result[key] = typeof val === "object" ? JSON.stringify(val) : String(val);
        }
      }
    }
  } catch {}
  return result;
}
