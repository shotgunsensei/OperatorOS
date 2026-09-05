/**
 * Customer-facing value contracts for every canonical OperatorOS module.
 *
 * This is product-language authority only. It must not be used to infer
 * entitlement, price, plan, launch status, provider readiness, or permission.
 * Those decisions remain owned by the module catalog and server-side policy.
 */

export const MODULE_PRODUCT_VALUE_SLUGS = [
  'tradeflowkit',
  'pulsedesk',
  'techdeck',
  'torqueshed',
  'faultlinelab',
  'ninja-pool-hall',
  'brandforgeos',
  'snapproofos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
  'outcall',
] as const;

export type ModuleProductValueSlug = (typeof MODULE_PRODUCT_VALUE_SLUGS)[number];
export type NonEmptyProductValueList = readonly [string, ...string[]];

export interface ModulePrimaryWorkflow {
  /** Short customer-facing name for the outcome path. */
  name: string;
  /** Ordered actions a customer takes from setup to useful output. */
  steps: NonEmptyProductValueList;
  /** Observable result that tells the customer the workflow is complete. */
  completion: string;
}

export interface ModuleIntegrationBoundary {
  /** Connections already represented by the current product contract. */
  supported: NonEmptyProductValueList;
  /** Honest setup, approval, provider, or execution limit for those connections. */
  setupBoundary: string;
}

export interface ModuleProductValueContract {
  slug: ModuleProductValueSlug;
  /** One-sentence outcome promise used by catalog and marketing surfaces. */
  promise: string;
  /** Primary buyer or beneficiary, written in customer language. */
  buyer: string;
  /** The earliest concrete result a new customer can produce. */
  firstUsefulResult: string;
  /** Tangible work products the customer can keep, share, or act on. */
  deliverables: NonEmptyProductValueList;
  /** The primary end-to-end job the module helps the customer finish. */
  primaryWorkflow: ModulePrimaryWorkflow;
  /** Supported connections and the conditions required before they are live. */
  integrations: ModuleIntegrationBoundary;
}

