'use client';

import { getActiveTenantId } from './auth';

export interface MessengerMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  presence: 'online' | 'offline';
  lastSeenAt: string | null;
}

export interface MessengerParticipant {
  userId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'member';
  presence: 'online' | 'offline';
  lastSeenAt: string | null;
}

export interface MessengerMessage {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderName: string;
  senderAvatarUrl: string | null;
  clientMessageId: string;
  replyTo: { id: string; senderName: string; body: string | null; deleted: boolean } | null;
  body: string | null;
  version: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessengerConversation {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  participants: MessengerParticipant[];
  unreadCount: number;
  muted: boolean;
  version: number;
  lastMessage: {
    id: string;
    senderUserId: string | null;
    senderName: string;
    body: string | null;
    deleted: boolean;
    createdAt: string;
  } | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function messengerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tenantId = getActiveTenantId();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const response = await fetch(`/api/messenger${path}`, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw {
    status: response.status,
    code: body?.code ?? 'MESSENGER_REQUEST_FAILED',
    error: body?.error ?? 'Messenger request failed',
    requestId: body?.requestId ?? response.headers.get('x-request-id'),
  };
  return body as T;
}

export const tenantMessengerApi = {
  members: (search = '') => messengerRequest<{ members: MessengerMember[] }>(`/members${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  conversations: () => messengerRequest<{ conversations: MessengerConversation[]; unreadCount: number }>('/conversations'),
  conversation: (id: string) => messengerRequest<{ conversation: MessengerConversation }>(`/conversations/${encodeURIComponent(id)}`),
  createConversation: (participantUserIds: string[], title?: string) => messengerRequest<{ conversation: MessengerConversation }>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ participantUserIds, ...(title ? { title } : {}) }),
  }),
  messages: (conversationId: string, before?: string) => messengerRequest<{ messages: MessengerMessage[]; hasMore: boolean }>(
    `/conversations/${encodeURIComponent(conversationId)}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  ),
  send: (conversationId: string, input: { body: string; clientMessageId: string; replyToMessageId?: string | null }) => messengerRequest<{ message: MessengerMessage; duplicate: boolean }>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', body: JSON.stringify(input) },
  ),
  markRead: (conversationId: string) => messengerRequest<{ read: { conversationId: string; readAt: string } }>(
    `/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST' },
  ),
  editMessage: (conversationId: string, messageId: string, body: string, expectedVersion: number) => messengerRequest<{ message: MessengerMessage }>(
    `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'PATCH', body: JSON.stringify({ body, expectedVersion }) },
  ),
  deleteMessage: (conversationId: string, messageId: string, expectedVersion: number) => messengerRequest<{ message: MessengerMessage }>(
    `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' },
  ),
  updateConversation: (conversationId: string, input: { muted?: boolean; title?: string; expectedVersion?: number }) => messengerRequest<{ conversation: MessengerConversation }>(
    `/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  ),
  hideConversation: (conversationId: string) => messengerRequest<{ conversationId: string; hidden: boolean }>(
    `/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' },
  ),
};

export type MessengerSocketState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export class TenantMessengerSocket {
  private socket: WebSocket | null = null;
  private retryTimer: number | null = null;
  private attempt = 0;
  private stopped = false;

  constructor(
    private readonly tenantId: string,
    private readonly onEvent: (event: Record<string, any>) => void,
    private readonly onState: (state: MessengerSocketState) => void,
  ) {}

  connect() {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    this.onState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/v1/tenants/${encodeURIComponent(this.tenantId)}/messenger/socket`);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.onState('open');
      socket.send(JSON.stringify({ type: 'ping' }));
    });
    socket.addEventListener('message', event => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload && typeof payload === 'object') this.onEvent(payload);
      } catch { /* polling recovery intentionally handles malformed frames */ }
    });
    socket.addEventListener('close', event => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped || event.code === 1000 || [4403, 4404].includes(event.code)) {
        this.onState('closed');
        return;
      }
      this.attempt += 1;
      this.onState('reconnecting');
      const delay = Math.min(10_000, 500 * (2 ** Math.min(this.attempt, 5)));
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    });
    socket.addEventListener('error', () => socket.close());
  }

  close() {
    this.stopped = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.socket?.close(1000, 'Client closed');
    this.socket = null;
    this.onState('closed');
  }
}
