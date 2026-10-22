import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isIndependentToolModuleSlug, isToolBridgeUuid } from '@operatoros/sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants, users } from '../schema.js';
import { authenticate } from '../lib/auth.js';
import { resolveTenantContext } from '../lib/tenant-auth.js';
import { getTenantMembership } from '../lib/tenant-entitlements.js';
import { toolModuleCatalogReadiness, toolPurchaseEligibility, type ToolPurchaseContext } from '../lib/tool-module-policy.js';
import { CLOSED_TOOL_COMMERCE, exactToolHttpsOrigin, type ToolCommerceConfiguration } from '../lib/tool-commerce.js';
import * as store from '../lib/tool-purchase-store.js';
import { createToolCheckoutForPurchase, ToolPurchaseProviderError } from '../lib/tool-purchase-provider.js';
import { signToolBridgeAssertion } from '../lib/tool-bridge-assertion.js';
import { inspectOfficeExitLinkRequest, proposeOfficeExitLink, ToolLinkRelayError } from '../lib/tool-link-relay.js';
import { readAcceptedToolArtifact, ToolArtifactDeliveryError } from '../lib/tool-artifact-delivery.js';
import { registerToolFulfillmentWorker } from '../lib/tool-fulfillment-worker.js';
import { reserveToolDownload } from '../lib/tool-download-lifetime.js';

