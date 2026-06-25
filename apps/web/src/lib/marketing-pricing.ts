export interface MarketingPricingFaq {
  slug: string;
  question: string;
  answer: string;
}

export const marketingPricingFaqs: readonly MarketingPricingFaq[] = [
  {
    slug: 'what-is-operatoros',
    question: 'What is OperatorOS?',
    answer: 'OperatorOS is the free command layer for SSO, tenant and user management, billing, module launch, entitlement enforcement, and audit history.',
  },
  {
    slug: 'operatoros-cost',
    question: 'Do I pay for OperatorOS?',
    answer: 'No. OperatorOS itself is free. Billing begins when your tenant activates TradeFlowKit, PulseDesk, or TechDeck.',
  },
  {
    slug: 'core-product-inclusions',
    question: 'What comes with a core product?',
    answer: 'Every core product is fully unlocked and includes 5 operator seats, TorqueShed, FaultlineLab, Ninja Pool Hall, and one selectable companion module.',
  },
  {
    slug: 'included-seats',
    question: 'How many seats are included?',
    answer: 'Each active core product includes 5 operator seats for the tenant.',
  },
  {
    slug: 'additional-seats',
    question: 'Can I buy more seats?',
    answer: 'Yes. Additional operator seats are $15 per seat each month. The amount is configuration-driven so billing can be adjusted without changing product logic.',
  },
  {
    slug: 'included-apps',
    question: 'What apps are included with every paid product?',
    answer: 'TorqueShed, FaultlineLab, and Ninja Pool Hall are automatically included with any active core product.',
  },
  {
    slug: 'free-companion',
    question: 'How does the free companion module work?',
    answer: 'Choose one eligible companion module for $0. Tenant owners or admins can change that selection inside OperatorOS while the core subscription remains active.',
  },
  {
    slug: 'additional-modules',
    question: 'What do additional modules cost?',
    answer: 'Every companion module beyond the included selection costs $29 per month.',
  },
  {
    slug: 'pulsedesk-audience',
    question: 'Is PulseDesk only for healthcare?',
    answer: 'No. PulseDesk is purpose-built for healthcare operations, but any organization can use it for internal ticketing, inventory, assets, and operational coordination.',
  },
  {
    slug: 'cancellation',
    question: 'What happens if I cancel?',
    answer: 'Paid app entitlements and paid seat capacity end with the subscription. OperatorOS remains available as the free command layer, and billing history stays auditable.',
  },
] as const;
