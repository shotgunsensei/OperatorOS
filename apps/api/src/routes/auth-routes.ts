import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { users, passwordResetTokens, activityFeed } from '../schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authenticate,
  sanitizeUser,
} from '../lib/auth.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/v1/auth/register', async (request, reply) => {
    const { email, password, name } = request.body as any;

    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'Email, password, and name are required' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
      role: 'user',
      status: 'active',
    }).returning();

    await db.insert(activityFeed).values({
      userId: user.id,
      action: 'registered',
      entityType: 'user',
      entityId: user.id,
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { user: sanitizeUser(user), token };
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return reply.code(403).send({ error: 'Account suspended', suspended: true });
    }
    if (user.status === 'deleted') {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { user: sanitizeUser(user), token };
  });

  app.post('/v1/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  app.get('/v1/auth/me', { preHandler: [authenticate] }, async (request) => {
    return { user: sanitizeUser((request as any).user) };
  });

  app.post('/v1/auth/forgot-password', async (request, reply) => {
    const { email } = request.body as any;
    if (!email) {
      return reply.code(400).send({ error: 'Email is required' });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    return { message: 'If that email exists, a reset link has been sent.' };
  });

  app.post('/v1/auth/reset-password', async (request, reply) => {
    const { token, newPassword } = request.body as any;
    if (!token || !newPassword) {
      return reply.code(400).send({ error: 'Token and new password are required' });
    }
    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const [resetToken] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token)).limit(1);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return reply.code(400).send({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, resetToken.userId));
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));

    return { message: 'Password reset successfully' };
  });

  app.put('/v1/auth/profile', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const { name, avatarUrl } = request.body as any;
    const updates: any = { updatedAt: new Date() };
    if (name) updates.name = name.trim();
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

    const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
    return { user: sanitizeUser(updated) };
  });

  app.put('/v1/auth/change-password', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { currentPassword, newPassword } = request.body as any;

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Current and new password required' });
    }
    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
    return { message: 'Password changed successfully' };
  });
}
