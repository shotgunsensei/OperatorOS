// Single source of truth for the John Travis Williams Jr. portfolio
// page. Lives separate from the JSX so copy edits never require
// touching component code. All fields are plain strings/arrays —
// rendered by the components in `PortfolioPage.tsx`.

export type PortfolioCTA = {
  label: string;
  href: string;
  variant: 'primary' | 'secondary';
  external?: boolean;
};

export type Metric = {
  value: string;
  label: string;
};

export type OperatingPrinciple = {
  title: string;
  body: string;
};

export type SpecializationCard = {
  title: string;
  blurb: string;
  bullets: string[];
};

export type ProjectCard = {
  name: string;
  tagline: string;
  url?: string;
  bullets: string[];
};

export type CaseStudy = {
  title: string;
  problem: string;
  actions: string;
  outcome: string;
};

export type ResumeVariant = {
  title: string;
  /** One-line value statement shown directly under the title. */
  positioning: string;
  /** Longer narrative kept for tooltip/aria/secondary read. */
  bestFor: string;
  /** Concrete role titles the variant is tuned for — render as pills. */
  targets: string[];
  filename: string;
};

export const PERSON = {
  name: 'John Travis Williams Jr.',
  title: 'Senior Infrastructure & Security Engineer',
  founder: 'Founder / Systems Architect — Shotgun Ninjas Productions, LLC',
  location: 'Salemburg, North Carolina',
  email: 'john@shotgunninjas.com',
  github: 'https://github.com/shotgunsensei',
  linkedin: 'https://www.linkedin.com/in/shotgunsensei',
  positioning:
    'Infrastructure • Security • Automation • Healthcare IT • Systems Architecture',
  heroCopy:
    'Top-tier escalation engineer for healthcare, radiology, and MSP-managed environments. I keep Microsoft estates, security controls, clinical imaging, and multi-site networks running — and build the automation and runbooks that keep them that way.',
};

export const HERO_CTAS: PortfolioCTA[] = [
  { label: 'View Projects', href: '#projects', variant: 'primary' },
  { label: 'View Case Studies', href: '#case-studies', variant: 'secondary' },
  { label: 'Download Resume', href: '#resumes', variant: 'secondary' },
  { label: 'GitHub', href: PERSON.github, variant: 'secondary', external: true },
  { label: 'LinkedIn', href: PERSON.linkedin, variant: 'secondary', external: true },
  { label: 'Contact', href: '#contact', variant: 'secondary' },
];

// At-a-glance credibility strip directly under the hero copy. Numbers
// are deliberately conservative — they reflect publicly defensible
// experience, not internal counters.
export const KEY_METRICS: Metric[] = [
  { value: '20+', label: 'Years hands-on IT' },
  { value: 'Tier 3', label: 'MSP escalation' },
  { value: 'HIPAA', label: 'Healthcare-regulated' },
  { value: 'Multi-site', label: 'Hybrid infrastructure' },
];

export const OPERATING_PRINCIPLES: OperatingPrinciple[] = [
  {
    title: 'Fail closed by default',
    body: 'Security posture defaults to deny. Identity, conditional access, and EDR are configured so the system is safe when nothing else is.',
  },
  {
    title: 'Document the runbook before the incident',
    body: 'SOPs, escalation paths, and client-facing summaries are written first. When the page goes off, the team executes the plan — not their memory.',
  },
  {
    title: 'Automate what you touch twice',
    body: 'PowerShell, RMM components, and remediation scripts replace tribal knowledge. Repeat work becomes a reusable playbook.',
  },
];

