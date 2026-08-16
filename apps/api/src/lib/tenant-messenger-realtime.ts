import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client, type Notification } from 'pg';
import { db } from '../db.js';

const CHANNEL = 'operatoros_tenant_messenger_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TenantMessengerRealtimeEvent = {
  originId: string;
  tenantId: string;
  type: 'conversation.updated' | 'message.created' | 'message.updated' | 'presence.updated';
  conversationId?: string;
  messageId?: string;
  userId?: string;
  presence?: 'online' | 'offline';
  lastSeenAt?: string;
};

function parseEvent(payload: string | undefined): TenantMessengerRealtimeEvent | null {
  if (!payload || Buffer.byteLength(payload, 'utf8') > 2_048) return null;
  try {
    const value = JSON.parse(payload) as Partial<TenantMessengerRealtimeEvent>;
    if (!value.originId || !UUID.test(value.originId) || !value.tenantId || !UUID.test(value.tenantId)) return null;
    if (!['conversation.updated', 'message.created', 'message.updated', 'presence.updated'].includes(String(value.type))) return null;
    if (value.conversationId !== undefined && !UUID.test(value.conversationId)) return null;
    if (value.messageId !== undefined && !UUID.test(value.messageId)) return null;
    if (value.userId !== undefined && !UUID.test(value.userId)) return null;
    if (value.presence !== undefined && value.presence !== 'online' && value.presence !== 'offline') return null;
    if ((value.type === 'message.created' || value.type === 'message.updated') && (!value.conversationId || !value.messageId)) return null;
    if (value.type === 'conversation.updated' && !value.conversationId) return null;
    if (value.type === 'presence.updated' && (
      !value.userId
      || !value.presence
      || typeof value.lastSeenAt !== 'string'
      || value.lastSeenAt.length > 40
      || Number.isNaN(Date.parse(value.lastSeenAt))
    )) return null;
    return value as TenantMessengerRealtimeEvent;
  } catch {
    return null;
  }
}

export async function createTenantMessengerRealtimeBus(
  onEvent: (event: TenantMessengerRealtimeEvent) => void | Promise<void>,
) {
  const originId = crypto.randomUUID();
  let listener: Client | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let reconnecting = false;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect().catch(scheduleReconnect);
    }, 1_000);
    reconnectTimer.unref();
  };

  const connect = async () => {
    if (stopped || reconnecting || listener) return;
    reconnecting = true;
    const candidate = new Client({
      connectionString: process.env.DATABASE_URL,
      application_name: 'operatoros-tenant-messenger-realtime',
    });
    candidate.on('notification', (notification: Notification) => {
      if (notification.channel !== CHANNEL) return;
      const event = parseEvent(notification.payload);
      if (!event || event.originId === originId) return;
      void Promise.resolve(onEvent(event)).catch(() => undefined);
    });
    candidate.on('error', () => {
      if (listener === candidate) listener = null;
      void candidate.end().catch(() => undefined);
      scheduleReconnect();
    });
    candidate.on('end', () => {
      if (listener === candidate) listener = null;
      scheduleReconnect();
    });
    try {
      await candidate.connect();
      await candidate.query(`LISTEN ${CHANNEL}`);
      if (stopped) {
        await candidate.end();
        return;
      }
      listener = candidate;
    } catch (error) {
      await candidate.end().catch(() => undefined);
      throw error;
    } finally {
      reconnecting = false;
    }
  };

  await connect();

  return {
    originId,
    async publish(event: Omit<TenantMessengerRealtimeEvent, 'originId'>) {
      const payload = JSON.stringify({ ...event, originId });
      if (Buffer.byteLength(payload, 'utf8') > 2_048) {
        throw new Error('Tenant messenger realtime envelope exceeded its size limit');
      }
      await db.execute(sql`SELECT pg_notify(${CHANNEL}, ${payload})`);
    },
    async close() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const active = listener;
      listener = null;
      if (active) await active.end().catch(() => undefined);
    },
  };
}
