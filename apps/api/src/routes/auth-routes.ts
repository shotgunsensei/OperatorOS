import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { users, passwordResetTokens, revokedSessionTokens, tenantInvites } from '../schema.js';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authenticate,
  sanitizeUser,
  logAudit,
  logUserActivity,
  recordFailedLogin,
  resetFailedLogins,
  sessionNeedsRefresh,
} from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate-limiter.js';
import {
  ensureFreeAccountAppsWithDatabase,
  ensurePersonalTenantWithDatabase,
} from '../lib/saas-db-init.js';
import {
  getSessionClearCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../../../../packages/auth/index.js';
import { enforcePlatformPublicAuthHost } from '../lib/public-auth-host.js';
import {
  acceptTenantInvitationWithDatabase,
  isTenantInviteToken,
  reconcilePendingBusinessInvitationsWithDatabase,
  TenantInvitationError,
} from '../lib/tenant-invitations.js';

const AUTH_IP_RATE_LIMIT = 10;
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_PER_ACCOUNT_LIMIT = 4;

function getIp(request: any): string {
  return (request.ip as string) ?? 'unknown';
}

function setAuthResponseHeaders(reply: any) {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Referrer-Policy', 'no-referrer');
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

function validateEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return 'Email is required';
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) return 'Invalid email format';
  if (trimmed.length > 255) return 'Email too long';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > 128) return 'Password too long';
  return null;
}

