export interface PlanLimits {
  aiCredits: number;
  brands: number;
  campaigns: number;
  seats: number;
  storageMb: number;
  exports: number;
  publishedPages: number;
  templateAccess: "free" | "all";
  advancedAnalytics: boolean;
  aiWorkflows: boolean;
  strategyWorkspace: boolean;
  clientReview: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
  customIntegrations: boolean;
  monthlyPrice: number;
  annualPrice: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    aiCredits: 50, brands: 1, campaigns: 3, seats: 1, storageMb: 100, exports: 5, publishedPages: 1,
    templateAccess: "free", advancedAnalytics: false, aiWorkflows: false, strategyWorkspace: false,
    clientReview: false, whiteLabel: false, apiAccess: false, customIntegrations: false,
    monthlyPrice: 0, annualPrice: 0,
  },
  starter: {
    aiCredits: 200, brands: 3, campaigns: 10, seats: 2, storageMb: 500, exports: 20, publishedPages: 3,
    templateAccess: "free", advancedAnalytics: false, aiWorkflows: true, strategyWorkspace: false,
    clientReview: false, whiteLabel: false, apiAccess: false, customIntegrations: false,
    monthlyPrice: 1900, annualPrice: 1500,
  },
  growth: {
    aiCredits: 1000, brands: 10, campaigns: -1, seats: 5, storageMb: 2000, exports: 100, publishedPages: 10,
    templateAccess: "all", advancedAnalytics: true, aiWorkflows: true, strategyWorkspace: true,
    clientReview: false, whiteLabel: false, apiAccess: true, customIntegrations: false,
    monthlyPrice: 5900, annualPrice: 4700,
  },
  agency: {
    aiCredits: 5000, brands: 25, campaigns: -1, seats: 15, storageMb: 10000, exports: -1, publishedPages: 50,
    templateAccess: "all", advancedAnalytics: true, aiWorkflows: true, strategyWorkspace: true,
    clientReview: true, whiteLabel: true, apiAccess: true, customIntegrations: true,
    monthlyPrice: 14900, annualPrice: 11900,
  },
  enterprise: {
    aiCredits: 999999, brands: 999, campaigns: -1, seats: 999, storageMb: 100000, exports: -1, publishedPages: -1,
    templateAccess: "all", advancedAnalytics: true, aiWorkflows: true, strategyWorkspace: true,
    clientReview: true, whiteLabel: true, apiAccess: true, customIntegrations: true,
    monthlyPrice: 39900, annualPrice: 33900,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export type UsageType = "ai_credits" | "brands" | "campaigns" | "seats" | "storage" | "exports" | "published_pages";

export interface UsageCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  percentage: number;
  message?: string;
}

export const ADD_ON_CATALOG = [
  { id: "ai_credits_100", type: "ai_credits", name: "100 AI Credits", credits: 100, price: 999, description: "One-time pack of 100 additional AI credits" },
  { id: "ai_credits_500", type: "ai_credits", name: "500 AI Credits", credits: 500, price: 3999, description: "One-time pack of 500 additional AI credits" },
  { id: "ai_credits_2000", type: "ai_credits", name: "2,000 AI Credits", credits: 2000, price: 12999, description: "One-time pack of 2,000 additional AI credits" },
  { id: "storage_1gb", type: "storage", name: "1 GB Storage", amount: 1000, price: 499, description: "Additional 1 GB of storage" },
  { id: "storage_5gb", type: "storage", name: "5 GB Storage", amount: 5000, price: 1999, description: "Additional 5 GB of storage" },
  { id: "extra_seat", type: "seats", name: "Additional Seat", amount: 1, price: 999, description: "Add one team member seat", recurring: true },
  { id: "premium_templates", type: "templates", name: "Premium Templates", amount: 1, price: 2999, description: "Unlock all premium templates", recurring: true },
  { id: "white_label", type: "white_label", name: "White-Label Reports", amount: 1, price: 4999, description: "Custom branding on reports and exports", recurring: true },
  { id: "extra_pages_5", type: "published_pages", name: "5 Landing Pages", amount: 5, price: 1499, description: "5 additional published landing pages" },
  { id: "advanced_exports", type: "exports", name: "Advanced Export Pack", amount: 100, price: 1999, description: "100 additional exports per month" },
];
