import type { CaseDraft } from './schema';
import type { CaseCategory, Difficulty, ToolType } from '@/types';

/**
 * Per-domain authoring templates. Each factory returns a `CaseDraft`
 * skeleton that satisfies the validator with placeholder content
 * (so authors get green-on-load and can iteratively replace it).
 *
 * To add a new domain template:
 *   1. Add a factory below following the existing pattern.
 *   2. Pick `availableTools` typical for that domain.
 *   3. Wire 4 tiered hints, ≥4 evidence items (with ≥1 reachable
 *      clue/critical), 2 commands, 2 events, 1 ticket — these are
 *      the validator floors.
 */

export type DomainTemplate =
  | 'windows-ad'
  | 'networking'
  | 'servers'
  | 'automotive'
  | 'electronics'
  | 'mixed'
  | 'healthcare-imaging';

export interface TemplateOpts {
  id: string;
  slug: string;
  title: string;
  difficulty?: Difficulty;
  shortBriefing?: string;
}

interface DomainSpec {
  category: CaseCategory;
  tools: ToolType[];
  defaultRootCauseTitle: string;
  defaultRootCauseDetail: string;
  defaultRemediation: string;
  defaultPreventatives: string[];
  defaultBriefingPrefix: string;
}

const DOMAIN_SPECS: Record<DomainTemplate, DomainSpec> = {
  'windows-ad': {
    category: 'windows-ad',
    tools: ['terminal', 'event-log', 'registry-viewer', 'ticket-history'],
    defaultRootCauseTitle: 'Misconfigured Group Policy / AD object',
    defaultRootCauseDetail:
      'A directory object or GPO setting is silently overriding the expected behavior. Look for replication lag, OU inheritance, and recent admin changes.',
    defaultRemediation:
      'Identify the offending GPO or attribute, roll back to the known-good value, and force AD replication.',
    defaultPreventatives: [
      'Require GPO change tickets to include rollback steps',
      'Enable AD object auditing for the affected OU',
    ],
    defaultBriefingPrefix:
      'PRIORITY: HIGH\n\nWindows / AD environment showing unexpected behavior on multiple endpoints.',
  },
  networking: {
    category: 'networking',
    tools: ['terminal', 'event-log', 'network-map', 'firewall-table', 'ticket-history'],
    defaultRootCauseTitle: 'Layer 3/4 path or policy mismatch',
    defaultRootCauseDetail:
      'Traffic is being silently dropped or misrouted due to a routing/ACL/proxy-id mismatch. Verify both endpoints, not just the one reporting "UP".',
    defaultRemediation:
      'Reconcile the configuration on both endpoints, clear stale state, and re-test bidirectionally.',
    defaultPreventatives: [
      'Add bidirectional health checks beyond status flags',
      'Require peer review on firewall / VPN ACL changes',
    ],
    defaultBriefingPrefix:
      'PRIORITY: HIGH\n\nNetwork connectivity issue reported across sites despite green dashboards.',
  },
  servers: {
    category: 'servers',
    tools: ['terminal', 'event-log', 'service-inspector', 'ticket-history'],
    defaultRootCauseTitle: 'Service / dependency misconfiguration',
    defaultRootCauseDetail:
      'A server-side service is failing in a way that is masked by a dependency or supervisor restart loop.',
    defaultRemediation:
      'Trace the dependency chain to the failing component, fix the root config or resource limit, and restart with verification.',
    defaultPreventatives: [
      'Add dependency-aware health checks',
      'Alert on supervisor restart loops, not just service-down',
    ],
    defaultBriefingPrefix:
      'PRIORITY: HIGH\n\nProduction service degraded; restart-loop or partial-failure pattern observed.',
  },
  automotive: {
    category: 'automotive',
    tools: ['terminal', 'obd-panel', 'sensor-graph', 'ticket-history'],
    defaultRootCauseTitle: 'Sensor or actuator anomaly',
    defaultRootCauseDetail:
      'A sensor reading or CAN-bus message is causing the ECU to react to a phantom condition. Verify the raw signal against ground truth.',
    defaultRemediation:
      'Isolate the failing sensor/actuator, replace or recalibrate, and clear stored DTCs.',
    defaultPreventatives: [
      'Schedule sensor calibration on the recommended interval',
      'Pull live data BEFORE clearing DTCs to preserve evidence',
    ],
    defaultBriefingPrefix:
      'PRIORITY: MEDIUM\n\nVehicle in for intermittent fault; DTCs present but customer report does not match.',
  },
  electronics: {
    category: 'electronics',
    tools: ['terminal', 'sensor-graph', 'event-log', 'ticket-history'],
    defaultRootCauseTitle: 'Sensor mesh fault propagation',
    defaultRootCauseDetail:
      'A single faulty node is poisoning aggregated readings. Per-node telemetry will reveal the outlier.',
    defaultRemediation:
      'Identify and isolate the faulty node, recalibrate the mesh, and verify aggregated readings stabilize.',
    defaultPreventatives: [
      'Add per-node anomaly detection at the edge',
      'Quarantine outliers before they enter aggregation',
    ],
    defaultBriefingPrefix:
      'PRIORITY: MEDIUM\n\nSensor mesh reporting impossible aggregate values; downstream automation reacting incorrectly.',
  },
  mixed: {
    category: 'mixed',
    tools: ['terminal', 'event-log', 'service-inspector', 'network-map', 'ticket-history'],
    defaultRootCauseTitle: 'Cascading failure across system boundaries',
    defaultRootCauseDetail:
      'A small failure in one subsystem is being amplified by retry logic, queue backpressure, or feedback loops in another.',
    defaultRemediation:
      'Break the cascade at its narrowest point, then address the originating failure with proper backpressure.',
    defaultPreventatives: [
      'Add circuit breakers between subsystems',
      'Cap retry budgets and surface them in dashboards',
    ],
    defaultBriefingPrefix:
      'PRIORITY: HIGH\n\nMulti-system incident — symptoms appear in subsystem A but root cause is upstream.',
  },
  'healthcare-imaging': {
    // Healthcare imaging packs map onto the "mixed" engine category for now;
    // the catalog still represents them as a distinct pack at the catalog layer.
    category: 'mixed',
    tools: ['terminal', 'event-log', 'service-inspector', 'ticket-history'],
    defaultRootCauseTitle: 'PACS / DICOM workflow break',
    defaultRootCauseDetail:
      'A DICOM tag, modality worklist entry, or PACS routing rule is silently dropping studies. Check audit logs and HL7 traffic.',
    defaultRemediation:
      'Repair the offending DICOM tag mapping or routing rule, replay the held studies, and verify radiologist worklist.',
    defaultPreventatives: [
      'Validate DICOM conformance after every modality config change',
      'Alert on study-throughput drops, not just "PACS up"',
    ],
    defaultBriefingPrefix:
      'PRIORITY: CRITICAL\n\nRadiology workflow disruption — studies arriving at PACS but not appearing on worklists.',
  },
};