function validateName(name: string): string | null {
  if (!name || typeof name !== 'string' || name.trim().length === 0) return 'Name is required';
  if (name.trim().length > 100) return 'Name too long';
  return null;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/v1/auth/register', async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const ip = getIp(request);
    if (!checkRateLimit(`register:${ip}`, AUTH_IP_RATE_LIMIT, AUTH_RATE_WINDOW_MS)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' });
    }

    const { email, password, name } = request.body as any;

    const emailErr = validateEmail(email);
    if (emailErr) return reply.code(400).send({ error: emailErr, code: 'VALIDATION_ERROR' });
    const passErr = validatePassword(password);
    if (passErr) return reply.code(400).send({ error: passErr, code: 'VALIDATION_ERROR' });
    const nameErr = validateName(name);
    if (nameErr) return reply.code(400).send({ error: nameErr, code: 'VALIDATION_ERROR' });

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0) {
      return reply.code(202).send({ ok: true });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.transaction(async tx => {
      const [createdUser] = await tx.insert(users).values({
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        role: 'user',
        status: 'active',
      }).onConflictDoNothing({ target: users.email }).returning();

      // A concurrent request may have won the unique-email race. Preserve
      // the non-enumerating response without mutating that existing account.
      if (!createdUser) return null;

      const { tenant } = await ensurePersonalTenantWithDatabase(tx, createdUser);
      await ensureFreeAccountAppsWithDatabase(tx, tenant.id, createdUser.id);
      await reconcilePendingBusinessInvitationsWithDatabase(tx, {
        user: createdUser,
        request,
        ipAddress: request.ip,
      });
      return createdUser;
    });

    if (!user) return reply.code(202).send({ ok: true });

    await logUserActivity(user.id, 'registered', 'user', user.id);
    await logAudit(user.id, 'user_registered', user.id, { email: normalizedEmail });

    return reply.code(202).send({ ok: true });
  });

  // Invitation-specific registration is a single password-and-join
  // transaction. The opaque token proves possession of the invitation
  // capability for the invited address,
  // so the browser never has to carry invitation state through the separate
  // auth.operatoros.net sessionStorage origin or ask a new user to sign in a
  // second time immediately after choosing a password.
  app.post('/v1/auth/register-with-invite', async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const ip = getIp(request);
    if (!checkRateLimit(`register:${ip}`, AUTH_IP_RATE_LIMIT, AUTH_RATE_WINDOW_MS)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' });
    }

    const { token, password, name } = (request.body ?? {}) as any;
    if (!isTenantInviteToken(token)) {
      return reply.code(404).send({ error: 'Invite not found', code: 'INVITE_NOT_FOUND' });
    }
    const passErr = validatePassword(password);
    if (passErr) return reply.code(400).send({ error: passErr, code: 'VALIDATION_ERROR' });
    const nameErr = validateName(name);
    if (nameErr) return reply.code(400).send({ error: nameErr, code: 'VALIDATION_ERROR' });

    const passwordHash = await hashPassword(password);
    try {
      const created = await db.transaction(async tx => {
        const [invite] = await tx.select().from(tenantInvites)
          .where(eq(tenantInvites.token, token)).limit(1);
        if (!invite) throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');

        const normalizedEmail = invite.email.trim().toLowerCase();
        const [existing] = await tx.select({ id: users.id }).from(users)
          .where(eq(users.email, normalizedEmail)).limit(1);
        if (existing) {
          const conflict: any = new Error('An account already exists for this invited email. Sign in to join the organization.');
          conflict.statusCode = 409;
          conflict.code = 'INVITE_ACCOUNT_EXISTS';
          throw conflict;
        }

        const [createdUser] = await tx.insert(users).values({
          email: normalizedEmail,
          passwordHash,
          name: name.trim(),
          role: 'user',
          status: 'active',
        }).onConflictDoNothing({ target: users.email }).returning();
        if (!createdUser) {
          const conflict: any = new Error('An account already exists for this invited email. Sign in to join the organization.');
          conflict.statusCode = 409;
          conflict.code = 'INVITE_ACCOUNT_EXISTS';
          throw conflict;
        }

        const acceptance = await acceptTenantInvitationWithDatabase(tx, {
          token,
          user: createdUser,
          request,
          ipAddress: request.ip,
          action: 'tenant_invite_registered',
        });
        const [updatedUser] = await tx.select().from(users)
          .where(eq(users.id, createdUser.id)).limit(1);
        return { user: updatedUser, acceptance };
      });

      await logUserActivity(created.user.id, 'registered', 'user', created.user.id, {
        source: 'tenant_invite',
        tenantId: created.acceptance.tenantId,
      });
      const sessionToken = signToken({
        userId: created.user.id,
        email: created.user.email,
        role: created.user.role,
        tokenVersion: created.user.tokenVersion,
        sessionType: 'platform',
      });
      reply.setCookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
      return reply.code(201).send({
        user: sanitizeUser(created.user),
        tenantId: created.acceptance.tenantId,
        tenantName: created.acceptance.tenantName,
        membership: created.acceptance.membership,
      });
    } catch (error: any) {
      if (error instanceof TenantInvitationError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      if (error?.code === 'INVITE_ACCOUNT_EXISTS') {
        return reply.code(409).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.post('/v1/auth/login', async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const ip = getIp(request);
    if (!checkRateLimit(`login:${ip}`, AUTH_IP_RATE_LIMIT, AUTH_RATE_WINDOW_MS)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' });
    }

    const { email, password } = request.body as any;

    const emailErr = validateEmail(email);
    if (emailErr) return reply.code(400).send({ error: emailErr, code: 'VALIDATION_ERROR' });
    if (!password || typeof password !== 'string') {
      return reply.code(400).send({ error: 'Password is required', code: 'VALIDATION_ERROR' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!checkRateLimit(`login:${ip}:${normalizedEmail}`, LOGIN_PER_ACCOUNT_LIMIT, AUTH_RATE_WINDOW_MS)) {
      return reply.code(429).send({ error: 'Too many login attempts for this account. Please try again later.', code: 'RATE_LIMITED' });
    }

    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await logAudit(user.id, 'login_failed', user.id, { reason: 'account_locked', minutesLeft }, request.ip);
      return reply.code(403).send({
        error: `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
        code: 'ACCOUNT_LOCKED',
        lockedUntil: user.lockedUntil.toISOString(),
      });
    }

    if (user.status === 'suspended') {
      await logAudit(user.id, 'login_failed', user.id, { reason: 'account_suspended' }, request.ip);
      return reply.code(403).send({ error: 'Account suspended. Contact support for assistance.', code: 'ACCOUNT_SUSPENDED', suspended: true });
    }
    if (user.status === 'deleted') {
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await recordFailedLogin(user.id);
      await logAudit(user.id, 'login_failed', user.id, { reason: 'wrong_password' }, request.ip);
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    await resetFailedLogins(user.id);
    const loginState = await db.transaction(async tx => {
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const onboarding = await reconcilePendingBusinessInvitationsWithDatabase(tx, {
        user,
        request,
        ipAddress: request.ip,
      });
      const [refreshedUser] = await tx.select().from(users).where(eq(users.id, user.id)).limit(1);
      return { user: refreshedUser, onboarding };
    });
    await logAudit(user.id, 'login_success', user.id, { email: normalizedEmail }, request.ip);

    const token = signToken({
      userId: loginState.user.id,
      email: loginState.user.email,
      role: loginState.user.role,
      tokenVersion: loginState.user.tokenVersion,
      sessionType: 'platform',
    });

    reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return { user: sanitizeUser(loginState.user), onboarding: loginState.onboarding };
  });

  const logoutHandler = async (request: any, reply: any) => {
    const user = (request as any).user;
    const session = (request as any).authSession;
    const tokenHash = (request as any).authTokenFingerprint;
    if (!tokenHash || typeof session?.exp !== 'number') {
      return reply.code(500).send({ error: 'Session metadata unavailable', code: 'SESSION_METADATA_MISSING' });
    }
    await db.insert(revokedSessionTokens).values({
      tokenHash,
      userId: user.id,
      sessionType: session.sessionType,
      tenantId: session.tenantId ?? null,
      moduleId: session.moduleId ?? null,
      expiresAt: new Date(session.exp * 1000),
      reason: 'local_logout',
    }).onConflictDoNothing();
    await logAudit(user.id, 'logout', user.id, {
      scope: 'current_host_session',
      sessionType: session.sessionType,
      moduleId: session.moduleId ?? null,
    }, request.ip);
    reply.clearCookie(SESSION_COOKIE_NAME, getSessionClearCookieOptions());
    return { ok: true };
  };
  app.post('/v1/auth/logout', { preHandler: [authenticate] }, logoutHandler);
  app.post('/api/auth/logout', { preHandler: [authenticate] }, logoutHandler);

  const globalLogoutHandler = async (request: any, reply: any) => {
    setAuthResponseHeaders(reply);
    const user = (request as any).user;
    await db.update(users)
      .set({ tokenVersion: sql`token_version + 1`, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await logAudit(user.id, 'logout_all', user.id, { scope: 'all_operatoros_hosts' }, request.ip);
    reply.clearCookie(SESSION_COOKIE_NAME, getSessionClearCookieOptions());
    return { ok: true, revokedAllSessions: true };
  };
  app.post('/v1/auth/logout-all', { preHandler: [authenticate] }, globalLogoutHandler);
  app.post('/api/auth/logout-all', { preHandler: [authenticate] }, globalLogoutHandler);

  const meHandler = async (request: any) => {
    const session = (request as any).authSession;
    let authoritativeUser = (request as any).user;
    if (session?.sessionType === 'platform') {
      authoritativeUser = await db.transaction(async tx => {
        await reconcilePendingBusinessInvitationsWithDatabase(tx, {
          user: authoritativeUser,
          request,
          ipAddress: request.ip,
        });
        const [refreshed] = await tx.select().from(users)
          .where(eq(users.id, authoritativeUser.id)).limit(1);
        return refreshed;
      });
    }
    const user = sanitizeUser(authoritativeUser) as Record<string, unknown>;
    if (session?.sessionType === 'module' && session.tenantId && session.moduleId) {
      user.currentTenantId = session.tenantId;
      return {
        user,
        session: {
          type: 'module',
          tenantId: session.tenantId,
          moduleId: session.moduleId,
        },
      };
    }
    return { user, session: { type: 'platform' } };
  };
  app.get('/v1/auth/me', { preHandler: [authenticate] }, meHandler);
  app.get('/api/auth/me', { preHandler: [authenticate] }, meHandler);

  const refreshHandler = async (request: any, reply: any) => {
    setAuthResponseHeaders(reply);
    const user = request.user;
    const session = request.authSession;
    if (!session || typeof session.exp !== 'number' || !request.authTokenFingerprint) {
      return reply.code(500).send({ error: 'Session metadata unavailable', code: 'SESSION_METADATA_MISSING' });
    }

    if (!sessionNeedsRefresh(session)) {
      return {
        ok: true,
        refreshed: false,
        expiresAt: new Date(session.exp * 1000).toISOString(),
      };
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: session.sessionType,
      ...(session.sessionType === 'module'
        ? { tenantId: session.tenantId, moduleId: session.moduleId }
        : {}),
    });

    await db.insert(revokedSessionTokens).values({
      tokenHash: request.authTokenFingerprint,
      userId: user.id,
      sessionType: session.sessionType,
      tenantId: session.tenantId ?? null,
      moduleId: session.moduleId ?? null,
      expiresAt: new Date(session.exp * 1000),
      reason: 'session_refresh',
    }).onConflictDoNothing();
    reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    await logAudit(user.id, 'session_refreshed', user.id, {
      scope: session.sessionType,
      moduleId: session.moduleId ?? null,
    }, request.ip);
    return { ok: true, refreshed: true };
  };
  app.post('/v1/auth/refresh', { preHandler: [authenticate] }, refreshHandler);
  app.post('/api/auth/refresh', { preHandler: [authenticate] }, refreshHandler);

  app.post('/v1/auth/forgot-password', async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const ip = getIp(request);
    if (!checkRateLimit(`forgot:${ip}`, AUTH_IP_RATE_LIMIT, AUTH_RATE_WINDOW_MS)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' });
    }

    const { email } = request.body as any;
    const emailErr = validateEmail(email);
    if (emailErr) return reply.code(400).send({ error: emailErr, code: 'VALIDATION_ERROR' });

    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (user && user.status === 'active') {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      await logAudit(user.id, 'password_reset_requested', user.id, {}, request.ip);
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  });

  app.post('/v1/auth/reset-password', async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const { token, newPassword } = request.body as any;
    if (!token || typeof token !== 'string') {
      return reply.code(400).send({ error: 'Reset token is required', code: 'VALIDATION_ERROR' });
    }
    const passErr = validatePassword(newPassword);
    if (passErr) return reply.code(400).send({ error: passErr, code: 'VALIDATION_ERROR' });

    const [resetToken] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token)).limit(1);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return reply.code(400).send({ error: 'Invalid or expired reset token', code: 'INVALID_TOKEN' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({
      passwordHash,
      tokenVersion: sql`token_version + 1`,
      updatedAt: new Date(),
    }).where(eq(users.id, resetToken.userId));
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));

    await resetFailedLogins(resetToken.userId);
    await logAudit(resetToken.userId, 'password_reset_completed', resetToken.userId, {}, request.ip);

    return { message: 'Password reset successfully' };
  });

  app.put('/v1/auth/profile', { preHandler: [authenticate] }, async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const user = (request as any).user;
    const { name, avatarUrl } = request.body as any;
    const updates: any = { updatedAt: new Date() };

    if (name !== undefined) {
      const nameErr = validateName(name);
      if (nameErr) return reply.code(400).send({ error: nameErr, code: 'VALIDATION_ERROR' });
      updates.name = name.trim();
    }
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

    const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
    await logAudit(user.id, 'profile_updated', user.id, { fields: Object.keys(updates).filter(k => k !== 'updatedAt') }, request.ip);
    return { user: sanitizeUser(updated) };
  });

  app.put('/v1/auth/change-password', { preHandler: [authenticate] }, async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    setAuthResponseHeaders(reply);
    const user = (request as any).user;
    const { currentPassword, newPassword } = request.body as any;

    if (!currentPassword || typeof currentPassword !== 'string') {
      return reply.code(400).send({ error: 'Current password is required', code: 'VALIDATION_ERROR' });
    }
    const passErr = validatePassword(newPassword);
    if (passErr) return reply.code(400).send({ error: passErr, code: 'VALIDATION_ERROR' });

    if (currentPassword === newPassword) {
      return reply.code(400).send({ error: 'New password must be different from current password', code: 'SAME_PASSWORD' });
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      await logAudit(user.id, 'password_change_failed', user.id, { reason: 'wrong_current_password' }, request.ip);
      return reply.code(401).send({ error: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' });
    }

    const passwordHash = await hashPassword(newPassword);
    const [updated] = await db.update(users).set({
      passwordHash,
      tokenVersion: sql`token_version + 1`,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id)).returning();
    await logAudit(user.id, 'password_changed', user.id, {}, request.ip);
    await logUserActivity(user.id, 'password_changed', 'user', user.id);

    const token = signToken({
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      tokenVersion: updated.tokenVersion,
      sessionType: 'platform',
    });

    reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return { user: sanitizeUser(updated), message: 'Password changed successfully' };
  });

  app.put('/v1/auth/change-email', { preHandler: [authenticate] }, async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    setAuthResponseHeaders(reply);
    const user = (request as any).user;
    const { newEmail, password } = request.body as any;

    const emailErr = validateEmail(newEmail);
    if (emailErr) return reply.code(400).send({ error: emailErr, code: 'VALIDATION_ERROR' });
    if (!password || typeof password !== 'string') {
      return reply.code(400).send({ error: 'Password is required to change email', code: 'VALIDATION_ERROR' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Password is incorrect', code: 'INVALID_CREDENTIALS' });
    }

    const normalizedEmail = newEmail.toLowerCase().trim();
    if (normalizedEmail === user.email) {
      return reply.code(400).send({ error: 'New email is the same as current email', code: 'SAME_EMAIL' });
    }

    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      return reply.code(409).send({ error: 'Email already in use', code: 'EMAIL_EXISTS' });
    }

    const oldEmail = user.email;
    const [updated] = await db.update(users).set({
      email: normalizedEmail,
      tokenVersion: sql`token_version + 1`,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id)).returning();
    await logAudit(user.id, 'email_changed', user.id, { oldEmail, newEmail: normalizedEmail }, request.ip);
    await logUserActivity(user.id, 'email_changed', 'user', user.id, { oldEmail, newEmail: normalizedEmail });

    const token = signToken({
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      tokenVersion: updated.tokenVersion,
      sessionType: 'platform',
    });

    reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return { user: sanitizeUser(updated), message: 'Email updated successfully' };
  });

  app.post('/v1/auth/request-deletion', { preHandler: [authenticate] }, async (request, reply) => {
    if (!enforcePlatformPublicAuthHost(request, reply)) return reply;
    const user = (request as any).user;
    const { password } = request.body as any;

    if (!password || typeof password !== 'string') {
      return reply.code(400).send({ error: 'Password is required to delete account', code: 'VALIDATION_ERROR' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Password is incorrect', code: 'INVALID_CREDENTIALS' });
    }

    if (user.role === 'admin') {
      return reply.code(400).send({ error: 'Admin accounts cannot self-delete. Contact another admin.', code: 'ADMIN_CANNOT_SELF_DELETE' });
    }

    await db.update(users).set({
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));

    await logAudit(user.id, 'account_deletion_requested', user.id, {}, request.ip);
    await logUserActivity(user.id, 'account_deleted', 'user', user.id);

    reply.clearCookie(SESSION_COOKIE_NAME, getSessionClearCookieOptions());
    return { ok: true, message: 'Account has been deleted' };
  });
}
