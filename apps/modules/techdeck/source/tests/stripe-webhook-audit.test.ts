import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const storageMocks = vi.hoisted(() => ({
  getTenantSubscriptionByStripeCustomerId: vi.fn(),
  getTenantSubscriptionByStripeSubscriptionId: vi.fn(),
  getTenantSubscription: vi.fn(),
  updateTenantSubscription: vi.fn(),
  upsertTenantSubscription: vi.fn(),
}));

const emitEventMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../server/storage", () => ({ storage: storageMocks }));
vi.mock("../server/core/events/helpers", () => ({ emitEvent: emitEventMock }));
vi.mock("../server/webhookHandlers", () => ({
  WebhookHandlers: { processWebhook: vi.fn(async () => {}) },
}));
vi.mock("../server/modules/billing/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ subscriptions: { retrieve: vi.fn() } }),
  getPlanCodeFromPriceId: () => "pro",
}));

const { registerStripeWebhook } = await import("../server/modules/billing/webhook");

function makeApp(rawEvent: unknown) {
  const app = express();
  app.use((req: any, _res, next) => {
    req.rawBody = Buffer.from(JSON.stringify(rawEvent));
    next();
  });
  registerStripeWebhook(app);
  return app;
}

describe("legacy Stripe webhook audit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.getTenantSubscriptionByStripeCustomerId.mockResolvedValue({
      tenantId: "tenant-1",
      planCode: "pro",
    });
  });

  it("does not mutate local subscription state from invoice.paid", async () => {
    const event = {
      id: "evt_1",
      type: "invoice.paid",
      data: { object: { id: "in_1", customer: "cus_1" } },
    };

    const res = await request(makeApp(event))
      .post("/api/stripe/webhook")
      .set("stripe-signature", "test")
      .send("ignored");

    expect(res.status).toBe(200);
    expect(storageMocks.updateTenantSubscription).not.toHaveBeenCalled();
    expect(storageMocks.upsertTenantSubscription).not.toHaveBeenCalled();
    expect(emitEventMock).toHaveBeenCalledWith(
      "billing.subscription_updated",
      "tenant-1",
      undefined,
      "tenant_subscription",
      "tenant-1",
      expect.objectContaining({ legacyAuditOnly: true, status: "active", invoiceId: "in_1" }),
    );
  });
});
