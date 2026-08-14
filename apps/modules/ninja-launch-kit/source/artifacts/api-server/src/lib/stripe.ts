import Stripe from "stripe";
import type { PlanId } from "./features";

const SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
export const STRIPE_ENABLED = Boolean(SECRET_KEY);

let cached: Stripe | null = null;
export function getStripe(): Stripe {
  if (!SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!cached) {
    cached = new Stripe(SECRET_KEY);
  }
  return cached;
}

export const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
export const STRIPE_PUBLISHABLE_KEY = process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ?? "";

export const PRICE_IDS: Record<Exclude<PlanId, "free">, string | undefined> = {
  pro: process.env["STRIPE_PRO_PRICE_ID"],
  agency: process.env["STRIPE_AGENCY_PRICE_ID"],
};

export function priceToPlan(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === PRICE_IDS.pro) return "pro";
  if (priceId === PRICE_IDS.agency) return "agency";
  return null;
}

export function getAppBaseUrl(): string {
  const domains = (process.env["REPLIT_DOMAINS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (domains.length > 0) return `https://${domains[0]}`;
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "http://localhost:80";
}
