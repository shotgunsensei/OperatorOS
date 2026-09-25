import type { CoreProductKey } from '@operatoros/sdk';

/** Buying guidance only; pricing, connections and application access stay server-owned. */
export interface AudienceLane {
  slug: 'trades' | 'msps' | 'healthcare-legal';
  audience: string;
  product: string;
  productKey: CoreProductKey;
  accent: string;
  image: string;
  imageAlt: string;
  cardTitle: string;
  cardCopy: string;
  examples: string;
  headline: string;
  intro: string;
  benefits: readonly { title: string; copy: string }[];
  steps: readonly { title: string; copy: string }[];
  companions: readonly { slug: string; name: string; copy: string }[];
  connectionNote: string;
  faq: readonly { question: string; answer: string }[];
}

export const AUDIENCE_LANES: readonly AudienceLane[] = [
  {
    slug: 'trades', audience: 'Trade Companies', product: 'TradeFlowKit', productKey: 'tradeflowkit',
    accent: '#ffc17a', image: '/media/audiences/trades.webp',
    imageAlt: 'A trade business owner reviewing work beside a service van.',
    cardTitle: 'From first call to paid invoice.',
    cardCopy: 'Keep customers, quotes, jobs, and follow-ups together.',
    examples: 'HVAC · Electrical · Plumbing · Field services',
    headline: 'Less chasing.\nMore paid work.',
    intro: 'Know what needs a quote, who owns the next job, and which invoices need attention. TradeFlowKit keeps the whole job connected.',
    benefits: [
      { title: 'Keep every opportunity in sight', copy: 'Give each inquiry a next step so a busy day does not turn into a forgotten customer.' },
      { title: 'Send your team into the day prepared', copy: 'Keep the customer, schedule, job details, and assigned work in one place.' },
      { title: 'Follow the money without the guesswork', copy: 'See quotes, customer decisions, invoices, and recorded payments alongside the work.' },
    ],
    steps: [
      { title: 'Add the customer', copy: 'Start with an inquiry or choose a customer already saved in your business directory.' },
      { title: 'Plan and quote the job', copy: 'Set the next action, prepare a quote, and assign the work.' },
      { title: 'Keep the work moving', copy: 'Track tasks, dates, notes, and the customer decision as the job progresses.' },
      { title: 'Invoice and follow up', copy: 'Issue the invoice, collect or record payment, and see what still needs attention.' },
    ],
    companions: [
      { slug: 'snapproofos', name: 'SnapProofOS', copy: 'Turn field photos and findings into an approved customer report tied to the job.' },
      { slug: 'brandforgeos', name: 'BrandForge OS', copy: 'Prepare consistent brand and campaign material for the customers you want to reach.' },
    ],
    connectionNote: 'Online payments and outgoing messages need a connected, tested service. Accounting exports are available; a direct QuickBooks Online connection is still planned.',
    faq: [
      { question: 'Will I have to enter the same customer again?', answer: 'Save the customer in your organization’s shared directory, then select that record in TradeFlowKit, BrandForge OS, or SnapProofOS when you have access. Linked customer details stay current. Existing separate records need review before linking, and historical reports keep their approved details.' },
      { question: 'Can I start with the tools for my trade?', answer: 'Yes. Start with TradeFlowKit and choose the eligible companion that helps your team most. You can review current pricing and additional tools before purchasing.' },
      { question: 'Is QuickBooks already connected?', answer: 'No. Accounting exports are available. Direct QuickBooks Online sync is planned and is not included as a live connection today.' },
    ],
  },
  {
    slug: 'msps', audience: 'MSPs', product: 'TechDeck', productKey: 'techdeck',
    accent: '#7bdcff', image: '/media/audiences/msps.webp',
    imageAlt: 'An IT service professional reviewing a laptop beside network equipment.',
    cardTitle: 'Better service. Clearer handoffs.',
    cardCopy: 'Bring client requests, assets, and team knowledge together.',
    examples: 'Managed IT · Internal IT · Technical support',
    headline: 'Clear tickets.\nConfident handoffs.',
    intro: 'Give the next technician the full picture. TechDeck connects client support, equipment records, procedures, and service history so work can keep moving.',
    benefits: [
      { title: 'Know who owns the next step', copy: 'Keep client requests, assignments, time, and updates in one support workflow.' },
      { title: 'Put client context within reach', copy: 'Connect support work to equipment, network records, renewals, and useful history.' },
      { title: 'Make good fixes repeatable', copy: 'Keep procedures and evidence with the work so the next technician can pick it up.' },
    ],
    steps: [
      { title: 'Choose the client', copy: 'Start with the right organization and the issue that needs attention.' },
      { title: 'Assign the request', copy: 'Give the ticket an owner, a priority, and a clear next action.' },
      { title: 'Bring the details together', copy: 'Link the affected equipment, record service time, and use the right procedure.' },
      { title: 'Resolve and hand off', copy: 'Record what worked and leave the team a useful service history.' },
    ],
    companions: [
      { slug: 'ninjamation', name: 'Script Ops', copy: 'Review, version, and download reusable scripts. Approved work can become a TechDeck procedure; it does not run on endpoints automatically.' },
      { slug: 'faultlinelab', name: 'FaultlineLab', copy: 'Practice troubleshooting and prepare reviewed training drafts from resolved work. Included with every OperatorOS account.' },
    ],
    connectionNote: 'TechDeck organizes service work and recorded system information. It does not replace a connected endpoint management service. Direct Microsoft 365 and Google mailbox or calendar sync is still planned.',
    faq: [
      { question: 'Is TechDeck for MSPs or internal IT?', answer: 'Both. MSPs can organize client service work, while internal teams can use the same ticket, equipment, and documentation workflows for their organization.' },
      { question: 'Does Script Ops run commands on client devices?', answer: 'No. The current workflow prepares, reviews, versions, and downloads scripts. The handoff to TechDeck creates a draft procedure, not an unattended endpoint action.' },
      { question: 'Do teammates share one password?', answer: 'No. Each person has an OperatorOS account. Organization membership, roles, and purchased application access determine what they can use.' },
    ],
  },
  {
    slug: 'healthcare-legal', audience: 'Healthcare / Legal', product: 'PulseDesk', productKey: 'pulsedesk',
    accent: '#89e5d1', image: '/media/audiences/healthcare-legal.webp',
    imageAlt: 'An operations manager reviewing a tablet in a professional office corridor.',
    cardTitle: 'Keep the office moving.',
    cardCopy: 'Give internal requests, equipment, and follow-ups a clear owner.',
    examples: 'Healthcare operations · Legal-office operations',
    headline: 'Less office friction.\nMore work moving.',
    intro: 'Give every internal request a place, a priority, and an owner. PulseDesk helps teams coordinate facilities, equipment, supplies, and vendors.',
    benefits: [
      { title: 'Replace scattered requests', copy: 'Bring operations requests into a shared queue with clear responsibility and updates.' },
      { title: 'Catch delays sooner', copy: 'See service targets and escalation needs before a request is left waiting.' },
      { title: 'Keep a useful operations history', copy: 'Find the equipment, facility, supply, or vendor work behind a recurring problem.' },
    ],
    steps: [
      { title: 'Record the request', copy: 'Capture the operational need without patient information or confidential client-matter details.' },
      { title: 'Give it an owner', copy: 'Choose the right department, priority, and target for a response.' },
      { title: 'Coordinate the work', copy: 'Track updates, equipment, supplies, and vendor follow-up in the same place.' },
      { title: 'Close the loop', copy: 'Record the resolution and review response patterns to improve the next handoff.' },
    ],
    companions: [
      { slug: 'snapproofos', name: 'SnapProofOS', copy: 'Prepare reviewed facilities or equipment reports with approved photos and findings, without sensitive patient or client information.' },
      { slug: 'studyforge-ai', name: 'StudyForge AI', copy: 'Turn approved, non-sensitive training notes into reusable study material for your team.' },
    ],
    connectionNote: 'Requests can be entered or reviewed through the available intake workflows. Direct Microsoft 365, Google Workspace, SendGrid, and IMAP mailbox connections are not available in this release.',
    faq: [
      { question: 'How does PulseDesk fit a legal office?', answer: 'Use it for internal office requests: equipment issues, facilities, supplies, and vendor follow-up. PulseDesk is purpose-built for healthcare operations and can support these general office workflows. It does not provide legal case management, court deadlines, trust accounting, or client-matter records.' },
      { question: 'Can we store patient charts or sensitive case files?', answer: 'No. Keep patient charts, clinical decisions, and confidential legal case information in your approved specialist systems. This page makes no HIPAA or legal-compliance certification claim.' },
      { question: 'Can departments coordinate without losing responsibility?', answer: 'Yes. Assign the request, set a service target, record updates, and escalate delays while keeping ownership and operational history clear.' },
    ],
  },
];

export const lanePath = (lane: AudienceLane) => `/for/${lane.slug}` as const;
export const lanePricingPath = (lane: AudienceLane) => `/pricing?product=${lane.productKey}#build-stack`;
export function findAudienceLane(slug: string): AudienceLane | undefined {
  return AUDIENCE_LANES.find(lane => lane.slug === slug);
}
export function selectedCoreProduct(value: string | string[] | undefined): CoreProductKey {
  return AUDIENCE_LANES.find(lane => lane.productKey === value)?.productKey ?? 'tradeflowkit';
}
