import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import {
  FIELDNODE_IDENTITY_CONTRACT_VERSION,
  FIELDNODE_IDENTITY_ISSUER,
  type FieldNodeIdentityMembershipRole,
  type FieldNodeIdentityModuleAccess,
  type FieldNodeIdentityResponse,
} from '../../../../packages/sdk/src/fieldnode-identity.js';
import { moduleAccessLevelToEffective } from '../lib/role-aliases.js';

interface PersistedMembership {
  userId: string;
  tenantId: string;
  role: string;
}

interface FieldNodeModulePolicy {
  tenantModuleStatus: string | null;
  explicitAccessLevel: string | null;
}

export interface FieldNodeIdentityDependencies {
  authenticate: preHandlerAsyncHookHandler;
  requireTenantMember: preHandlerAsyncHookHandler;
  requireModuleAccess: preHandlerAsyncHookHandler;
  readMembership(userId: string, tenantId: string): Promise<PersistedMembership | null>;
  readModulePolicy(userId: string, tenantId: string): Promise<FieldNodeModulePolicy | null>;
  now(): number;
}

async function defaultDependencies(): Promise<FieldNodeIdentityDependencies> {
  const [{ authenticate }, tenantAuth, { getTenantMembership }, { db }, schema, { and, eq }] = await Promise.all([
    import('../lib/auth.js'), import('../lib/tenant-auth.js'), import('../lib/tenant-entitlements.js'),
    import('../db.js'), import('../schema.js'), import('drizzle-orm'),
  ]);
  const { modules, tenantModules, tenantUserModuleAccess } = schema;
  return {
    authenticate,
    requireTenantMember: tenantAuth.requireTenantMember,
    requireModuleAccess: tenantAuth.requireTenantModuleAccess('fieldnode'),
    readMembership: getTenantMembership,
    async readModulePolicy(userId, tenantId) {
      const [policy] = await db.select({
        tenantModuleStatus: tenantModules.status,
        explicitAccessLevel: tenantUserModuleAccess.accessLevel,
      }).from(modules)
        .leftJoin(tenantModules, and(eq(tenantModules.moduleId, modules.id), eq(tenantModules.tenantId, tenantId)))
        .leftJoin(tenantUserModuleAccess, and(
          eq(tenantUserModuleAccess.moduleId, modules.id),
          eq(tenantUserModuleAccess.tenantId, tenantId),
          eq(tenantUserModuleAccess.userId, userId),
        ))
        .where(eq(modules.slug, 'fieldnode')).limit(1);
      return policy ?? null;
    },
    now: Date.now,
  };
}

function scopedSession(request: FastifyRequest, now: number) {
  const { user, authSession } = request as FastifyRequest & {
    user?: { id?: unknown; status?: unknown };
    authSession?: { sessionType?: unknown; moduleId?: unknown; tenantId?: unknown; userId?: unknown; exp?: unknown };
  };
  const identifier = (value: unknown): value is string => typeof value === 'string'
    && value.length > 0 && value.length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(value);
  if (!user || user.status !== 'active' || !authSession || authSession.sessionType !== 'module'
    || authSession.moduleId !== 'fieldnode' || !identifier(user.id)
    || authSession.userId !== user.id || !identifier(authSession.tenantId)) return null;
  const expiry = authSession.exp;
  if (typeof expiry !== 'number' || !Number.isSafeInteger(expiry) || expiry <= now / 1000
    || expiry > 8_640_000_000_000) return null;
  return { subject: user.id, tenantId: authSession.tenantId, expiry };
}

const membershipRoles = new Set<FieldNodeIdentityMembershipRole>(['owner', 'admin', 'member', 'viewer']);
const accessRank = { viewer: 0, user: 1, manager: 2 } as const;

