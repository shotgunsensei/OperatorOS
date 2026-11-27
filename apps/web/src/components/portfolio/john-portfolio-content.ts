/** Public portfolio claims are scoped to their dated evidence. No customer data. */
export const JOHN_PROFILE = {
  name: 'John T. Williams, Jr.',
  shortName: 'John Williams',
  currentRole: 'Senior Support Engineer',
  employer: 'Xodus Technology Professionals',
  location: 'Salemburg, North Carolina',
  email: 'john@shotgunninjas.com',
  github: 'https://github.com/shotgunsensei',
  linkedin: 'https://www.linkedin.com/in/shotgunsensei',
  resume: '/resumes/John_Williams_Systems_and_AI_Resume.pdf',
  portfolio: '/resumes/John_Williams_AI_Engineering_Portfolio.pdf',
} as const;

const SOURCE = 'https://github.com/shotgunsensei/OperatorOS';
export const JOHN_PROOF = {
  reviewed: '27 November 2026',
  runDate: '23 November 2026',
  commit: '9d9edc09d1a9bc0284a64e1676b17f96385d98aa',
  release: `${SOURCE}/actions/runs/45265660645`,
  vector: `${SOURCE}/actions/runs/45265660607`,
  source: `${SOURCE}/tree/9d9edc09d1a9bc0284a64e1676b17f96385d98aa`,
  retrieval: `${SOURCE}/blob/9d9edc09d1a9bc0284a64e1676b17f96385d98aa/apps/api/test/techdeck-resolution-semantic.test.ts`,
  regression: `${SOURCE}/pull/141`,
} as const;

export const JOHN_CAPABILITIES = [
  {
    title: 'Infrastructure & escalation',
    description: 'Microsoft estates, identity, virtualization and complex support work across MSP and healthcare environments.',
    technologies: 'Windows Server · Active Directory · Microsoft 365 · Entra ID · Hyper-V · VMware',
    evidence: 'Senior support experience and the Windows lifecycle case study.',
  },
  {
    title: 'Automation & operational tooling',
    description: 'Turning recurring technician work into scripts, repeatable workflows, packaged tools and useful documentation.',
    technologies: 'PowerShell · Datto RMM · Kaseya · C# / .NET · Python',
    evidence: 'Windows assessment tooling, endpoint diagnostics and the Linux field appliance.',
  },
  {
    title: 'Applied AI & software delivery',
    description: 'Directing AI-assisted implementation and evaluating the resulting software with explicit acceptance criteria.',
    technologies: 'Codex · TypeScript · React / Next.js · PostgreSQL · pgvector · GitHub',
    evidence: 'OperatorOS source, automated release checks and tenant-aware retrieval tests.',
  },
  {
    title: 'Security & supportability',
    description: 'Building access boundaries, recoverable changes and clear evidence into systems that people must operate.',
    technologies: 'MFA · Conditional Access · EDR · Network segmentation · Backup & recovery',
    evidence: 'Role-filtered retrieval, guarded migration planning and appliance recovery records.',
  },
] as const;

export const JOHN_APPROACH = [
  { number: '01', title: 'Define the real problem', body: 'Start with the environment, business impact, constraints and what a successful result must prove.' },
  { number: '02', title: 'Direct the implementation', body: 'Use AI for research, code, tests and documentation while keeping scope and technical decisions explicit.' },
  { number: '03', title: 'Challenge the result', body: 'Inspect the changes, exercise failure paths and test the boundaries that matter to the workflow.' },
  { number: '04', title: 'Leave useful evidence', body: 'Retain the source revision, validation receipts, runbook and remaining acceptance work.' },
] as const;

export const JOHN_EXPERIENCE = [
  {
    period: 'July 2022 — present',
    role: 'Senior Support Engineer',
    organization: 'Xodus Technology Professionals',
    description: 'MSP escalation, healthcare IT, Microsoft infrastructure, identity, endpoint security and multi-site troubleshooting. Develops automation and technical handoffs alongside day-to-day operations.',
  },
  {
    period: 'April 2012 — June 2022',
    role: 'Senior Support Technician / Systems Administrator',
    organization: 'Ross IT Services',
    description: 'Systems administration, server and endpoint support, networking, communications and operational troubleshooting.',
  },
  {
    period: 'August 2005 — April 2012',
    role: 'IT Director',
    organization: 'Johnston Ambulance Service',
    description: 'Infrastructure ownership, technology support and the practical responsibilities of keeping business systems available.',
  },
] as const;
