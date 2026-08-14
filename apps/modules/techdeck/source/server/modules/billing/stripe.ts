import Stripe from "stripe";
import { storage } from "../../storage";
import type { PlanLimits } from "@shared/schema";
import { getUncachableStripeClient } from "../../stripeClient";

let cachedStripeClient: Stripe | null = null;
let stripeInitialized = false;

export async function initStripeClient(): Promise<void> {
  try {
    cachedStripeClient = await getUncachableStripeClient();
    stripeInitialized = true;
    console.log("[billing] Stripe client initialized via Replit connector");
  } catch (err: any) {
    console.warn("[billing] Stripe not available:", err.message);
    stripeInitialized = false;
  }
}

export function getStripe(): Stripe {
  if (!cachedStripeClient) {
    throw new Error("Stripe client not initialized. Call initStripeClient() first.");
  }
  return cachedStripeClient;
}

export function isStripeConfigured(): boolean {
  return stripeInitialized && !!cachedStripeClient;
}

let priceMap: Record<string, string> = {};

export function setStripePriceMap(map: Record<string, string>): void {
  priceMap = map;
}

export function getStripePriceId(planCode: string): string | undefined {
  return priceMap[planCode];
}

export function getPlanCodeFromPriceId(priceId: string): string | undefined {
  for (const [code, id] of Object.entries(priceMap)) {
    if (id === priceId) return code;
  }
  return undefined;
}

export const DEFAULT_PLANS: Array<{
  code: string;
  name: string;
  monthlyPriceCents: number;
  limits: PlanLimits;
}> = [
  {
    code: "solo",
    name: "Solo",
    monthlyPriceCents: 0,
    limits: {
      usersMax: 1,
      storageGb: 1,
      reportsPerMonth: 5,
      webhooksMax: 2,
      apiEnabled: false,
      portalEnabled: false,
      statusEnabled: false,
      intakeEnabled: true,
      intakeSpacesMax: 1,
      intakeRequestsPerMonth: 5,
      intakeStorageGb: 1,
    },
  },
  {
    code: "pro",
    name: "Pro",
    monthlyPriceCents: 2900,
    limits: {
      usersMax: 5,
      storageGb: 25,
      reportsPerMonth: 50,
      webhooksMax: 10,
      apiEnabled: true,
      portalEnabled: true,
      statusEnabled: true,
      intakeEnabled: true,
      intakeSpacesMax: 5,
      intakeRequestsPerMonth: 50,
      intakeStorageGb: 10,
    },
  },
  {
    code: "msp",
    name: "MSP",
    monthlyPriceCents: 7900,
    limits: {
      usersMax: 25,
      storageGb: 100,
      reportsPerMonth: 500,
      webhooksMax: 50,
      apiEnabled: true,
      portalEnabled: true,
      statusEnabled: true,
      intakeEnabled: true,
      intakeSpacesMax: 25,
      intakeRequestsPerMonth: 500,
      intakeStorageGb: 50,
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    monthlyPriceCents: 29900,
    limits: {
      usersMax: 999,
      storageGb: 999,
      reportsPerMonth: 9999,
      webhooksMax: 999,
      apiEnabled: true,
      portalEnabled: true,
      statusEnabled: true,
      intakeEnabled: true,
      intakeSpacesMax: 999,
      intakeRequestsPerMonth: 9999,
      intakeStorageGb: 500,
    },
  },
];

export async function seedSubscriptionPlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    await storage.upsertSubscriptionPlan({
      code: plan.code,
      name: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      limits: plan.limits,
    });
  }
}