async function memberContext(request: FastifyRequest, reply: FastifyReply): Promise<(ToolPurchaseContext & { tenantName: string }) | null> {
  reply.header('Cache-Control', 'no-store');
  const user = (request as any).user;
  const context = await resolveTenantContext(request);
  if (!context) { reply.code(404).send({ code: 'TENANT_NOT_FOUND' }); return null; }
  const [membership, rows, currentUsers] = await Promise.all([
    getTenantMembership(user.id, context.tenantId),
    db.select().from(tenants).where(eq(tenants.id, context.tenantId)).limit(1),
    db.select({ status: users.status }).from(users).where(eq(users.id, user.id)).limit(1),
  ]);
  const tenant = rows[0];
  // Platform support's synthetic owner context is never purchasing authority.
  if (!membership || !tenant || tenant.status === 'archived') { reply.code(404).send({ code: 'TENANT_NOT_FOUND' }); return null; }
  if (currentUsers[0]?.status !== 'active') { reply.code(403).send({ code: 'TOOL_USER_INACTIVE' }); return null; }
  if (tenant.status !== 'active') { reply.code(403).send({ code: 'TENANT_INACTIVE' }); return null; }
  return {
    userId: user.id, userStatus: user.status, tenantId: tenant.id, tenantStatus: tenant.status,
    ownerUserId: tenant.ownerUserId, tenantName: tenant.name,
    membership: { userId: membership.userId, tenantId: membership.tenantId, role: membership.role },
  };
}
async function ownerContext(request: FastifyRequest, reply: FastifyReply) {
  const context = await memberContext(request, reply);
  if (!context) return null;
  if (!toolPurchaseEligibility(context).eligible) { reply.code(403).send({ code: 'TOOL_PURCHASE_OWNER_REQUIRED' }); return null; }
  return context;
}
function sameOrigin(request: FastifyRequest, reply: FastifyReply, expected: string): boolean {
  if (request.headers.origin !== exactToolHttpsOrigin(expected)) {
    reply.code(403).send({ code: 'TOOL_REQUEST_ORIGIN_REQUIRED' }); return false;
  }
  return true;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function safePurchase(purchase: store.ToolPurchase) {
  return { id: purchase.id, tenantId: purchase.tenantId, toolSlug: purchase.toolSlug, status: purchase.status,
    revision: purchase.revision, amountMinor: purchase.snapshot.amountMinor, currency: purchase.snapshot.currency,
    coverage: purchase.snapshot.coverage, purchaseKind: 'one_time', policyReviewRequired: purchase.policyReviewRequired,
    createdAt: purchase.createdAt, updatedAt: purchase.updatedAt };
}

/** Dedicated purchase ledger. Stack subscriptions and generic module grants are never consulted. */
export async function registerToolModuleRoutes(app: FastifyInstance, configuration: ToolCommerceConfiguration = CLOSED_TOOL_COMMERCE,
  services: { checkout: typeof createToolCheckoutForPurchase; fetch?: typeof globalThis.fetch } = { checkout: createToolCheckoutForPurchase }) {
  registerToolFulfillmentWorker(app, configuration.officeexitDelivery);
  app.get('/v1/tools/catalog', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await memberContext(request, reply);
    return context ? toolModuleCatalogReadiness(context) : undefined;
  });

  app.get('/v1/tools/purchases', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await ownerContext(request, reply);
    if (!context) return;
    return { tenantId: context.tenantId, purchases: (await store.listTenantToolPurchases(context.tenantId)).map(safePurchase) };
  });
  app.get<{ Params: { slug: string } }>('/v1/tools/:slug/access', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await memberContext(request, reply);
    if (!context) return;
    if (!isIndependentToolModuleSlug(request.params.slug)) return reply.code(404).send({ code: 'TOOL_NOT_FOUND' });
    const purchase = await store.getTenantToolAccess(context.tenantId, request.params.slug);
    return { tenantId: context.tenantId, toolSlug: request.params.slug, purchased: !!purchase,
      coverage: purchase ? 'entire_tenant' : null, downloadsAvailable: false };
  });
  app.get<{ Params: { slug: string } }>('/v1/tools/:slug/download', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await memberContext(request, reply);
    if (!context) return;
    if (!isIndependentToolModuleSlug(request.params.slug)) return reply.code(404).send({ code: 'TOOL_NOT_FOUND' });
    const purchase = await store.getTenantToolAccess(context.tenantId, request.params.slug);
    if (!purchase) return reply.code(403).send({ code: 'TOOL_PURCHASE_REQUIRED' });
    const settleDownload = reserveToolDownload(reply.raw);
    if (!settleDownload) return reply.code(503).send({ code: 'TOOL_ARTIFACT_BUSY' });
    let artifact: Awaited<ReturnType<typeof readAcceptedToolArtifact>> | null = null;
    try {
      artifact = await readAcceptedToolArtifact(configuration.artifacts, request.params.slug);
      if (reply.raw.destroyed) return;
      // Revocation or membership removal during file validation must win.
      const current = await memberContext(request, reply);
      if (!current) return;
      if (reply.raw.destroyed) return;
      if (current.tenantId !== context.tenantId || !await store.getTenantToolAccess(current.tenantId, request.params.slug)) {
        return reply.code(403).send({ code: 'TOOL_PURCHASE_REQUIRED' });
      }
      if (reply.raw.destroyed) return;
      return reply.type('application/zip').header('Content-Disposition', `attachment; filename="${artifact.filename}"`)
        .header('X-Content-Type-Options', 'nosniff').header('Content-Length', artifact.content.length).send(artifact.content);
    } catch (error) {
      if (reply.raw.destroyed) return;
      if (error instanceof ToolArtifactDeliveryError) return reply.code(error.statusCode).send({ code: error.code });
      return reply.code(503).send({ code: 'TOOL_ARTIFACT_UNAVAILABLE' });
    } finally {
      artifact = null;
      settleDownload();
    }
  });
  app.post<{ Params: { slug: string } }>('/v1/tools/:slug/checkout', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await ownerContext(request, reply);
    if (!context) return;
    if (!isIndependentToolModuleSlug(request.params.slug)) return reply.code(404).send({ code: 'TOOL_NOT_FOUND' });
    if (!configuration.checkout.enabled) return reply.code(503).send({ code: 'TOOL_CHECKOUT_NOT_OPEN' });
    if (!sameOrigin(request, reply, configuration.checkout.publicOrigin)) return;
    const offer = configuration.checkout.offers[request.params.slug];
    if (!offer) return reply.code(503).send({ code: 'TOOL_OFFER_NOT_CONFIGURED' });
    if (!record(request.body) || Object.keys(request.body).length !== 1 || !isToolBridgeUuid(request.body.requestKey)) {
      return reply.code(422).send({ code: 'TOOL_CHECKOUT_INPUT_INVALID' });
    }
    try {
      const order = await store.createPendingToolPurchase({ tenantId: context.tenantId, userId: context.userId,
        toolSlug: request.params.slug, requestKey: request.body.requestKey, ...offer });
      const result = await services.checkout({ tenantId: context.tenantId, purchaseId: order.id,
        returnOrigin: configuration.checkout.publicOrigin });
      return { tenantId: context.tenantId, purchaseId: order.id, checkoutUrl: result.checkoutUrl };
    } catch (error) {
      if (error instanceof store.ToolPurchaseStoreError || error instanceof ToolPurchaseProviderError) {
        return reply.code(error.statusCode).send({ code: error.code });
      }
      throw error;
    }
  });
  app.get('/v1/tools/officeexit/link-configuration', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await ownerContext(request, reply);
    if (!context) return;
    const config = configuration.officeexitLink;
    return config.enabled ? { enabled: true, tenantId: context.tenantId,
      officeexitOrigin: exactToolHttpsOrigin(config.signing.audience) } : { enabled: false, tenantId: context.tenantId };
  });
  app.post('/v1/tools/officeexit/link-assertion', { preHandler: [authenticate] }, async (request, reply) => {
    const context = await ownerContext(request, reply);
    if (!context) return;
    if (!configuration.officeexitLink.enabled) return reply.code(503).send({ code: 'TOOL_LINKING_NOT_OPEN' });
    const config = configuration.officeexitLink.signing;
    if (!sameOrigin(request, reply, config.issuer)) return;
    const body = request.body;
    if (!record(body) || Object.keys(body).length !== 2 || !isToolBridgeUuid(body.officeexitOrganizationId) || !isToolBridgeUuid(body.officeexitUserId)) {
      return reply.code(422).send({ code: 'TOOL_LINK_INPUT_INVALID' });
    }
    const assertion = signToolBridgeAssertion(config, 'officeexit.mapping.link', {
      contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: context.tenantId,
      operatorosUserId: context.userId, officeexitOrganizationId: body.officeexitOrganizationId,
      officeexitUserId: body.officeexitUserId,
    });
    return { assertion, tenantId: context.tenantId, tenantName: context.tenantName.slice(0, 200) };
  });
  for (const action of ['resolve', 'approve'] as const) {
    app.post('/v1/tools/officeexit/link-requests/' + action, { preHandler: [authenticate] }, async (request, reply) => {
      const context = await ownerContext(request, reply);
      if (!context) return;
      if (!configuration.officeexitLink.enabled) return reply.code(503).send({ code: 'TOOL_LINKING_NOT_OPEN' });
      const signing = configuration.officeexitLink.signing;
      if (!sameOrigin(request, reply, signing.issuer)) return;
      if (!record(request.body) || Object.keys(request.body).length !== 1 || !isToolBridgeUuid(request.body.requestId)) {
        return reply.code(422).send({ code: 'TOOL_LINK_REQUEST_INVALID' });
      }
      try {
        const deps = { fetch: services.fetch ?? globalThis.fetch };
        const inspected = await inspectOfficeExitLinkRequest(signing, context, request.body.requestId, deps);
        if (action === 'resolve') return { ...inspected, tenantId: context.tenantId, tenantName: context.tenantName.slice(0, 200) };
        // The user/owner/membership may have changed during the remote request.
        const current = await ownerContext(request, reply);
        if (!current) return;
        if (current.tenantId !== context.tenantId || current.userId !== context.userId) return reply.code(409).send({ code: 'TOOL_LINK_IDENTITY_CHANGED' });
        return await proposeOfficeExitLink(signing, current, inspected, deps);
      } catch (error) {
        if (error instanceof ToolLinkRelayError) return reply.code(error.statusCode).send({ code: error.code });
        // Transport bodies, signed tokens and configuration secrets never enter responses.
        return reply.code(503).send({ code: 'TOOL_LINK_TRANSPORT_UNAVAILABLE' });
      }
    });
  }
}