export async function registerFieldNodeIdentityRoutes(
  app: FastifyInstance,
  dependencies?: FieldNodeIdentityDependencies,
) {
  const services = dependencies ?? await defaultDependencies();
  await app.register(async scope => {
    // Fail closed on guard/lookup outages without returning database details.
    scope.setErrorHandler((_error, _request, reply) => reply.code(503).send({
      error: 'FieldNode identity is temporarily unavailable', code: 'FIELDNODE_IDENTITY_UNAVAILABLE',
    }));
    scope.get('/v1/modules/fieldnode/identity', {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
        reply.header('Pragma', 'no-cache');
        reply.header('Referrer-Policy', 'no-referrer');
      },
      preHandler: [
        services.authenticate,
        async (request, reply) => {
          if (!scopedSession(request, services.now())) return reply.code(403).send({
            error: 'A current tenant-bound FieldNode module session is required', code: 'FIELDNODE_MODULE_SESSION_REQUIRED',
          });
        },
        services.requireTenantMember,
        services.requireModuleAccess,
      ],
    }, async (request, reply) => {
      const session = scopedSession(request, services.now());
      const context = (request as any).tenantContext as {
        tenantId?: string; status?: string; viaPlatformRole?: boolean;
      } | undefined;
      if (!session || !context || context.tenantId !== session.tenantId) return reply.code(403).send({
        error: 'FieldNode identity scope is not valid', code: 'FIELDNODE_IDENTITY_SCOPE_INVALID',
      });
      if (context.status !== 'active') return reply.code(403).send({
        error: 'An active organization is required', code: 'FIELDNODE_TENANT_INACTIVE',
      });
      const [membership, policy] = await Promise.all([
        services.readMembership(session.subject, session.tenantId),
        services.readModulePolicy(session.subject, session.tenantId),
      ]);
      if (!membership || membership.userId !== session.subject || membership.tenantId !== session.tenantId) {
        return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      }
      if (!membershipRoles.has(membership.role as FieldNodeIdentityMembershipRole)) return reply.code(403).send({
        error: 'A supported persisted membership is required', code: 'FIELDNODE_MEMBERSHIP_ROLE_UNSUPPORTED',
      });
      if (!policy) return reply.code(503).send({
        error: 'FieldNode identity is temporarily unavailable', code: 'FIELDNODE_IDENTITY_UNAVAILABLE',
      });
      const resolved = moduleAccessLevelToEffective((request as any).tenantModuleAccessLevel);
      const explicit = policy.explicitAccessLevel === null ? null : moduleAccessLevelToEffective(policy.explicitAccessLevel);
      if (resolved === 'none' || explicit === 'none'
        || (policy.tenantModuleStatus !== null && !['enabled', 'trial', 'purchased', 'beta'].includes(policy.tenantModuleStatus))) {
        return reply.code(403).send({ error: 'FieldNode module access is required', code: 'FIELDNODE_MODULE_ACCESS_DENIED' });
      }
      let moduleAccess: FieldNodeIdentityModuleAccess = resolved;
      if (explicit && accessRank[explicit] < accessRank[moduleAccess]) moduleAccess = explicit;
      // The tenant context is cached before the module resolver independently
      // reloads authority. Use that resolver's actual provenance as well: a
      // concurrent promotion must not turn an ungranted identity into manager.
      const platformDerived = context.viaPlatformRole || (request as any).moduleAccess?.source === 'admin_role';
      if (membership.role === 'viewer' || (platformDerived && explicit === null)) moduleAccess = 'viewer';
      // A lookup that outlasts the session cannot issue a fresh identity read.
      if (!scopedSession(request, services.now())) return reply.code(401).send({
        error: 'The FieldNode session has expired', code: 'FIELDNODE_SESSION_INVALID',
      });
      return {
        contractVersion: FIELDNODE_IDENTITY_CONTRACT_VERSION,
        issuer: FIELDNODE_IDENTITY_ISSUER,
        subject: session.subject,
        tenantId: session.tenantId,
        module: 'fieldnode',
        membershipRole: membership.role as FieldNodeIdentityMembershipRole,
        moduleAccessLevel: moduleAccess,
        sessionExpiresAt: new Date(session.expiry * 1000).toISOString(),
        authenticationAssurance: 'not_attested',
      } satisfies FieldNodeIdentityResponse;
    });
  });
}
