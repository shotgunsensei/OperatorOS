export interface ModuleSetupGuide {
  firstTask: string;
  services: string;
  check: string;
  nextStep: string;
  setupHref: string;
}

const connections = 'https://app.operatoros.net/?page=tenant-shared-services';

/** Setup instructions describe requirements, never a customer's live connection status. */
export const MODULE_SETUP_GUIDES: Record<string, ModuleSetupGuide> = {
  operatoros: {
    firstTask: 'Choose your organization, invite a teammate, and open an app included in your plan.',
    services: 'Resend handles account email. Stripe handles subscriptions. Your administrator connects these services once for the platform.',
    check: 'Confirm that an invitation arrives and the recipient can join the intended organization.',
    nextStep: 'Review shared services', setupHref: connections,
  },
  tradeflowkit: {
    firstTask: 'Add a customer, prepare a quote, and turn accepted work into an invoice.',
    services: 'Online payments need the supported Stripe connection. Email delivery needs the platform email service. You can prepare records before either is connected.',
    check: 'Complete an approved test payment and confirm that the invoice shows the payment after reloading.',
    nextStep: 'Open payment settings', setupHref: 'https://tradeflowkit.operatoros.net/settings',
  },
  techdeck: {
    firstTask: 'Create a support ticket, assign it, record the work, and resolve it.',
    services: 'Ticket tracking works inside OperatorOS. External notifications and connected tools need separate setup. Saving a script does not run it on a device.',
    check: 'Have a second team member reopen the ticket and confirm its owner, notes, and resolution.',
    nextStep: 'Review connections', setupHref: connections,
  },
  pulsedesk: {
    firstTask: 'Create an operational request, route it to a department, and record the resolution.',
    services: 'Direct requests are available without a mailbox connection. Automatic mailbox import is not available yet. Keep patient and clinical information out of requests.',
    check: 'Confirm that the assigned team can see the request and that its updates remain after reloading.',
    nextStep: 'Review email availability', setupHref: 'https://pulsedesk.operatoros.net/integrations',
  },
  torqueshed: {
    firstTask: 'Add a vehicle, record its symptoms and tests, then document the repair result.',
    services: 'Vehicle and service records do not need an external service. AI assistance needs the configured AI service and any required credits.',
    check: 'Reopen a saved diagnosis and confirm that the tests, findings, and repair result are present.',
    nextStep: 'Open your garage', setupHref: 'https://torqueshed.operatoros.net/garage',
  },
  faultlinelab: {
    firstTask: 'Choose a challenge, investigate the evidence, and submit your findings.',
    services: 'Built-in challenges do not need a separate vendor account. Team assignments still require the appropriate app access.',
    check: 'Finish a challenge and reopen its saved score and feedback.',
    nextStep: 'Choose a challenge', setupHref: 'https://faultlinelab.operatoros.net/challenges',
  },
  'ninja-pool-hall': {
    firstTask: 'Start a practice session or a game against the computer.',
    services: 'Practice and local games do not need a paid vendor. Online play depends on the room options currently available in the app.',
    check: 'Finish a game and check your saved match history.',
    nextStep: 'Start practicing', setupHref: 'https://operatorpoolhall.operatoros.net/practice',
  },
  brandforgeos: {
    firstTask: 'Save your brand, create a campaign, and prepare content for review.',
    services: 'AI drafts need the configured AI service. Planning or approving a post does not publish it to a social account.',
    check: 'Reopen an approved piece of content and confirm that its export contains the reviewed version.',
    nextStep: 'Open brand kits', setupHref: 'https://brandforgeos.operatoros.net/brands',
  },
  snapproofos: {
    firstTask: 'Create a job, collect evidence, and prepare a report for review.',
    services: 'File upload and download depend on platform storage and file safety checks. External delivery needs its own working connection.',
    check: 'Download a reviewed report and confirm that its evidence is complete and readable.',
    nextStep: 'Open jobs', setupHref: 'https://snapproofos.operatoros.net/jobs',
  },
  'studyforge-ai': {
    firstTask: 'Add source material, prepare a study set, and complete a practice session.',
    services: 'AI-generated study material needs the configured AI service and available plan usage. Check generated answers against your source material.',
    check: 'Reopen the study set and confirm that your practice results were saved.',
    nextStep: 'Add study material', setupHref: 'https://studyforge-ai.operatoros.net/sources',
  },
  'ninja-launch-kit': {
    firstTask: 'Create a project, complete its brief, and review the launch package.',
    services: 'AI drafts need the configured AI service. Downloads provide a launch package; publishing a website or campaign is a separate step.',
    check: 'Download the approved package and confirm that it contains the expected deliverables.',
    nextStep: 'Open projects', setupHref: 'https://deployops.operatoros.net/projects',
  },
  'callcommand-ai': {
    firstTask: 'Complete business setup, choose your number, and review your receptionist instructions.',
    services: 'Live calls need Twilio and OpenAI voice service. Paid numbers and usage also need the configured Stripe prices.',
    check: 'Place an approved test call, confirm the receptionist answers, and reopen the saved call and follow-up.',
    nextStep: 'Open guided phone setup', setupHref: 'https://callcommand-ai.operatoros.net/setup',
  },
  ninjamation: {
    firstTask: 'Choose a source, prepare a script, and review the version before downloading it.',
    services: 'AI drafting needs the configured AI service. Approved scripts must be run separately by an authorized technician.',
    check: 'Download the approved version and confirm that it matches the reviewed script.',
    nextStep: 'Open script sources', setupHref: 'https://scriptops.operatoros.net/sources',
  },
  outcall: {
    firstTask: 'Review service availability before planning a callback.',
    services: 'OutCall is not available yet. A saved contact or schedule does not mean a call will be placed.',
    check: 'Wait for OperatorOS to make the service available and confirm its phone delivery before relying on it.',
    nextStep: 'Review available apps', setupHref: 'https://app.operatoros.net/?page=apps',
  },
};
