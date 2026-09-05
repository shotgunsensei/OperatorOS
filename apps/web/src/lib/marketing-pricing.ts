export interface MarketingPricingFaq {
  slug: string;
  question: string;
  answer: string;
}

export const marketingPricingFaqs: readonly MarketingPricingFaq[] = [
  {
    slug: 'what-is-operatoros',
    question: 'What is OperatorOS?',
    answer: 'OperatorOS is the free home base for one sign-in, team access, billing, and every application your organization uses.',
  },
  {
    slug: 'operatoros-cost',
    question: 'Do I pay for OperatorOS?',
    answer: 'No. OperatorOS itself is free. Billing begins when your organization activates TradeFlowKit, PulseDesk, or TechDeck.',
  },
  {
    slug: 'core-product-inclusions',
    question: 'What comes with a flagship application?',
    answer: 'The organization selects one flagship application for this release. Application Stack includes full access for 5 team members and one eligible organization-wide companion. TorqueShed, FaultlineLab, and Operator Pool Hall are included with every account.',
  },
  {
    slug: 'included-seats',
    question: 'How many seats are included?',
    answer: 'The organization’s Application Stack includes 5 team seats.',
  },
  {
    slug: 'additional-seats',
    question: 'Can I buy more seats?',
    answer: 'Yes. Additional team seats are $15 per seat each month.',
  },
  {
    slug: 'included-apps',
    question: 'Which apps are free with any account?',
    answer: 'TorqueShed, FaultlineLab, and Operator Pool Hall are free with any OperatorOS account — no paid subscription required. Just create a free account to start using them.',
  },
  {
    slug: 'free-companion',
    question: 'How does the included companion work?',
    answer: 'Choose one eligible organization-wide companion for $0. Only the organization owner can change that selection while the Application Stack subscription remains active.',
  },
  {
    slug: 'additional-modules',
    question: 'What do additional companions cost?',
    answer: 'Each eligible organization-wide companion beyond the included selection costs $29 per month.',
  },
  {
    slug: 'billing-interval',
    question: 'Can I pay annually?',
    answer: 'Not in this release. Application Stack is monthly-only, so checkout never presents a separate annual offer.',
  },
  {
    slug: 'pulsedesk-audience',
    question: 'Is PulseDesk only for healthcare?',
    answer: 'No. PulseDesk is purpose-built for healthcare operations, but any organization can use it for internal ticketing, inventory, assets, and operational coordination.',
  },
  {
    slug: 'cancellation',
    question: 'What happens if I cancel?',
    answer: 'Access to paid applications and extra seats ends with the subscription. OperatorOS remains available as your free home base — including TorqueShed, FaultlineLab, and Operator Pool Hall — and your billing history remains available.',
  },
] as const;
