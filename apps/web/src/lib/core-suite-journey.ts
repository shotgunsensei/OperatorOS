export type CoreSuiteModule = 'tradeflowkit' | 'techdeck' | 'pulsedesk';

interface JourneyStep {
  label: string;
  href: string;
  routes: readonly string[];
  guidance: string;
}

// These are navigation stages, never inferred record completion or authority.
export const CORE_SUITE_JOURNEYS: Record<CoreSuiteModule, { label: string; steps: readonly JourneyStep[] }> = {
  tradeflowkit: {
    label: 'Customer to payment',
    steps: [
      { label: 'Customer', href: '/customers', routes: ['customers', 'leads'], guidance: 'Start with the customer and the work they need. Convert a qualified lead to keep its details connected.' },
      { label: 'Quote', href: '/quotes', routes: ['quotes'], guidance: 'Confirm the scope and price with your customer. Review the quote before sending it.' },
      { label: 'Job', href: '/jobs', routes: ['jobs', 'tasks'], guidance: 'Set the owner and schedule, then work through the job tasks. Keep completion notes and proof with the job.' },
      { label: 'Invoice', href: '/invoices', routes: ['invoices'], guidance: 'Use the accepted quote or finished job to prepare the invoice. Review the linked customer, work, and balance.' },
      { label: 'Payment', href: '/payments', routes: ['payments'], guidance: 'Match the payment to its invoice and check the remaining balance. Keep the receipt with the customer record.' },
    ],
  },
  techdeck: {
    label: 'Request to resolution',
    steps: [
      { label: 'Triage', href: '/tickets', routes: ['tickets'], guidance: 'Confirm the impact, give the ticket an owner, and set response targets. Resolve it when the work has been verified.' },
      { label: 'Investigate', href: '/assets', routes: ['assets', 'network', 'lifecycle', 'runbooks', 'documentation'], guidance: 'Review the affected system and its procedures. Use runbooks to guide the technician through the checks.' },
      { label: 'Record work', href: '/evidence', routes: ['evidence', 'time'], guidance: 'Keep findings, time, and test results with the client and ticket so the next technician has the context.' },
      { label: 'Report', href: '/reports', routes: ['reports', 'compliance'], guidance: 'Review the service record and prepare the client report. Reuse a verified resolution in your team documentation.' },
    ],
  },
  pulsedesk: {
    label: 'Request to resolution',
    steps: [
      { label: 'Capture', href: '/requests', routes: ['requests'], guidance: 'Describe the operational need and its impact. Request numbers and configured response targets are added when you save.' },
      { label: 'Coordinate', href: '/assignments', routes: ['assignments'], guidance: 'Choose the responsible team, confirm ownership, and follow escalations before the handoff stalls.' },
      { label: 'Resolve', href: '/operations', routes: ['operations'], guidance: 'Coordinate the equipment, supplies, or facility work. Return to the linked request to record the outcome and resolve it.' },
      { label: 'Review', href: '/analytics', routes: ['analytics', 'knowledge'], guidance: 'Review response pressure and recurring needs. Turn useful resolutions into operational guidance for the team.' },
    ],
  },
};

export function getCoreSuiteJourney(moduleId: CoreSuiteModule, canonicalPath: string) {
  const local = canonicalPath.split(/[?#]/u, 1)[0].replace(/^\/(?:app\/)?(?:modules|apps)\/[^/]+/u, '');
  const root = local.split('/').filter(Boolean)[0] ?? '';
  const journey = CORE_SUITE_JOURNEYS[moduleId];
  const activeIndex = journey.steps.findIndex(step => step.routes.includes(root));
  return activeIndex < 0 ? null : { ...journey, activeIndex };
}