export function createTemplate(
  domain: DomainTemplate,
  opts: TemplateOpts
): CaseDraft {
  const spec = DOMAIN_SPECS[domain];
  const difficulty = opts.difficulty ?? 'intermediate';
  const briefing = opts.shortBriefing
    ? `${spec.defaultBriefingPrefix}\n\n${opts.shortBriefing}`
    : `${spec.defaultBriefingPrefix}\n\nReplace this paragraph with the operator-facing briefing for "${opts.title}".`;

  return {
    id: opts.id,
    slug: opts.slug,
    title: opts.title,
    category: spec.category,
    difficulty,
    description: `Placeholder description for "${opts.title}". Replace with the one-line case summary shown on the incident board.`,
    briefing,
    symptoms: [
      { id: 's1', description: 'Primary symptom — replace with observable user impact', severity: 'high' },
      { id: 's2', description: 'Secondary symptom — replace with system-side signal', severity: 'medium' },
    ],
    rootCause: {
      id: 'rc1',
      title: spec.defaultRootCauseTitle,
      description: 'Replace with one-paragraph plain-English description of the actual root cause.',
      technicalDetail: spec.defaultRootCauseDetail,
    },
    evidence: [
      { id: 'e1', title: 'Critical clue', description: 'Replace — the smoking gun the player must find', category: 'clue', importance: 'critical' },
      { id: 'e2', title: 'Supporting clue', description: 'Replace — corroborating evidence', category: 'clue', importance: 'high' },
      { id: 'e3', title: 'Red herring', description: 'Replace — looks suspicious but is not the cause', category: 'red-herring', importance: 'medium' },
      { id: 'e4', title: 'Contextual', description: 'Replace — background information', category: 'contextual', importance: 'low' },
    ],
    hints: [
      { level: 1, label: 'Subtle Nudge', text: 'Replace — gentle pointer toward the right area without spoiling.', scorePenalty: 5 },
      { level: 2, label: 'Directional Clue', text: 'Replace — narrow the search to a specific subsystem.', scorePenalty: 10 },
      { level: 3, label: 'Stronger Clue', text: 'Replace — name the mechanism but not the exact value.', scorePenalty: 20 },
      { level: 4, label: 'Reveal Path', text: 'Replace — spell out the root cause and the fix.', scorePenalty: 35 },
    ],
    terminalCommands: [
      {
        command: 'status',
        description: 'Replace with a real diagnostic command for this domain',
        output: 'Replace with realistic command output that hints at the issue.',
        revealsEvidence: ['e1'],
      },
      {
        command: 'logs',
        description: 'Replace with a log-tail command',
        output: 'Replace with realistic log output containing supporting evidence.',
        revealsEvidence: ['e2'],
      },
    ],
    eventLogs: [
      {
        id: 'el1',
        timestamp: '2026-04-15 06:00:00',
        source: spec.category,
        level: 'error',
        message: 'Replace with the first significant event the player would see',
        revealsEvidence: ['e1'],
      },
      {
        id: 'el2',
        timestamp: '2026-04-15 06:01:00',
        source: spec.category,
        level: 'warning',
        message: 'Replace with a follow-up event reinforcing the pattern',
      },
    ],
    ticketHistory: [
      {
        id: 'th1',
        author: 'End User',
        role: 'Reporter',
        timestamp: '2026-04-15 07:30 AM',
        content: 'Replace with the original user report that opened the ticket.',
      },
    ],
    availableTools: spec.tools,
    redHerrings: ['Replace with the most tempting wrong conclusion players will jump to.'],
    remediation: spec.defaultRemediation,
    preventativeMeasures: spec.defaultPreventatives,
    maxScore: 100,
  };
}
