import type {
  CaseDraftEditor,
  CaseDraftRecord,
} from '@/lib/api';
import {
  createTemplate,
  type CaseDraft,
  type DomainTemplate,
} from '@/data/cases/authoring';
import type {
  CaseCategory,
  Difficulty,
  ToolType,
} from '@/types';

export const DOMAIN_OPTIONS: Array<{ value: DomainTemplate; label: string }> = [
  { value: 'windows-ad', label: 'Windows / Active Directory' },
  { value: 'networking', label: 'Networking / VPN' },
  { value: 'servers', label: 'Servers / Services' },
  { value: 'automotive', label: 'Automotive Diagnostics' },
  { value: 'electronics', label: 'Electronics / Sensor Mesh' },
  { value: 'mixed', label: 'Mixed Systems' },
  { value: 'healthcare-imaging', label: 'Healthcare / Imaging (PACS)' },
];

export const CATEGORY_OPTIONS: CaseCategory[] = [
  'windows-ad',
  'networking',
  'automotive',
  'electronics',
  'servers',
  'mixed',
];

export const DIFFICULTY_OPTIONS: Difficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
];

export const TOOL_OPTIONS: ToolType[] = [
  'terminal',
  'event-log',
  'ticket-history',
  'network-map',
  'service-inspector',
  'registry-viewer',
  'sensor-graph',
  'obd-panel',
  'firewall-table',
];

export interface StoredDraft {
  draft: CaseDraft;
  savedAt: number;
  editor: CaseDraftEditor | null;
}

export function isCaseDraftShape(value: unknown): value is CaseDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.slug === 'string' &&
    typeof v.title === 'string' &&
    typeof v.category === 'string' &&
    typeof v.difficulty === 'string' &&
    typeof v.description === 'string' &&
    typeof v.briefing === 'string' &&
    Array.isArray(v.symptoms) &&
    Array.isArray(v.evidence) &&
    Array.isArray(v.hints) &&
    Array.isArray(v.terminalCommands) &&
    Array.isArray(v.eventLogs) &&
    Array.isArray(v.ticketHistory) &&
    Array.isArray(v.availableTools) &&
    Array.isArray(v.redHerrings) &&
    Array.isArray(v.preventativeMeasures) &&
    typeof v.remediation === 'string' &&
    !!v.rootCause &&
    typeof v.rootCause === 'object'
  );
}

export function recordsToMap(
  records: CaseDraftRecord[]
): Record<string, StoredDraft> {
  const out: Record<string, StoredDraft> = {};
  for (const r of records) {
    if (!isCaseDraftShape(r.draft)) continue;
    const savedAt = r.updatedAt ? Date.parse(r.updatedAt) : Date.now();
    out[r.id] = {
      draft: r.draft,
      savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
      editor: r.editor,
    };
  }
  return out;
}

export function editorLabel(editor: CaseDraftEditor | null): string {
  if (!editor) return 'unknown';
  return editor.displayName || editor.email || editor.id;
}

export function blankDraft(): CaseDraft {
  return createTemplate('windows-ad', {
    id: 'new-case',
    slug: 'new-case',
    title: 'Untitled Case',
  });
}
