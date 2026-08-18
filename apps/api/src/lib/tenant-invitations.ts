import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { tenantInvites, tenants, tenantUsers, users } from '../schema.js';
import { writeAudit } from './audit.js';

type DatabaseExecutor = typeof db | any;

const PUBLIC_EMAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'gmx.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mail.com',
  'msn.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
]);

const INVITE_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export type TenantInvitationFailureCode =
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXPIRED'
  | 'INVITE_ALREADY_ACCEPTED'
  | 'INVITE_EMAIL_MISMATCH'
  | 'INVITE_TENANT_UNAVAILABLE';

export class TenantInvitationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: TenantInvitationFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'TenantInvitationError';
  }
}

export interface InvitationUser {
  id: string;
  email: string;
}

export interface InvitationAcceptance {
  membership: typeof tenantUsers.$inferSelect;
  tenantId: string;
  tenantName: string;
  alreadyAccepted: boolean;
}

export interface PendingInvitationReconciliation {
  joinedTenantIds: string[];
  currentTenantId: string | null;
}

export function isTenantInviteToken(value: unknown): value is string {
  return typeof value === 'string' && INVITE_TOKEN_PATTERN.test(value);
}

function emailDomain(email: string): string | null {
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return null;
  return email.slice(separator + 1).trim().toLowerCase();
}

function isSameBusinessDomain(inviteeEmail: string, ownerEmail: string): boolean {
  const inviteeDomain = emailDomain(inviteeEmail);
  const ownerDomain = emailDomain(ownerEmail);
  return Boolean(
    inviteeDomain &&
    ownerDomain &&
    inviteeDomain === ownerDomain &&
    !PUBLIC_EMAIL_DOMAINS.has(inviteeDomain),
  );
}

async function lockInvite(executor: DatabaseExecutor, token: string): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tenant-invite:' + token}))`);
}

async function lockMembership(executor: DatabaseExecutor, tenantId: string, userId: string): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tenant-membership:' + tenantId + ':' + userId}))`);
}

/**
 * Accept one opaque invitation inside the caller's database transaction.
 *
 * The invitation and tenant membership are serialized with transaction-level
 * advisory locks because legacy databases do not yet have a composite unique
 * constraint on tenant_users. A same-user retry is intentionally idempotent:
 * it returns the existing membership and restores the invited tenant as the
 * user's active tenant instead of turning a successful browser retry into a
 * false "already accepted" error.
 */
