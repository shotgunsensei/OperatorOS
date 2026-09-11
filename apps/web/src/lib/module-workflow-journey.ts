export interface ModuleWorkflowStage {
  label: string;
  path: string;
  routes: readonly string[];
  guidance: string;
}

const stage = (label: string, path: string, guidance: string, routes = [path.slice(1)]): ModuleWorkflowStage => ({ label, path, guidance, routes });

/** Navigation guidance only. Never infers completed work, permissions, or readiness. */
export const MODULE_WORKFLOW_JOURNEYS: Record<string, { label: string; stages: readonly ModuleWorkflowStage[] }> = {
  torqueshed: { label: 'Vehicle to verified repair', stages: [
    stage('Vehicle', '/garage', 'Add the vehicle once so its history and diagnostic work stay connected.'),
    stage('Diagnose', '/diagnostics', 'Record the concern, codes, and test results before choosing a repair.', ['diagnostics', 'live-bays']),
    stage('Service', '/service', 'Record the work performed and verify the outcome with a follow-up test.', ['service', 'builds', 'journal']),
    stage('Share proof', '/exports', 'Review the recorded findings and prepare the evidence your customer needs.'),
  ] },
  faultlinelab: { label: 'Briefing to demonstrated skill', stages: [
    stage('Choose a case', '/challenges', 'Choose a challenge or open a team assignment and read its briefing.', ['challenges', 'assignments']),
    stage('Investigate', '/sessions', 'Follow the clues, test your hypothesis, and record your reasoning.'),
    stage('Review evidence', '/evidence', 'Check the evidence and the actions you took before reviewing the result.'),
    stage('Learn from results', '/runs', 'Review your score and missed clues to plan the next practice session.', ['runs', 'reports']),
  ] },
  'ninja-pool-hall': { label: 'Practice, play, and improve', stages: [
    stage('Practice', '/practice', 'Warm up at your own pace and save a practice summary.'),
    stage('Play', '/cpu', 'Choose a CPU game, local two-player game, or an available organization room.', ['cpu', 'local', 'online']),
    stage('Review matches', '/history', 'Review completed matches and continue a saved game when available.'),
    stage('Tune your setup', '/profile', 'Adjust your preferences for the next game.'),
  ] },
  brandforgeos: { label: 'Brand brief to approved campaign', stages: [
    stage('Brand', '/brands', 'Save the brand and audience context your campaign will use.', ['brands', 'personas']),
    stage('Campaign', '/campaigns', 'Define the offer, audience, and deliverables for one campaign.'),
    stage('Create', '/content', 'Prepare the copy and assets, then plan their review dates.', ['content', 'calendar', 'ai-workflows']),
    stage('Approve', '/approvals', 'Review the work with your team before it is exported or released.'),
    stage('Export', '/reports', 'Package approved work and review recorded results.', ['reports', 'analytics', 'integrations']),
  ] },
  snapproofos: { label: 'Job to customer-ready proof', stages: [
    stage('Plan the job', '/jobs', 'Connect the customer and project before collecting evidence.', ['jobs', 'customers', 'projects']),
    stage('Collect proof', '/capture', 'Capture the observations and evidence needed for the job.', ['capture', 'evidence', 'work', 'costs', 'findings']),
    stage('Review report', '/reports', 'Check the evidence, findings, and customer details before approving the report.', ['reports', 'review']),
    stage('Share', '/share', 'Generate the reviewed output and use the available sharing controls.', ['share', 'exports']),
  ] },
  'studyforge-ai': { label: 'Source material to confident recall', stages: [
    stage('Add material', '/sources', 'Choose the notes or source material you want to learn.'),
    stage('Prepare a set', '/sets', 'Organize the material and review generated study content before using it.'),
    stage('Practice', '/flashcards', 'Work through cards or a quiz to test your recall.', ['flashcards', 'quizzes']),
    stage('Review progress', '/sessions', 'Review your session and focus the next one on difficult material.', ['sessions', 'analytics']),
  ] },
  'ninja-launch-kit': { label: 'Brief to reviewed launch package', stages: [
    stage('Project', '/projects', 'Choose a project or template for the package you need.', ['projects', 'templates']),
    stage('Brief', '/brief', 'Confirm the offer, audience, and required deliverables.'),
    stage('Prepare', '/deliverables', 'Create and refine the copy and visual-production briefs.'),
    stage('Review', '/review', 'Review the package and record the required decisions before export.'),
    stage('Export', '/exports', 'Download the reviewed package. Publishing remains a separate action.'),
  ] },
  'callcommand-ai': { label: 'Setup to reviewed follow-up', stages: [
    stage('Set up', '/setup', 'Complete the guided setup and review the service requirements.'),
    stage('Configure', '/agents', 'Review your receptionist, phone routing, and call workflow.', ['agents', 'numbers', 'workflows']),
    stage('Review calls', '/calls', 'Review the conversation and extracted request before handing work off.'),
    stage('Follow up', '/actions', 'Confirm the next action and track it through the existing workflow.'),
  ] },
  ninjamation: { label: 'Request to reviewed script', stages: [
    stage('Choose source', '/sources', 'Start with an approved source or an existing script.', ['sources', 'library']),
    stage('Prepare', '/generate', 'Describe the task and review the generated draft.'),
    stage('Review', '/review', 'Check the script and its intended scope before approving a revision.'),
    stage('Track results', '/runs', 'Review recorded runs and versions. Approval alone does not execute a script.', ['runs', 'versions']),
  ] },
  outcall: { label: 'Private callback preparation', stages: [
    stage('Verify', '/verification', 'Review availability and verify your own destination using the configured service.'),
    stage('Prepare', '/contacts', 'Prepare a neutral, non-emergency callback profile for your verified destination.'),
    stage('Schedule', '/schedules', 'Review the time and privacy controls. Delivery requires an available provider.', ['schedules', 'campaigns', 'reminders']),
    stage('Review delivery', '/history', 'Check the actual delivery result and readiness. OutCall remains subject to its existing availability gate.', ['history', 'calls', 'delivery']),
  ] },
};

export function moduleWorkflowPath(path: string): string {
  return path.split(/[?#]/u, 1)[0].replace(/^\/(?:app\/)?(?:modules|apps)\/[^/]+/u, '') || '/';
}

export function getModuleWorkflowJourney(slug: string, path: string) {
  const journey = Object.hasOwn(MODULE_WORKFLOW_JOURNEYS, slug) ? MODULE_WORKFLOW_JOURNEYS[slug] : undefined;
  if (!journey) return null;
  const root = moduleWorkflowPath(path).split('/').filter(Boolean)[0] ?? '';
  const activeIndex = journey.stages.findIndex(item => item.routes.includes(root));
  if (activeIndex < 0 && !['', 'dashboard', 'overview', 'home'].includes(root)) return null;
  return { ...journey, activeIndex };
}