export const SPECIALIZATIONS: SpecializationCard[] = [
  {
    title: 'Infrastructure Engineering',
    blurb: 'Hybrid Microsoft estates, identity, virtualization, and BDR.',
    bullets: [
      'Windows Server, Active Directory, Group Policy',
      'Microsoft 365, Entra ID, Azure administration',
      'Hyper-V, DNS, DHCP, endpoint lifecycle',
      'Backup, disaster recovery, business continuity',
    ],
  },
  {
    title: 'Security Operations',
    blurb: 'EDR, SOC workflow, identity hardening, HIPAA-aware response.',
    bullets: [
      'Datto EDR, Datto AV, RocketCyber SOC',
      'Graphus, Dark Web ID, mailbox compromise review',
      'Ransomware response, endpoint detections',
      'MFA, Conditional Access, vulnerability management',
    ],
  },
  {
    title: 'MSP Operations',
    blurb: 'RMM, PSA, SOPs, and escalation workflows that scale.',
    bullets: [
      'Datto RMM, Kaseya BMS, alert tuning',
      'RMM scripting, PSA workflow design',
      'Ticket escalation, client onboarding',
      'SOP development & operational process improvement',
    ],
  },
  {
    title: 'Healthcare IT',
    blurb: 'Radiology, PACS, and HIPAA-regulated clinical environments.',
    bullets: [
      'Intelerad / InteleViewer, PowerScribe 360',
      'Diagnostic imaging workstations, multi-monitor setups',
      'Remote reading workflows for radiologists',
      'HIPAA-regulated operations and access control',
    ],
  },
  {
    title: 'Networking & Communications',
    blurb: 'Switching, routing, segmentation, wireless, and voice.',
    bullets: [
      'VLANs, routing, switching, ArubaOS',
      'VPNs, Metro-E, WAN troubleshooting',
      'Wireless infrastructure and structured cabling',
      'Allworx VoIP, PBX systems, call routing',
    ],
  },
  {
    title: 'Automation & Product Development',
    blurb: 'PowerShell, remediation, and AI-assisted product architecture.',
    bullets: [
      'PowerShell, remediation scripting, RMM components',
      'GitHub, Replit, version-controlled ops tooling',
      'AI-assisted process design & prompt engineering',
      'SaaS / PWA product architecture and planning',
    ],
  },
];

export const PROJECTS: ProjectCard[] = [
  {
    name: 'OperatorOS',
    tagline: 'Central SaaS gateway and command hub for the ecosystem.',
    url: 'https://operatoros.net',
    bullets: [
      'Module gateway with entitlement-based access',
      'Tenant-aware identity and product hub',
      'Stripe add-on strategy and subscription mapping',
      'Scalable SaaS architecture for ecosystem expansion',
    ],
  },
  {
    name: 'TechDeck',
    tagline: 'MSP and IT operations console for technician workflows.',
    url: 'https://techdeck.app',
    bullets: [
      'Technician command center and runbooks',
      'Script, alert, and ticket-context surfacing',
      'RMM and PSA workflow integration concepts',
      'Operational tooling for infrastructure support',
    ],
  },
  {
    name: 'PulseDesk',
    tagline: 'Healthcare operations management — not a generic helpdesk.',
    url: 'https://pulsedesk.support',
    bullets: [
      'Clinical coordination and visibility',
      'Radiology / clinical operations context',
      'Healthcare-specific workflow primitives',
      'White / blue clinical SaaS design direction',
    ],
  },
  {
    name: 'TradeFlowKit',
    tagline: 'Business operations and revenue workflow platform.',
    url: 'https://tradeflowkit.com',
    bullets: [
      'Quote → invoice → payment flow',
      'Service workflow management',
      'Operational visibility for service businesses',
      'Revenue workflow automation',
    ],
  },
  {
    name: 'TorqueShed',
    tagline: 'Automotive diagnostics and technician knowledge platform.',
    url: 'https://torqueshed.pro',
    bullets: [
      'Symptom trees and repair workflows',
      'Technician reasoning and community validation',
      'Diagnostic intelligence layer',
      'Community-driven diagnostic challenges',
    ],
  },
  {
    name: 'FaultlineLab',
    tagline: 'Advanced diagnostic challenge and problem-solving platform.',
    url: 'https://faultlinelab.com',
    bullets: [
      'Complex troubleshooting scenarios',
      'Clue-based investigation workflows',
      'Technical reasoning training',
      'Systems-thinking diagnostic puzzles',
    ],
  },
  {
    name: 'BrandForge OS',
    tagline: 'Brand and marketing tooling for structured asset systems.',
    url: 'https://bf-os.com',
    bullets: [
      'Brand asset operations',
      'Campaign workflow design',
      'Marketing asset management',
      'Structured creative systems',
    ],
  },
  {
    name: 'SnapProofOS',
    tagline: 'Operational proof and evidence capture for field workflows.',
    url: 'https://snapproofos.com',
    bullets: [
      'Field proof capture',
      'Documentation workflows',
      'Service evidence and accountability',
      'Operational audit trail',
    ],
  },
  {
    name: 'Shotgun Ninjas Virtual Studio',
    tagline: 'Browser-based creative studio and DAW.',
    url: 'https://shotgunninjas.studio',
    bullets: [
      'Browser DAW and creative tooling',
      'Music production and sound design',
      'Accessible production workflows',
      'AI-assisted enhancement roadmap',
    ],
  },
];

