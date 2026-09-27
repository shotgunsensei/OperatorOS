import { randomUUID } from 'node:crypto';
import type { MachineEvidenceExport } from '../../../../packages/sdk/src/techdeck-resolution.js';
import { issue, ResolutionInputError, sha256, type ResolutionIssue } from './techdeck-resolution-validation.js';
import { RESOLUTION_REDACTOR_VERSION } from './techdeck-resolution-redaction.js';

export const RESOLUTION_NORMALIZER_VERSION = 'normalize-v1';
export type ResolutionRow = { table: string; values: Record<string, unknown> & { id: string; source_pointer: string } };
const nonempty = (value: unknown): boolean => value !== null && value !== undefined && value !== '' && (Array.isArray(value) ? value.some(nonempty) : typeof value === 'object' ? Object.values(value).some(nonempty) : true);
const text = (value: unknown): string | null => value === null || value === undefined || value === '' ? null : String(value);

/** Deterministic extraction only. Unknown extensions never enter normalized or search data. */
export function normalizeResolutionExport(data: MachineEvidenceExport) {
  const rows: ResolutionRow[] = [], warnings: ResolutionIssue[] = [];
  const warn = (path: string, code: string, expected: string) => { if (warnings.length < 100) warnings.push(issue(path, code, expected, 'warning')); };
  const bounded = (value: string, max: number, path: string) => {
    if (Buffer.byteLength(value) > max) throw new ResolutionInputError('RESOLUTION_PROJECTION_TOO_LARGE', 422, [issue(path, 'FIELD_TOO_LONG', `At most ${max} UTF-8 bytes`)]);
    return value;
  };
  function date(value: string | null | undefined, path: string): string | null {
    if (!value) return null;
    // Require an explicit timezone and valid calendar date; do not infer local time.
    const pattern = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
    const match = pattern.exec(value), parsed = Date.parse(value);
    const calendar = match && new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    const utcYear = new Date(parsed).getUTCFullYear();
    if (!match || !Number.isFinite(parsed) || !calendar || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10) || utcYear < 1 || utcYear > 9999) {
      warn(path, 'DATE_UNRESOLVED', 'Explicit valid ISO timestamp; original retained in source'); return null;
    }
    return new Date(parsed).toISOString();
  }
  function add(table: string, pointer: string, values: Record<string, unknown>) {
    const row: ResolutionRow = { table, values: { id: randomUUID(), source_pointer: pointer, ...values } };
    rows.push(row); return row;
  }
  function strings(values: string[] | undefined, path: string, visit: (value: string, pointer: string) => void) {
    (values ?? []).forEach((value, index) => { if (value.trim()) visit(value, `${path}/${index}`); else warn(`${path}/${index}`, 'EMPTY_PLACEHOLDER_OMITTED', 'No normalized fact created'); });
  }
  function objects<T>(values: T[], path: string, visit: (value: T, pointer: string) => void) {
    values.forEach((value, index) => { if (nonempty(value)) visit(value, `${path}/${index}`); else warn(`${path}/${index}`, 'EMPTY_PLACEHOLDER_OMITTED', 'No normalized fact created'); });
  }
  function identifier(kind: string, value: string | null | undefined, pointer: string) {
    if (!value?.trim()) return;
    add('identifiers', pointer, { kind, original_value: value, normalized_value: bounded(value.trim().toLowerCase(), 2000, pointer), numeric_value: kind === 'event_id' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null });
  }
  function component(kind: string, value: string, pointer: string) {
    add('components', pointer, { kind, name: value, normalized_name: bounded(value.trim().toLowerCase(), 512, pointer) });
    if (kind === 'service' || kind === 'application') identifier(kind, value, pointer);
  }
  const incident: Record<string, unknown> = {
    source_incident_id: data.incident.incident_id ?? null, external_ticket_id: data.incident.external_ticket_id ?? null,
    title: data.incident.title ?? null, organization_label: data.incident.organization ?? null, client_label: data.incident.client ?? null,
    technician_label: data.incident.technician ?? null, opened_at: date(data.incident.opened_at, '/incident/opened_at'), closed_at: date(data.incident.closed_at, '/incident/closed_at'),
    first_observed_at: date(data.issue.first_observed_at, '/issue/first_observed_at'), source_status: data.incident.status ?? null,
    severity: data.incident.severity ?? null, business_impact: data.incident.business_impact ?? null, issue_summary: data.issue.summary ?? null,
    resolution_summary: data.resolution.summary ?? null, permanent_fix: data.resolution.permanent_fix ?? null, temporary_workaround: data.resolution.temporary_workaround ?? null,
    one_line_resolution: data.knowledge.one_line_resolution ?? null, suggested_kb_title: data.knowledge.kb_title ?? null,
    category: data.classification.category ?? null, subcategory: data.classification.subcategory ?? null, cause_type: data.classification.cause_type ?? null,
    recurrence_risk: data.classification.recurrence_risk ?? null, root_cause_confidence: data.root_cause.confidence ?? null, data_quality_confidence: data.data_quality.overall_confidence ?? null,
    primary_remediation: data.current_status.primary_remediation ?? null, user_functionality: data.current_status.user_functionality ?? null, validation_status: data.current_status.validation ?? null,
    monitoring_required: data.current_status.monitoring_required == null ? null : data.current_status.monitoring_required === 'YES',
    follow_up_required: data.current_status.follow_up_required == null ? null : data.current_status.follow_up_required === 'YES', recommended_ticket_state: data.current_status.recommended_ticket_state ?? null,
    security_incident_suspected: data.security.security_incident_suspected ?? null, security_notes: data.security.security_notes ?? null,
    environment: Object.fromEntries(['domain', 'tenant', 'network', 'location', 'applications', 'services', 'vendors'].map(key => [key, (data.environment as any)[key] ?? (['applications', 'services', 'vendors'].includes(key) ? [] : null)])),
  };
  for (const key of ['security_relevant', 'hardware_relevant', 'network_relevant', 'kb_candidate', 'automation_candidate'] as const) incident[key] = data.classification[key] ?? null;
  if (incident.opened_at && incident.closed_at && incident.closed_at < incident.opened_at) throw new ResolutionInputError('RESOLUTION_DATE_ORDER', 422, [issue('/incident/closed_at', 'DATE_ORDER_INVALID', 'Closure at or after opening')]);
  objects(data.affected_assets, '/affected_assets', (asset, path) => {
    const fields = ['asset_type', 'hostname', 'device_name', 'manufacturer', 'model', 'serial_number', 'operating_system', 'os_version', 'os_build', 'role'] as const;
    add('incident_assets', path, { ...Object.fromEntries(fields.map(key => [key, asset[key] ?? null])), ip_addresses: asset.ip_addresses ?? [], mac_addresses: asset.mac_addresses ?? [] });
    identifier('hostname', asset.hostname, `${path}/hostname`); identifier('os_build', asset.os_build, `${path}/os_build`);
  });
  for (const [key, kind] of [['symptoms', 'unspecified'], ['user_reported_symptoms', 'reported'], ['technician_observed_symptoms', 'observed']] as const) strings(data.issue[key], `/issue/${key}`, (description, path) => add('symptoms', path, { kind, description }));
  for (const [key, kind] of [['error_codes', 'error_code'], ['event_ids', 'event_id'], ['error_messages', 'error_message']] as const) strings(data.issue[key], `/issue/${key}`, (value, path) => identifier(kind, value, path));
  strings(data.issue.affected_components, '/issue/affected_components', (value, path) => component('component', value, path));
  for (const [source, kinds] of [
    ['environment', { applications: 'application', services: 'service', vendors: 'vendor' }],
    ['classification', { platforms: 'platform', applications: 'application', services: 'service', technologies: 'technology' }],
  ] as const) for (const [key, kind] of Object.entries(kinds)) strings((data[source] as any)[key], `/${source}/${key}`, (value, path) => component(kind, value, path));
  objects(data.evidence, '/evidence', (evidence, path) => {
    add('evidence_links', path, { source_evidence_id: evidence.evidence_id ?? null, observed_at: date(evidence.timestamp, `${path}/timestamp`), evidence_type: evidence.type ?? null,
      source_label: evidence.source ?? null, description: evidence.description ?? null, value_text: text(evidence.value), numeric_value: typeof evidence.value === 'number' ? evidence.value : null,
      units: evidence.units ?? null, path: evidence.path ?? null, confidence: evidence.confidence ?? null });
    identifier('file_path', evidence.path, `${path}/path`);
  });
  objects(data.diagnostics, '/diagnostics', (action, path) => {
    const row = action.action ? add('actions', path, { kind: 'diagnostic', action: action.action, sequence: action.sequence ?? null, observed_at: date(action.timestamp, `${path}/timestamp`), purpose: action.purpose ?? null,
      expected_result: action.expected_result ?? null, actual_result: action.actual_result ?? null, outcome: action.outcome ?? null, risk_level: action.risk_level ?? null }) : null;
    if (!row) warn(path, 'ACTION_UNSPECIFIED', 'Partial observation retained in source');
    if (action.command) add('commands', `${path}/command`, { action_id: row?.values.id ?? null, sequence: action.sequence ?? null, source_type: 'incident', command_text: action.command, search_text: action.command, purpose: action.purpose ?? null, actual_result: action.actual_result ?? null, risk_level: action.risk_level ?? null });
  });
  objects(data.commands_scripts, '/commands_scripts', (command, path) => {
    if (!command.command_or_script) { warn(path, 'COMMAND_UNSPECIFIED', 'Partial command metadata retained in source'); return; }
    add('commands', path, { source_type: 'incident', sequence: command.sequence ?? null, command_type: command.type ?? null, language: command.language ?? null,
      command_text: command.command_or_script, search_text: command.command_or_script, purpose: command.purpose ?? null, actual_result: command.result ?? null,
      successful: command.successful ?? null, destructive: command.destructive ?? null, requires_elevation: command.requires_elevation ?? null });
  });
  objects(data.changes_made, '/changes_made', (change, path) => add('changes', path, { sequence: change.sequence ?? null, observed_at: date(change.timestamp, `${path}/timestamp`), change_type: change.change_type ?? null,
    target: change.target ?? null, before_value: text(change.before), after_value: text(change.after), reason: change.reason ?? null, reversible: change.reversible ?? null, rollback: change.rollback ?? null }));
  objects(data.failed_actions, '/failed_actions', (action, path) => {
    if (!action.action) { warn(path, 'ACTION_UNSPECIFIED', 'Failure detail retained in source'); return; }
    add('actions', path, { kind: 'failed', action: action.action, reason_failed: action.reason_failed ?? null, error_message: action.error ?? null, side_effect_text: action.side_effect ?? null, lesson: action.lesson ?? null, outcome: 'FAILURE', successful: false });
  });
  objects(data.successful_actions, '/successful_actions', (action, path) => {
    if (!action.action) { warn(path, 'ACTION_UNSPECIFIED', 'Success assertion retained in source'); return; }
    add('actions', path, { kind: 'successful', action: action.action, actual_result: action.result ?? null, source_evidence_text: action.evidence ?? null, outcome: 'SUCCESS', successful: true });
  });
  strings(data.resolution.final_actions, '/resolution/final_actions', (action, path) => add('actions', path, { kind: 'final', action }));
  objects(data.side_effects, '/side_effects', (effect, path) => {
    if (!effect.effect) { warn(path, 'SIDE_EFFECT_UNSPECIFIED', 'Partial observation retained in source'); return; }
    function actionRef(label: string | null | undefined, field: string): string | null {
      if (!label) return null;
      const matches = rows.filter(row => row.table === 'actions' && row.values.action === label);
      if (matches.length === 1) return matches[0].values.id;
      warn(`${path}/${field}`, 'ACTION_REFERENCE_UNRESOLVED', 'Only an exact unambiguous action is linked'); return null;
    }
    add('side_effects', path, { triggering_action_id: actionRef(effect.triggering_action, 'triggering_action'), recovery_action_id: actionRef(effect.recovery_action, 'recovery_action'),
      triggering_action_text: effect.triggering_action ?? null, recovery_action_text: effect.recovery_action ?? null, effect: effect.effect, severity: effect.severity ?? null,
      recovered: effect.recovered ?? null, causal_status: 'temporal_association' });
  });
  if (data.root_cause.summary) add('root_causes', '/root_cause/summary', { kind: 'primary', summary: data.root_cause.summary, category: data.root_cause.category ?? null, confidence: data.root_cause.confidence ?? null });
  for (const [key, kind] of [['contributing_factors', 'contributing'], ['secondary_effects', 'secondary'], ['not_proven', 'not_proven']] as const) strings(data.root_cause[key], `/root_cause/${key}`, (summary, path) => add('root_causes', path, { kind, summary, claim_kind: kind === 'not_proven' ? 'unverified' : 'reported_fact' }));
  const evidenceReferences: Array<{ label: string; path: string; targetId: string | null }> = [];
  strings(data.root_cause.evidence, '/root_cause/evidence', (label, path) => {
    const matches = rows.filter(row => row.table === 'evidence_links' && row.values.source_evidence_id === label);
    const evidence = matches.length === 1 ? matches[0] : add('evidence_links', path, { description: label, source_label: 'root_cause.evidence', claim_kind: 'reported_fact' });
    evidenceReferences.push({ label, path, targetId: matches.length > 1 ? null : evidence.values.id });
    if (matches.length > 1) warn(path, 'EVIDENCE_REFERENCE_AMBIGUOUS', 'Multiple evidence records share this source label');
  });
  for (const kind of ['performed', 'successful', 'failed', 'pending'] as const) strings(data.validation[kind], `/validation/${kind}`, (description, path) => add('validations', path, { kind, description, claim_kind: kind === 'pending' ? 'pending_validation' : 'reported_fact' }));
  objects(data.follow_up, '/follow_up', (followup, path) => {
    if (!followup.action) { warn(path, 'FOLLOWUP_UNSPECIFIED', 'Partial follow-up retained in source'); return; }
    add('followups', path, { action: followup.action, priority: followup.priority ?? null, owner_label: followup.owner ?? null, due_label: followup.due ?? null, due_at: date(followup.due, `${path}/due`) });
  });
  for (const [key, table] of [['warnings', 'warnings'], ['lessons_learned', 'lessons'], ['escalation_conditions', 'escalation_conditions'], ['reusable_ip_opportunities', 'ip_opportunities']] as const) strings(data.knowledge[key], `/knowledge/${key}`, (description, path) => add(table, path, { description }));
  for (const [key, kind] of [['missing_important_information', 'missing'], ['conflicting_information', 'conflicting'], ['assumptions', 'assumption']] as const) strings(data.data_quality[key], `/data_quality/${key}`, (description, path) => add('quality_notes', path, { kind, description }));
  objects(data.artifact_log_references, '/artifact_log_references', (artifact, path) => add('artifact_references', path, { artifact_type: artifact.type ?? null, name: artifact.name ?? null, path_or_reference: artifact.path_or_reference ?? null, description: artifact.description ?? null }));
  const tags = new Set<string>();
  strings(data.classification.tags, '/classification/tags', (value, path) => {
    const normalized = bounded(value.trim().toLowerCase(), 160, path);
    if (tags.has(normalized)) { warn(path, 'DUPLICATE_TAG_OMITTED', 'Original retained in source'); return; }
    tags.add(normalized); add('tags', path, { original_value: value, normalized_value: normalized });
  });
  if (nonempty(data.automation_opportunity)) {
    const source = data.automation_opportunity;
    const opportunity = add('automation_opportunities', '/automation_opportunity', { candidate: source.candidate ?? null, name: source.name ?? null, trigger_description: source.trigger ?? null, estimated_minutes: source.estimated_time_savings_minutes ?? null, execution_enabled: false });
    for (const [key, kind] of [['inputs', 'input'], ['diagnostic_logic', 'diagnostic_logic'], ['safe_actions', 'safe_suggestion'], ['approval_required_actions', 'approval_required'], ['risks', 'risk']] as const) strings(source[key], `/automation_opportunity/${key}`, (description, path) => add('automation_steps', path, { opportunity_id: opportunity.values.id, kind, description, sequence: Number(path.split('/').at(-1)) }));
  }

  const nodeKinds: Record<string, string> = { incident_assets: 'device', symptoms: 'symptom', identifiers: 'error', components: 'component', root_causes: 'root_cause', actions: 'action', side_effects: 'side_effect', evidence_links: 'evidence', automation_opportunities: 'automation' };
  const factRows = [...rows], nodeByTarget = new Map<string, ResolutionRow>();
  const incidentNode = add('nodes', '', { kind: 'incident' });
  for (const row of factRows) if (nodeKinds[row.table]) {
    const kind = nodeKinds[row.table];
    nodeByTarget.set(row.values.id, add('nodes', row.values.source_pointer, { kind, [`${kind}_id`]: row.values.id }));
  }
  function edge(source: ResolutionRow, target: ResolutionRow, type: string, pointer: string) {
    add('relationships', pointer, { source_node_id: source.values.id, target_node_id: target.values.id, source_kind: source.values.kind, target_kind: target.values.kind, relationship_type: type, algorithm_version: RESOLUTION_NORMALIZER_VERSION, claim_kind: 'reported_fact' });
  }
  for (const row of factRows) {
    const node = nodeByTarget.get(row.values.id);
    if (!node) continue;
    if (row.table === 'incident_assets') edge(incidentNode, node, 'OCCURRED_ON', row.values.source_pointer);
    if (row.table === 'actions' && row.values.kind === 'failed') edge(node, incidentNode, 'FAILED_FOR', row.values.source_pointer);
    // A successful action is not automatically proof it resolved the whole incident.
    if (row.table === 'side_effects') {
      const trigger = nodeByTarget.get(String(row.values.triggering_action_id));
      const recovery = nodeByTarget.get(String(row.values.recovery_action_id));
      if (trigger) edge(trigger, node, 'FOLLOWED_BY', row.values.source_pointer);
      if (recovery && row.values.recovered === true) edge(node, recovery, 'RECOVERED_BY', row.values.source_pointer);
    }
    if (row.table === 'automation_opportunities' && row.values.candidate === true) edge(incidentNode, node, 'SUGGESTS_AUTOMATION', row.values.source_pointer);
  }
  const primary = factRows.find(row => row.table === 'root_causes' && row.values.kind === 'primary');
  if (primary) {
    const linked = new Set<string>();
    for (const reference of evidenceReferences) if (reference.targetId && !linked.has(reference.targetId)) {
      edge(nodeByTarget.get(primary.values.id)!, nodeByTarget.get(reference.targetId)!, 'SUPPORTED_BY', reference.path); linked.add(reference.targetId);
    }
  }
  // Each safe section is small and provenance-bound. Raw, extensions and human report stay outside search.
  const title = typeof incident.title === 'string' ? incident.title : '';
  function search(pointer: string, section: string, values: Record<string, unknown>) {
    const searchText = Object.entries(values).filter(([key, value]) => typeof value === 'string' && !/(?:^id$|_id$|source_pointer)/.test(key)).map(([, value]) => String(value)).join('\n');
    if (!searchText) return;
    // Large legitimate sections are split at field boundaries rather than truncated.
    let lines: string[] = [], chunkBytes = 0, part = 0;
    for (const value of searchText.split('\n')) {
      const lineBytes = Buffer.byteLength(value);
      if (lines.length && chunkBytes + 1 + lineBytes > 100_000) { save(); lines = []; chunkBytes = 0; }
      chunkBytes += (lines.length ? 1 : 0) + lineBytes;
      lines.push(value);
    }
    if (lines.length) save();
    function save() {
      const chunk = lines.join('\n');
      // Weight the title once per incident, not once per extracted observation.
      const searchTitle = section === 'incident' && part === 0 ? title : '';
      add('search_documents', pointer, { section: `${section}:${part++}`, title: searchTitle, search_text: chunk, redactor_version: RESOLUTION_REDACTOR_VERSION, content_sha256: sha256(`${searchTitle}\n${chunk}`) });
    }
  }
  search('', 'incident', incident);
  for (const row of factRows) search(row.values.source_pointer, row.table, row.values);
  if (rows.length > 15_000) throw new ResolutionInputError('RESOLUTION_PROJECTION_LIMIT', 413);
  if (Buffer.byteLength(JSON.stringify({ incident, rows })) > 8 * 1_048_576) throw new ResolutionInputError('RESOLUTION_PROJECTION_LIMIT', 413);
  const counts = Object.fromEntries([...new Set(rows.map(row => row.table))].sort().map(table => [table, rows.filter(row => row.table === table).length]));
  return { incident, rows, counts, warnings };
}