export const MODULE_PRODUCT_VALUE_BY_SLUG = {
  tradeflowkit: {
    slug: 'tradeflowkit',
    promise: 'Move service work from first inquiry to paid invoice without losing the customer, next action, or cash status.',
    buyer: 'Owners and operations teams at service businesses',
    firstUsefulResult: 'Capture one lead, turn it into a scheduled job and quote, and see the next action needed to move the work forward.',
    deliverables: [
      'Customer and job records with clear owners, dates, tasks, and status',
      'Customer-ready quotes and invoices with decision and payment history',
      'Follow-up queues for new leads, active work, and unpaid balances',
      'Revenue and workload views calculated from recorded business activity',
    ],
    primaryWorkflow: {
      name: 'Lead-to-cash control loop',
      steps: [
        'Capture or add a qualified lead',
        'Convert the opportunity into a customer and scheduled job',
        'Assign the work and track completion',
        'Send a quote and record the customer decision',
        'Issue the invoice and collect or record payment',
        'Review follow-up and cash-flow priorities',
      ],
      completion: 'The work, customer decision, invoice, and payment status are connected in one traceable business record.',
    },
    integrations: {
      supported: [
        'Consent-aware public lead intake and messaging outbox',
        'Stripe Connect business-payment links and signed settlement updates',
        'Accounting exports and the shared OperatorOS business directory',
      ],
      setupBoundary: 'An organization administrator must configure and verify each connected service. TradeFlowKit never marks a queued message, payment request, refund, or export complete until the messaging, payment, or accounting service confirms it.',
    },
  },
  pulsedesk: {
    slug: 'pulsedesk',
    promise: 'Keep healthcare operations moving by routing facility, equipment, supply, and department requests before they become costly delays.',
    buyer: 'Healthcare operations leaders and service teams',
    firstUsefulResult: 'Turn one operational request into assigned work with an owner, service target, escalation path, and requester update.',
    deliverables: [
      'Prioritized operations queues with assignment and service-target status',
      'Equipment, facility, supply, vendor, and department work histories',
      'Requester updates, internal notes, time records, and attachments',
      'Operational trend and response reports without unnecessary patient data',
    ],
    primaryWorkflow: {
      name: 'Operational request-to-resolution',
      steps: [
        'Capture an operations-only request',
        'Classify it by facility, department, equipment, supply, or vendor need',
        'Assign an owner and service target',
        'Coordinate work and keep the requester informed',
        'Escalate items at risk of delay',
        'Close the request with resolution and response metrics',
      ],
      completion: 'The requester receives a clear resolution while the organization retains ownership, timing, and operational history.',
    },
    integrations: {
      supported: [
        'Authenticated operations-only public request intake',
        'OperatorOS directory, attachments, notifications, and shared reporting services',
        'Mailbox connection setup previews for planned operational-mailbox integrations',
      ],
      setupBoundary: 'PulseDesk is for operational coordination, not patient charts or clinical decisions. Direct SendGrid, IMAP, Google Workspace, and Microsoft 365 mailbox connections are not available in this release. Each imported or manually added request still requires operations-only review.',
    },
  },
  techdeck: {
    slug: 'techdeck',
    promise: 'Turn scattered support work and system risk into an accountable path from alert or request to verified client resolution.',
    buyer: 'MSPs, internal IT teams, and field technicians',
    firstUsefulResult: 'Record one client issue, connect it to the affected system and procedure, and leave the next technician a complete action trail.',
    deliverables: [
      'Client-linked tickets, assignments, service time, and portal updates',
      'Asset, network, lifecycle, warranty, and renewal records',
      'Versioned documentation, reviewed runbooks, and supporting evidence',
      'Client-ready operational, status, and compliance reports',
    ],
    primaryWorkflow: {
      name: 'Client risk-to-resolution',
      steps: [
        'Capture a request or system concern',
        'Connect the issue to the client, asset, and current service context',
        'Assign the technician and choose the reviewed procedure',
        'Record work, time, evidence, and client communication',
        'Verify the resolution and update service status',
        'Package the result for client review and future reuse',
      ],
      completion: 'The client issue is resolved with a reusable procedure, complete service history, and evidence ready for reporting.',
    },
    integrations: {
      supported: [
        'Signed outbound webhooks and revocable scoped API tokens',
        'Secure intake, client portal, public status, and licensing workflows',
        'OperatorOS directory, scheduling, attachments, and reporting services',
      ],
      setupBoundary: 'Administrators must verify every external connection and protected credential reference. Runbooks are reviewed guidance; TechDeck does not silently execute scripts or report an external system changed until the connected service confirms it.',
    },
  },
  torqueshed: {
    slug: 'torqueshed',
    promise: 'Turn vehicle symptoms and repair work into a clear diagnostic plan, complete workshop history, and proof you can share.',
    buyer: 'Vehicle owners, enthusiasts, mechanics, and repair shops',
    firstUsefulResult: 'Add one vehicle and create a diagnostic or service record that shows the concern, findings, and best next test or repair step.',
    deliverables: [
      'Portable vehicle, mileage, service, and repair history',
      'Diagnostic sessions with codes, tests, findings, and repair verification',
      'Build journals with stages, parts, labor, cost, and media',
      'Shareable repair reports, live-bay collaboration, and workshop exports',
    ],
    primaryWorkflow: {
      name: 'Concern-to-verified repair',
      steps: [
        'Add the vehicle and record the owner concern',
        'Capture codes, symptoms, observations, and prior work',
        'Choose and perform the next diagnostic test',
        'Record findings, parts, labor, and repair activity',
        'Verify the result and update vehicle history',
        'Share the customer-ready repair record when appropriate',
      ],
      completion: 'The vehicle history explains what was wrong, what was tested, what changed, and whether the repair was verified.',
    },
    integrations: {
      supported: [
        'OperatorOS AI and metered Torque Assist guidance',
        'Shared attachments, exports, notifications, and secure share links',
        'Approved SnapProofOS proof packages and FaultlineLab training drafts',
      ],
      setupBoundary: 'AI guidance supports—not replaces—physical diagnosis and technician judgment. Paid credits and connected-service results are recognized only after payment or completion is confirmed; no repair is performed automatically.',
    },
  },
  faultlinelab: {
    slug: 'faultlinelab',
    promise: 'Help technical teams practice difficult troubleshooting, prove how they reached an answer, and target the skills that need work next.',
    buyer: 'Technical team leads, trainers, and hands-on troubleshooters',
    firstUsefulResult: 'Complete one realistic diagnostic challenge and receive a scored result with the actions, evidence, and reasoning that produced it.',
    deliverables: [
      'Reusable diagnostic challenges with controlled versions',
      'Individual attempts with actions, findings, submissions, and scores',
      'Team assignments, progress views, and skill-development reports',
      'Portable attempt and outcome exports for coaching and review',
    ],
    primaryWorkflow: {
      name: 'Practice-to-skill improvement',
      steps: [
        'Choose or receive a role-relevant challenge',
        'Review the situation and investigate available clues',
        'Record diagnostic actions and unlock new evidence',
        'Submit the likely cause and recommended response',
        'Review the score, missed signals, and reasoning path',
        'Assign the next practice case based on the result',
      ],
      completion: 'The learner and manager can see demonstrated strengths, missed signals, and the next useful training action.',
    },
    integrations: {
      supported: [
        'OperatorOS team assignments, attachments, analytics, and exports',
        'Reviewed training drafts from resolved TechDeck and PulseDesk work',
        'Reviewed diagnostic training drafts from TorqueShed',
      ],
      setupBoundary: 'Imported operational cases must be reviewed and stripped of sensitive data before publication. Scores demonstrate performance in a training scenario; they do not grant system access or constitute an accredited certification.',
    },
  },
  'ninja-pool-hall': {
    slug: 'ninja-pool-hall',
    promise: 'Give every OperatorOS account a free place to practice 8-ball, challenge a teammate, and reconnect to protected online matches.',
    buyer: 'OperatorOS members, teams, and community players',
    firstUsefulResult: 'Start a practice, CPU, local two-player, or private online rack without purchasing another product.',
    deliverables: [
      'Full 8-ball practice and seeded CPU play',
      'Local hot-seat matches on one device',
      'Protected host-and-join rooms with reconnect recovery',
      'Player preferences and personal match history',
    ],
    primaryWorkflow: {
      name: 'Team or community match',
      steps: [
        'Choose practice, CPU, local, or online play',
        'Host or join the table when another player is involved',
        'Play the rack with complete 8-ball rules',
        'Reconnect to an online room if the connection drops',
        'Review the saved match result and start another rack',
      ],
      completion: 'Players finish a rules-based rack and retain the result or reconnectable room state appropriate to the selected mode.',
    },
    integrations: {
      supported: [
        'OperatorOS sign-in, organization membership, and included access',
        'Protected online rooms and server-checked match recovery',
        'Installable web-app and touch-friendly play surfaces',
      ],
      setupBoundary: 'Operator Pool Hall is a free team and community benefit. It does not provide wagering, paid competition, prizes, or independently certified rankings.',
    },
  },
  brandforgeos: {
    slug: 'brandforgeos',
    promise: 'Turn brand decisions into an approved, reusable campaign package your team can create, review, hand off, and measure together.',
    buyer: 'Founders, marketing teams, agencies, and creators',
    firstUsefulResult: 'Complete a brand brief and produce an on-brand campaign direction with audience, offer, message, calls to action, and visual guidance.',
    deliverables: [
      'Reusable brand kits, personas, offers, positioning, and voice guidance',
      'Campaign briefs, copy variants, ad prompts, calls to action, and landing content',
      'Reviewable creative assets, approvals, calendar items, and team comments',
      'Campaign reports, exports, recommendations, and recorded performance results',
    ],
    primaryWorkflow: {
      name: 'Brand brief-to-campaign package',
      steps: [
        'Capture the brand, audience, offer, objective, and constraints',
        'Choose a guided campaign or content workflow',
        'Generate copy and visual directions from the approved brand context',
        'Create or attach assets and review variants with the team',
        'Approve the package and schedule or export delivery work',
        'Record results and turn them into the next recommendation',
      ],
      completion: 'The team has an approved campaign package that is consistent with the brand and ready for a deliberate delivery decision.',
    },
    integrations: {
      supported: [
        'OperatorOS AI generation, shared usage, jobs, attachments, and exports',
        'Private SVG and PNG logo-concept exports for standard file import into Canva, Figma, and other design tools',
        'Reusable campaign inputs and an approved campaign package for Deploy Ops',
      ],
      setupBoundary: 'A person must approve generated copy, logos, images, and campaign assets. Direct advertising, social, email, analytics, CRM, and webhook connections are not available in this release; use reviewed exports and confirmation in the external tool. BrandForgeOS never claims that an asset was created, an ad was published, or a campaign was delivered without that confirmation.',
    },
  },
  snapproofos: {
    slug: 'snapproofos',
    promise: 'Turn field work into an approved customer-ready proof package with clear findings, costs, and controlled access.',
    buyer: 'Field-service teams, inspectors, contractors, and operations managers',
    firstUsefulResult: 'Create one job, assign the work, and capture a dated photo or note that is immediately tied to the right customer and task.',
    deliverables: [
      'Customer, job, assignment, and field-work records',
      'Dated photos, notes, findings, parts, labor, and supporting context',
      'Approved branded PDF and DOCX reports',
      'Expiring and revocable customer share links with access history',
    ],
    primaryWorkflow: {
      name: 'Assignment-to-approved proof package',
      steps: [
        'Create the customer job and assign field work',
        'Capture photos, notes, findings, parts, and labor',
        'Organize the evidence into the customer-facing template',
        'Review and approve the report snapshot',
        'Generate the requested document format',
        'Create a controlled-access link for delivery through the team’s approved channel',
      ],
      completion: 'The team has an approved report and controlled-access link whose included work and evidence trace back to the field assignment; external delivery or receipt is not claimed.',
    },
    integrations: {
      supported: [
        'Shared attachment upload, scanning, storage, export, and notification services',
        'TradeFlowKit job and approved-report connections',
        'TorqueShed diagnostic proof packages',
      ],
      setupBoundary: 'Uploads and generated documents depend on configured storage, scanning, and export workers. Only approved report snapshots may be shared publicly, and a share remains subject to expiry, revocation, and access controls.',
    },
  },
  'studyforge-ai': {
    slug: 'studyforge-ai',
    promise: 'Turn notes and course material into a complete study pack, focused practice, and a clear view of what to review next.',
    buyer: 'Learners, instructors, and teams building repeatable training',
    firstUsefulResult: 'Paste notes or lesson material and receive a reusable summary, key terms, flashcards, quiz, short-answer practice, review sheet, and study plan.',
    deliverables: [
      'Study sets and folders organized around the material you provide',
      'Summaries, key terms, flashcards, quizzes, and short-answer practice',
      'Review sheets and date-based study plans',
      'Session history, quiz review, progress trends, and portable exports',
    ],
    primaryWorkflow: {
      name: 'Notes-to-mastery study loop',
      steps: [
        'Add notes, a lesson, or other learning material',
        'Generate or build the complete study set',
        'Review and correct the learning material',
        'Practice with flashcards and focused sessions',
        'Take the quiz and inspect every explanation',
        'Use the result to plan the next review session',
      ],
      completion: 'The learner retains a reusable study pack plus a scored review showing the topics that need another pass.',
    },
    integrations: {
      supported: [
        'Built-in study-pack creation and optional OperatorOS AI refinement',
        'Team access, shared usage tracking, and activity history',
        'Portable JSON and CSV exports of study sets, progress, and results',
      ],
      setupBoundary: 'AI generation is optional and remains unavailable until an administrator connects the shared AI service. Review generated material against what you supplied; StudyForge AI does not add outside citations or certify that a learner has mastered a subject.',
    },
  },
  'ninja-launch-kit': {
    slug: 'ninja-launch-kit',
    promise: 'Turn one business brief into a coordinated campaign-launch package your team can review, export, and carry into its publishing tools.',
    buyer: 'Small-business owners, marketing teams, agencies, and campaign coordinators',
    firstUsefulResult: 'Choose a business template and receive landing copy, ads, email and SMS copy, social posts, FAQ, calls to action, flyer copy, a launch checklist, and visual-production briefs.',
    deliverables: [
      'Versioned landing, advertising, email, SMS, social, FAQ, flyer, and call-to-action copy',
      'Up to nine visual-production briefs, with the items included in the current plan clearly identified',
      'Reusable brand profiles, launch tasks, milestones, required files, and approval checks',
      'Downloadable text, Markdown, JSON, or CSV campaign packages with file verification',
    ],
    primaryWorkflow: {
      name: 'Business brief-to-campaign launch package',
      steps: [
        'Choose a business template and define the audience, offer, action, tone, channels, and deadline',
        'Generate the complete campaign package with built-in creation or approved AI refinement',
        'Review the copy and visual-production briefs against the actual offer and brand',
        'Assign and complete the launch tasks, milestones, files, and approval checks',
        'Create a verified campaign export for the people using the publishing tools',
        'Record external completion only after a person checks the published result and supplies a reference',
      ],
      completion: 'The team has a reviewed campaign package, a completed launch checklist, a traceable export, and a record of any launch a person verified in the publishing tool.',
    },
    integrations: {
      supported: [
        'OperatorOS AI-assisted campaign drafting with reliable built-in creation and shared usage tracking',
        'Shared attachments, activity, approvals, version history, and verified exports',
        'BrandForgeOS campaign-to-launch-package workflow',
      ],
      setupBoundary: 'Deploy Ops prepares campaign materials and records the human-reviewed package. It does not publish ads or websites, send campaigns, purchase media, change DNS, deploy software, or alter an external service. External completion requires a person to verify the result and record where it was confirmed.',
    },
  },
  'callcommand-ai': {
    slug: 'callcommand-ai',
    promise: 'Prepare and test a business receptionist that captures requests, routes approved next actions, and can move to live calls only after every provider and safety check passes.',
    buyer: 'Service businesses, MSPs, and teams with costly missed calls',
    firstUsefulResult: 'Configure one receptionist, run a no-cost simulation, and see the greeting, intake answers, routing path, and follow-up action before going live.',
    deliverables: [
      'Business receptionist profiles, knowledge, hours, and call flows',
      'Searchable call history, summaries, transcripts, outcomes, and follow-up actions',
      'Lead, task, alert, PulseDesk, TechDeck, and MSP follow-up workflows',
      'Phone-number setup, launch checks, usage, capacity, and service-health views',
    ],
    primaryWorkflow: {
      name: 'Missed-call-to-owned next action',
      steps: [
        'Choose the business use case and receptionist behavior',
        'Add approved business knowledge, hours, and routing rules',
        'Search for or connect the business number',
        'Run simulations and correct the conversation flow',
        'Complete every readiness check and deliberately enable live service',
        'Review captured opportunities, service work, and staff follow-up',
      ],
      completion: 'Each simulation—and each phone-service-confirmed live call after go-live acceptance—ends with a visible outcome and an owned follow-up.',
    },
    integrations: {
      supported: [
        'Twilio Programmable Voice, Verify, managed numbers, and signed callbacks',
        'OpenAI Realtime SIP and OperatorOS usage controls',
        'Stripe-managed capacity plus TradeFlowKit, PulseDesk, TechDeck, and MSP handoffs',
      ],
      setupBoundary: 'Setup and no-cost simulations are available today. Live service additionally requires administrator-supplied Twilio, OpenAI, Stripe, callback, and domain configuration plus a controlled phone-service test. Simulations and setup checks never count as successful live calls.',
    },
  },
  ninjamation: {
    slug: 'ninjamation',
    promise: 'Turn one-off infrastructure fixes into reviewed, versioned automation your team can safely reuse and download.',
    buyer: 'IT operators, MSP teams, and endpoint administrators',
    firstUsefulResult: 'Create or import one script, run static checks, and move an exact version through review to an approved download.',
    deliverables: [
      'Searchable PowerShell, Python, batch, and shell script library',
      'Exact versions with file verification, findings, requirements, and risk level',
      'Review, approval, rejection, retirement, and download history',
      'Governed AI drafts and approved script documentation handoffs',
    ],
    primaryWorkflow: {
      name: 'Draft-to-approved automation asset',
      steps: [
        'Create, import, or request a script draft',
        'Describe prerequisites, expected behavior, rollback, and risk',
        'Run server-side static analysis and address findings',
        'Submit the exact version for review',
        'Approve or reject it with a recorded decision',
        'Download the approved version for deliberate execution in an authorized tool',
      ],
      completion: 'The team has an exact, reviewed script version with the context needed to decide where and how to run it.',
    },
    integrations: {
      supported: [
        'OperatorOS AI drafting, shared usage, activity history, and team approvals',
        'Approved script-to-TechDeck runbook document, revision, and file-verification record',
        'Audited downloads for use in separately authorized execution tools',
      ],
      setupBoundary: 'Script Ops creates and reviews source; it does not execute scripts in the browser, web server, API process, or customer environment. AI drafts require human review, and downloading a script is not proof that it ran successfully.',
    },
  },
  outcall: {
    slug: 'outcall',
    promise: 'Prepare a discreet call to your own verified phone so you have a simple, private way to step away from an uncomfortable situation.',
    buyer: 'Individuals who want a private, planned exit-assistance option',
    firstUsefulResult: 'Acknowledge the safety limits, verify your own phone, choose a neutral call profile, and prepare an immediate or scheduled request.',
    deliverables: [
      'Verified-self phone setup and neutral call profiles',
      'Private exact-match trigger phrases',
      'Immediate or scheduled call requests with cancellation and history',
      'Password-confirmed private export and account-slice deletion',
    ],
    primaryWorkflow: {
      name: 'Verified-self exit call',
      steps: [
        'Review and accept the safety and non-emergency limits',
        'Verify the phone number you own and control',
        'Choose a neutral profile and optional private phrase',
        'Request the call now or schedule it for later',
        'Review, cancel, or privately remove the request history',
      ],
      completion: 'The requested call reaches only the verified self-owned destination and its actual provider outcome is shown honestly.',
    },
    integrations: {
      supported: [
        'Twilio Verify for verified-self ownership checks',
        'Controlled Twilio voice, SMS trigger, and DTMF callbacks',
        'OperatorOS account access, private export, and deletion controls',
      ],
      setupBoundary: 'OutCall is coming soon and must not be sold or launched until production activation, public callback, exact-host, and controlled real-provider acceptance are complete. It is not emergency response, monitoring, location tracking, duress detection, or a replacement for 911.',
    },
  },
} as const satisfies Record<ModuleProductValueSlug, ModuleProductValueContract>;

export const MODULE_PRODUCT_VALUES: readonly ModuleProductValueContract[] =
  MODULE_PRODUCT_VALUE_SLUGS.map((slug) => MODULE_PRODUCT_VALUE_BY_SLUG[slug]);

export function getModuleProductValue(slug: string): ModuleProductValueContract | undefined {
  return Object.prototype.hasOwnProperty.call(MODULE_PRODUCT_VALUE_BY_SLUG, slug)
    ? MODULE_PRODUCT_VALUE_BY_SLUG[slug as ModuleProductValueSlug]
    : undefined;
}