export async function acceptTenantInvitationWithDatabase(
  executor: DatabaseExecutor,
  input: {
    token: string;
    user: InvitationUser;
    request?: any;
    ipAddress?: string | null;
    action?: 'tenant_invite_accepted' | 'tenant_invite_registered' | 'tenant_invite_auto_accepted';
    setCurrentTenant?: boolean;
  },
): Promise<InvitationAcceptance> {
  if (!isTenantInviteToken(input.token)) {
    throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');
  }

  await lockInvite(executor, input.token);
  const [invite] = await executor.select().from(tenantInvites)
    .where(eq(tenantInvites.token, input.token)).limit(1);
  if (!invite) {
    throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');
  }
  if (invite.email.toLowerCase() !== input.user.email.toLowerCase()) {
    throw new TenantInvitationError(
      403,
      'INVITE_EMAIL_MISMATCH',
      'This invite was issued to a different email address',
    );
  }

  const [tenant] = await executor.select().from(tenants)
    .where(eq(tenants.id, invite.tenantId)).limit(1);
  if (!tenant || tenant.status !== 'active') {
    throw new TenantInvitationError(
      409,
      'INVITE_TENANT_UNAVAILABLE',
      'The organization for this invite is not currently available',
    );
  }

  await lockMembership(executor, invite.tenantId, input.user.id);
  const [existingMembership] = await executor.select().from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, invite.tenantId),
    eq(tenantUsers.userId, input.user.id),
  )).limit(1);

  if (invite.acceptedAt) {
    if (!existingMembership) {
      throw new TenantInvitationError(409, 'INVITE_ALREADY_ACCEPTED', 'Invite already accepted');
    }
    if (input.setCurrentTenant !== false) {
      await executor.update(users)
        .set({ currentTenantId: invite.tenantId, updatedAt: new Date() })
        .where(eq(users.id, input.user.id));
    }
    return {
      membership: existingMembership,
      tenantId: invite.tenantId,
      tenantName: tenant.name,
      alreadyAccepted: true,
    };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new TenantInvitationError(410, 'INVITE_EXPIRED', 'Invite has expired');
  }

  const [membership] = existingMembership
    ? [existingMembership]
    : await executor.insert(tenantUsers).values({
        tenantId: invite.tenantId,
        userId: input.user.id,
        role: invite.role,
      }).returning();

  const acceptedAt = new Date();
  await executor.update(tenantInvites)
    .set({ acceptedAt })
    .where(and(eq(tenantInvites.id, invite.id), isNull(tenantInvites.acceptedAt)));
  if (input.setCurrentTenant !== false) {
    await executor.update(users)
      .set({ currentTenantId: invite.tenantId, updatedAt: acceptedAt })
      .where(eq(users.id, input.user.id));
  }
  await writeAudit({
    actorUserId: input.user.id,
    tenantId: invite.tenantId,
    targetType: 'tenant_user',
    targetId: membership.id,
    action: input.action ?? 'tenant_invite_accepted',
    before: null,
    after: {
      id: membership.id,
      tenantId: membership.tenantId,
      userId: membership.userId,
      role: membership.role,
    },
    extra: { inviteId: invite.id },
    ipAddress: input.ipAddress ?? null,
  }, input.request, executor);

  return {
    membership,
    tenantId: invite.tenantId,
    tenantName: tenant.name,
    alreadyAccepted: false,
  };
}

/**
 * Recover an invitation that was missed after normal account creation.
 *
 * This is deliberately narrower than generic "domain auto-join": an active,
 * unexpired invitation must exist for the account's exact normalized email,
 * the tenant owner's domain must match, public mailbox domains are excluded,
 * and owner-role invitations still require the opaque link. Those conditions
 * preserve an administrator-authored grant without turning an email suffix
 * into tenant authority.
 */
export async function reconcilePendingBusinessInvitationsWithDatabase(
  executor: DatabaseExecutor,
  input: { user: InvitationUser; request?: any; ipAddress?: string | null },
): Promise<PendingInvitationReconciliation> {
  const normalizedEmail = input.user.email.trim().toLowerCase();
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tenant-invite-email:' + normalizedEmail}))`);
  const pendingInvites = await executor.select().from(tenantInvites).where(and(
    eq(tenantInvites.email, normalizedEmail),
    isNull(tenantInvites.acceptedAt),
  )).orderBy(desc(tenantInvites.createdAt));

  const joinedTenantIds: string[] = [];
  for (const invite of pendingInvites) {
    if (invite.expiresAt.getTime() < Date.now() || invite.role === 'owner') continue;
    const [tenant] = await executor.select().from(tenants)
      .where(eq(tenants.id, invite.tenantId)).limit(1);
    if (!tenant || tenant.status !== 'active') continue;
    const [owner] = await executor.select({ email: users.email }).from(users)
      .where(eq(users.id, tenant.ownerUserId)).limit(1);
    if (!owner || !isSameBusinessDomain(normalizedEmail, owner.email)) continue;

    const accepted = await acceptTenantInvitationWithDatabase(executor, {
      token: invite.token,
      user: input.user,
      request: input.request,
      ipAddress: input.ipAddress,
      action: 'tenant_invite_auto_accepted',
      setCurrentTenant: false,
    });
    if (!joinedTenantIds.includes(accepted.tenantId)) joinedTenantIds.push(accepted.tenantId);
  }

  const currentTenantId = joinedTenantIds[0] ?? null;
  if (currentTenantId) {
    await executor.update(users)
      .set({ currentTenantId, updatedAt: new Date() })
      .where(eq(users.id, input.user.id));
  }
  return { joinedTenantIds, currentTenantId };
}

