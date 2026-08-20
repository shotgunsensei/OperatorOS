import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { tenantInvites, tenants, tenantUsers, users } from '../schema.js';
import { writeAudit } from './audit.js';

type DatabaseExecutor = typeof db | any;

const INVITE_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export type TenantInvitationFailureCode =
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXPIRED'
  | 'INVITE_ALREADY_ACCEPTED'
  | 'INVITE_DECLINED'
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

export interface InvitationDecline {
  tenantId: string;
  tenantName: string;
  alreadyDeclined: boolean;
}

export interface InvitationRegistrationContext {
  invite: typeof tenantInvites.$inferSelect;
  tenant: typeof tenants.$inferSelect;
}

export function isTenantInviteToken(value: unknown): value is string {
  return typeof value === 'string' && INVITE_TOKEN_PATTERN.test(value);
}

async function lockInvite(executor: DatabaseExecutor, token: string): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tenant-invite:' + token}))`);
}

async function lockMembership(executor: DatabaseExecutor, tenantId: string, userId: string): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tenant-membership:' + tenantId + ':' + userId}))`);
}

/**
 * Validate and lock an invitation before creating a new account from its
 * email link. Account creation remains separate from the later explicit
 * accept/decline decision.
 */
export async function getPendingTenantInvitationForRegistrationWithDatabase(
  executor: DatabaseExecutor,
  token: string,
): Promise<InvitationRegistrationContext> {
  if (!isTenantInviteToken(token)) {
    throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');
  }

  await lockInvite(executor, token);
  const [invite] = await executor.select().from(tenantInvites)
    .where(eq(tenantInvites.token, token)).limit(1);
  if (!invite) throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');
  if (invite.acceptedAt) {
    throw new TenantInvitationError(409, 'INVITE_ALREADY_ACCEPTED', 'Invite already accepted');
  }
  if (invite.declinedAt) {
    throw new TenantInvitationError(409, 'INVITE_DECLINED', 'Invite has been declined');
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new TenantInvitationError(410, 'INVITE_EXPIRED', 'Invite has expired');
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
  return { invite, tenant };
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
  if (invite.declinedAt) {
    throw new TenantInvitationError(409, 'INVITE_DECLINED', 'Invite has been declined');
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
    await executor.update(users)
      .set({ currentTenantId: invite.tenantId, updatedAt: new Date() })
      .where(eq(users.id, input.user.id));
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
    .where(and(
      eq(tenantInvites.id, invite.id),
      isNull(tenantInvites.acceptedAt),
      isNull(tenantInvites.declinedAt),
    ));
  await executor.update(users)
    .set({ currentTenantId: invite.tenantId, updatedAt: acceptedAt })
    .where(eq(users.id, input.user.id));
  await writeAudit({
    actorUserId: input.user.id,
    tenantId: invite.tenantId,
    targetType: 'tenant_user',
    targetId: membership.id,
    action: 'tenant_invite_accepted',
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
 * Record an authenticated recipient's explicit refusal without changing
 * tenant membership or active-tenant selection. Same-recipient retries are
 * idempotent; an accepted invitation cannot later be reclassified as declined.
 */
export async function declineTenantInvitationWithDatabase(
  executor: DatabaseExecutor,
  input: { token: string; user: InvitationUser; request?: any; ipAddress?: string | null },
): Promise<InvitationDecline> {
  if (!isTenantInviteToken(input.token)) {
    throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');
  }

  await lockInvite(executor, input.token);
  const [invite] = await executor.select().from(tenantInvites)
    .where(eq(tenantInvites.token, input.token)).limit(1);
  if (!invite) throw new TenantInvitationError(404, 'INVITE_NOT_FOUND', 'Invite not found');
  if (invite.email.toLowerCase() !== input.user.email.toLowerCase()) {
    throw new TenantInvitationError(
      403,
      'INVITE_EMAIL_MISMATCH',
      'This invite was issued to a different email address',
    );
  }

  const [tenant] = await executor.select().from(tenants)
    .where(eq(tenants.id, invite.tenantId)).limit(1);
  const tenantName = tenant?.name ?? 'the organization';
  if (invite.acceptedAt) {
    throw new TenantInvitationError(409, 'INVITE_ALREADY_ACCEPTED', 'Invite already accepted');
  }
  if (invite.declinedAt) {
    return { tenantId: invite.tenantId, tenantName, alreadyDeclined: true };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new TenantInvitationError(410, 'INVITE_EXPIRED', 'Invite has expired');
  }

  const declinedAt = new Date();
  await executor.update(tenantInvites)
    .set({ declinedAt })
    .where(and(
      eq(tenantInvites.id, invite.id),
      isNull(tenantInvites.acceptedAt),
      isNull(tenantInvites.declinedAt),
    ));
  await writeAudit({
    actorUserId: input.user.id,
    tenantId: invite.tenantId,
    targetType: 'tenant_invite',
    targetId: invite.id,
    action: 'tenant_invite_declined',
    before: null,
    after: { id: invite.id, email: invite.email, role: invite.role, declinedAt },
    ipAddress: input.ipAddress ?? null,
  }, input.request, executor);

  return { tenantId: invite.tenantId, tenantName, alreadyDeclined: false };
}