export const CASE_STUDIES: CaseStudy[] = [
  {
    title: 'Healthcare Security Incident Response',
    problem:
      'Healthcare environments require rapid security investigation while preserving HIPAA-sensitive operational continuity.',
    actions:
      'Investigated suspicious endpoint behavior, ransomware exposure, mailbox compromise indicators, malicious forwarding rules, endpoint detections, and email-header anomalies.',
    outcome:
      'Delivered remediation plans, client-facing executive summaries, internal incident reports, and hardened operational workflows.',
  },
  {
    title: 'Radiology Infrastructure & Remote Reading Support',
    problem:
      'Radiology workflows depend on high-performance workstations, PACS viewers, PowerScribe, diagnostic monitors, and reliable remote reading.',
    actions:
      'Supported Intelerad / InteleViewer, PowerScribe 360, diagnostic workstations, multi-monitor clinical setups, remote radiologist access, and latency troubleshooting.',
    outcome:
      'Improved technical clarity, operational support consistency, and escalation quality for clinical imaging environments.',
  },
  {
    title: 'MSP Automation & Endpoint Standardization',
    problem:
      'Recurring endpoint issues, noisy alerts, inconsistent remediation, and technician workflow gaps were creating operational drag.',
    actions:
      'Built PowerShell scripts, RMM components, SOPs, alert-handling workflows, cleanup routines, and standardized troubleshooting processes.',
    outcome:
      'Reduced repeat work, improved ticket consistency, and produced reusable technical playbooks adopted across the technician team.',
  },
  {
    title: 'Multi-Site Infrastructure Troubleshooting',
    problem:
      'Business and healthcare clients face complex connectivity issues across firewalls, switches, VPNs, VoIP, VLANs, wireless, and WAN paths.',
    actions:
      'Troubleshot ArubaOS switching, VPN routing, Metro-E circuits, firewall policies, Allworx VoIP, DNS/DHCP, and network segmentation.',
    outcome:
      'Restored operational stability and produced clear escalation documentation that shortened the next incident on the same surface.',
  },
];

export const RESUME_VARIANTS: ResumeVariant[] = [
  {
    title: 'Infrastructure & MSP Operations Engineer',
    positioning:
      'Tier-3 escalation engineer for Microsoft estates, healthcare infrastructure, and multi-site MSP operations.',
    bestFor:
      'MSP escalation, systems engineering, healthcare infrastructure, and operations roles.',
    targets: [
      'Senior Systems Engineer',
      'MSP Escalation / Tier 3',
      'Infrastructure Engineer',
      'Healthcare IT Engineer',
      'IT Operations Manager',
    ],
    filename: 'Infrastructure_MSP_Engineer_Resume.pdf',
  },
  {
    title: 'Security Operations & Automation Engineer',
    positioning:
      'SOC-adjacent engineer who runs EDR, identity hardening, and incident response with PowerShell-first automation.',
    bestFor:
      'SOC, MSSP, EDR, incident response, remediation, identity security, and automation roles.',
    targets: [
      'Security Engineer',
      'SOC / MSSP Analyst (Tier 2-3)',
      'Incident Response Engineer',
      'Identity & Access Engineer',
      'Automation Engineer',
    ],
    filename: 'Security_Automation_Engineer_Resume.pdf',
  },
  {
    title: 'Cloud Infrastructure & Solutions Architect',
    positioning:
      'Architect who designs hybrid Microsoft / Azure systems and translates business goals into resilient operational designs.',
    bestFor:
      'Cloud infrastructure, platform engineering, solutions architecture, technical consulting, and systems design roles.',
    targets: [
      'Cloud / Solutions Architect',
      'Platform Engineer',
      'Principal Infrastructure Engineer',
      'Technical Consultant',
      'Systems Architect',
    ],
    filename: 'Cloud_Solutions_Architect_Resume.pdf',
  },
];

export const AVAILABLE_FOR: string[] = [
  'Infrastructure Engineering',
  'Security Operations',
  'MSP Escalation',
  'Healthcare IT',
  'Cloud / Solutions Architecture',
  'Automation Engineering',
  'Consulting & Strategic Projects',
];
