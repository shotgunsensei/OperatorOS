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
  example: { title: string; problem: string; actions: readonly string[]; result: string };
  faq: readonly { question: string; answer: string }[];
}

export const AUDIENCE_LANES: readonly AudienceLane[] = [
  {
    slug: 'trades', audience: 'Trade Companies', product: 'TradeFlowKit', productKey: 'tradeflowkit',
    accent: '#89e5b6', image: '/media/audiences/trades.webp',
    imageAlt: 'A trades professional reviewing a tablet in a service workshop.',
    cardTitle: 'From first call to paid invoice.',
    cardCopy: 'Keep customers, quotes, jobs, and follow-ups together.',
    examples: 'HVAC · Electrical · Plumbing · Field services',
    headline: 'From the first inquiry.\nTo the final invoice.',
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
    example: {
      title: 'A service job with a clear next step',
      problem: 'An HVAC inquiry arrives while the team is on another job. The quote, visit, and payment follow-up each need an owner.',
      actions: ['Save the customer and job; set the next task and visit date.', 'Prepare a quote and record the customer decision before work starts.', 'Keep completion notes and evidence with the job; invoice and follow up on the recorded balance.'],
      result: 'The team can open one job to see the customer, work, decision, and cash follow-up. Recurring service can use the same customer history.',
    },
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
    headline: 'Keep the evidence.\nMake the next fix easier.',
    intro: 'Give the next technician the client, affected system, attempted fixes, and verified result. TechDeck keeps tickets, time, evidence, and reviewed knowledge together.',
    benefits: [
      { title: 'Know who owns the next step', copy: 'Keep client requests, assignments, time, and updates in one support workflow.' },
      { title: 'Put client context within reach', copy: 'Connect support work to equipment, network records, renewals, and useful history.' },
      { title: 'Make good fixes repeatable', copy: 'Record a structured closeout, search exact identifiers, and prepare knowledge drafts with cited evidence for review.' },
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
    connectionNote: 'TechDeck records service work and system information. It does not execute scripts, discover networks, or monitor endpoints. Semantic search is disabled in the reviewed release. Direct Microsoft 365 and Google mailbox or calendar sync is still planned.',
    example: {
      title: 'A ticket the next technician can finish',
      problem: 'A recurring connection issue changes hands. The next technician needs to know which system was affected and what has already been tried.',
      actions: ['Link the client and system; assign the ticket and record service time.', 'Attach approved observations and test results; record attempted fixes and their outcomes.', 'Save a structured closeout and prepare a cited knowledge draft for review.'],
      result: 'The service history keeps the resolution and supporting evidence together. Exact-identifier search helps the team find the relevant record again.',
    },
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
    headline: 'Every request owned.\nEvery handoff visible.',
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
    example: {
      title: 'An equipment request with a visible owner',
      problem: 'An office reports a broken piece of equipment. Operations needs the location, urgency, responsible team, and a record of the fix.',
      actions: ['Capture an operations-only request with its location and category.', 'Assign an owner and service target; keep notes and requester updates with the work.', 'Record the closeout and review the equipment or facility history when the issue repeats.'],
      result: 'Departments can see the owner and next action without placing patient records or confidential legal matters in the operations queue.',
    },
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
