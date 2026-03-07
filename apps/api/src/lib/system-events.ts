import { db } from '../db.js';
import { systemEvents, systemNotifications } from '../schema.js';

export async function addSystemEvent(input: {
  workspaceId?: string | null;
  taskId?: string | null;
  source: string;
  type: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
  payload?: Record<string, unknown>;
}) {
  await db.insert(systemEvents).values({
    workspaceId: input.workspaceId ?? null,
    taskId: input.taskId ?? null,
    source: input.source,
    type: input.type,
    severity: input.severity ?? 'info',
    payload: input.payload ?? {},
  });
}

export async function addSystemNotification(input: {
  workspaceId?: string | null;
  title: string;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
}) {
  await db.insert(systemNotifications).values({
    workspaceId: input.workspaceId ?? null,
    title: input.title,
    message: input.message,
    level: input.level ?? 'info',
    read: false,
  });
}
