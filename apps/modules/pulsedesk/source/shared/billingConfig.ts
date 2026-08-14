export const PLAN_KEYS = ['free', 'pro', 'pro_plus', 'enterprise', 'unlimited'] as const;
export type PlanKey = typeof PLAN_KEYS[number];

export const BILLING_PLANS: Record<PlanKey, {
  label: string;
  price: number;
  metaKey: string;
  maxMembers: number | typeof Infinity;
  maxTickets: number | typeof Infinity;
  entraEnabled: boolean;
  emailToTicket: boolean;
  priceEnvVar: string | null;
  features: string[];
}> = {
  free: {
    label: 'Free',
    price: 0,
    metaKey: 'free',
    maxMembers: 5,
    maxTickets: Infinity,
    entraEnabled: false,
    emailToTicket: false,
    priceEnvVar: null,
    features: [
      'Up to 5 team members',
      'Unlimited tickets',
      'Department management',
      'Equipment tracking',
      'Local login only',
    ],
  },
  pro: {
    label: 'Pro',
    price: 60,
    metaKey: 'pro',
    maxMembers: 50,
    maxTickets: Infinity,
    entraEnabled: true,
    emailToTicket: false,
    priceEnvVar: 'STRIPE_PRICE_ID_PRO',
    features: [
      'Up to 50 team members',
      'Unlimited tickets',
      'Microsoft 365 / Entra SSO',
      'Priority support',
      'Vendor management',
      'Analytics dashboard',
    ],
  },
  pro_plus: {
    label: 'Pro Plus',
    price: 80,
    metaKey: 'pro_plus',
    maxMembers: 100,
    maxTickets: Infinity,
    entraEnabled: true,
    emailToTicket: false,
    priceEnvVar: 'STRIPE_PRICE_ID_PRO_PLUS',
    features: [
      'Up to 100 team members',
      'Unlimited tickets',
      'Microsoft 365 / Entra SSO',
      'Priority support',
      'Advanced analytics',
      'Custom role mappings',
    ],
  },
  enterprise: {
    label: 'Enterprise',
    price: 100,
    metaKey: 'enterprise',
    maxMembers: 200,
    maxTickets: Infinity,
    entraEnabled: true,
    emailToTicket: true,
    priceEnvVar: 'STRIPE_PRICE_ID_ENTERPRISE',
    features: [
      'Up to 200 team members',
      'Unlimited tickets',
      'Microsoft 365 / Entra SSO',
      'Email-to-Ticket automation',
      'Dedicated support',
      'Advanced analytics',
      'Custom integrations',
      'SLA management',
    ],
  },
  unlimited: {
    label: 'Unlimited',
    price: 200,
    metaKey: 'unlimited',
    maxMembers: Infinity,
    maxTickets: Infinity,
    entraEnabled: true,
    emailToTicket: true,
    priceEnvVar: 'STRIPE_PRICE_ID_UNLIMITED',
    features: [
      'Unlimited team members',
      'Unlimited tickets',
      'Microsoft 365 / Entra SSO',
      'Email-to-Ticket automation',
      'White-glove support',
      'All features included',
      'Custom integrations',
      'SLA management',
      'API access',
    ],
  },
};

export const PLAN_LIMITS = Object.fromEntries(
  (Object.entries(BILLING_PLANS) as [PlanKey, typeof BILLING_PLANS[PlanKey]][]).map(([key, plan]) => [
    key,
    {
      maxMembers: plan.maxMembers,
      maxTickets: plan.maxTickets,
      entraEnabled: plan.entraEnabled,
      emailToTicket: plan.emailToTicket,
      label: plan.label,
      price: plan.price,
    },
  ])
) as Record<PlanKey, { maxMembers: number | typeof Infinity; maxTickets: number | typeof Infinity; entraEnabled: boolean; emailToTicket: boolean; label: string; price: number }>;

export const ALLOWED_PLAN_META_KEYS: string[] = ['pro', 'pro_plus', 'enterprise', 'unlimited'];

export function getPlanByMetaKey(key: string): PlanKey | null {
  if (ALLOWED_PLAN_META_KEYS.includes(key)) return key as PlanKey;
  return null;
}

export function getAllowedPlanMetaKeys(): string[] {
  return ALLOWED_PLAN_META_KEYS;
}
