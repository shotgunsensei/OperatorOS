// One checked-in definition emits the release DDL, catalog expectations and typed
// Drizzle tables. This does not connect to a database or replace db:apply.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'techdeck_resolution_';
const tables = [];
const constraints = [];
const indexes = [];
const confidence = "('CONFIRMED','HIGH','MODERATE','LOW','UNKNOWN')";
const risks = "('NONE','LOW','MEDIUM','HIGH','CRITICAL')";
const claims = "('reported_fact','supported_conclusion','hypothesis','unverified','pending_validation')";
const c = (type, extra = '') => `${type}${extra ? ` ${extra}` : ''}`;
const id = extra => c('VARCHAR(36)', extra);
const str = extra => c('TEXT', extra);
const time = extra => c('TIMESTAMPTZ', extra);
const json = (kind = 'object') => c('JSONB', `NOT NULL DEFAULT '${kind === 'array' ? '[]' : '{}'}'::jsonb`);

function constraint(table, suffix, definition) {
  const name = `tdri_${table}_${suffix}`;
  if (name.length > 63) throw new Error(`Constraint name too long: ${name}`);
  constraints.push({ table: prefix + table, name, definition, kind: definition.startsWith('FOREIGN') ? 'f' : definition.startsWith('UNIQUE') ? 'u' : 'c' });
}
function idx(table, suffix, definition) {
  indexes.push({ table: prefix + table, name: `tdri_${table}_${suffix}`, definition });
}
function foreign(table, column, target, targetColumn = 'id', extra = '') {
  constraint(table, `${column.replace(/_id$/, '')}_fk`, `FOREIGN KEY (tenant_id,${column}) REFERENCES ${target}(tenant_id,${targetColumn}) ${extra}`.trim());
}
function table(name, columns, child = true) {
  const all = {
    id: id('PRIMARY KEY DEFAULT gen_random_uuid()'),
    tenant_id: id('NOT NULL REFERENCES tenants(id) ON DELETE CASCADE'),
    ...(child ? { incident_id: id('NOT NULL'), revision: c('INTEGER', 'NOT NULL CHECK (revision > 0)'), source_pointer: c('VARCHAR(1024)', "NOT NULL CHECK (octet_length(source_pointer) <= 1024 AND (source_pointer = '' OR source_pointer ~ '^/([^~]|~[01])*$'))") } : {}),
    ...columns,
    created_by_user_id: id('REFERENCES users(id) ON DELETE SET NULL'),
    created_at: time('NOT NULL DEFAULT NOW()'),
  };
  // Give even column checks / authority FKs stable short names so the release
  // verifier can detect their removal, not only missing tables or columns.
  for (const [column, definition] of Object.entries(all)) {
    const checkAt = definition.indexOf(' CHECK (');
    if (checkAt >= 0) {
      constraint(name, `${column}_ck`, definition.slice(checkAt + 1));
      all[column] = definition.slice(0, checkAt);
    }
    const referenceAt = all[column].indexOf(' REFERENCES ');
    if (referenceAt >= 0) {
      constraint(name, `${column}_fk`, `FOREIGN KEY (${column}) ${all[column].slice(referenceAt + 1)}`);
      all[column] = all[column].slice(0, referenceAt);
    }
  }
  tables.push({ name: prefix + name, short: name, columns: all });
  constraint(name, 'tenant_uq', 'UNIQUE (tenant_id,id)');
  if (child) {
    constraint(name, 'revision_fk', `FOREIGN KEY (tenant_id,incident_id,revision) REFERENCES ${prefix}raw_exports(tenant_id,incident_id,revision) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED`);
    constraint(name, 'revision_id_uq', 'UNIQUE (tenant_id,incident_id,revision,id)');
    idx(name, 'incident_idx', '(tenant_id,incident_id,revision)');
  }
  for (const [key, definition] of Object.entries(all)) {
    if (definition.startsWith('JSONB')) constraint(name, `${key}_ck`, `CHECK (jsonb_typeof(${key})='${definition.includes("'[]'") ? 'array' : 'object'}')`);
    if (definition.startsWith('TEXT')) constraint(name, `${key}_len`, `CHECK (octet_length(${key}) <= 100000)`);
  }
}

table('incidents', {
  directory_organization_id: id(), directory_site_id: id(), ticket_id: id(),
  source_incident_id: str(), external_ticket_id: str(), title: str(),
  organization_label: str(), client_label: str(), technician_label: str(),
  opened_at: time(), closed_at: time(), first_observed_at: time(),
  source_status: str(), severity: str(), business_impact: str(),
  issue_summary: str(), resolution_summary: str(), one_line_resolution: str(),
  permanent_fix: str(), temporary_workaround: str(),
  category: str(), subcategory: str(), cause_type: str(), recurrence_risk: str(),
  root_cause_confidence: str(`CHECK (root_cause_confidence IN ${confidence})`),
  data_quality_confidence: str(`CHECK (data_quality_confidence IN ${confidence})`),
  primary_remediation: str("CHECK (primary_remediation IN ('COMPLETE','INCOMPLETE'))"),
  user_functionality: str("CHECK (user_functionality IN ('RESTORED','DEGRADED','UNKNOWN'))"),
  validation_status: str("CHECK (validation_status IN ('COMPLETE','PARTIAL','PENDING'))"),
  monitoring_required: c('BOOLEAN'), follow_up_required: c('BOOLEAN'), recommended_ticket_state: str(),
  security_relevant: c('BOOLEAN'), hardware_relevant: c('BOOLEAN'), network_relevant: c('BOOLEAN'),
  kb_candidate: c('BOOLEAN'), automation_candidate: c('BOOLEAN'), security_incident_suspected: c('BOOLEAN'),
  security_notes: str(), suggested_kb_title: str(), environment: json(),
  review_status: str("NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','reviewed'))"),
  minimum_role: str("NOT NULL DEFAULT 'member' CHECK (minimum_role IN ('member','admin','owner'))"),
  active_revision: c('INTEGER', 'CHECK (active_revision > 0)'),
  version: c('INTEGER', 'NOT NULL DEFAULT 1 CHECK (version > 0)'),
  updated_by_user_id: id('REFERENCES users(id) ON DELETE SET NULL'), updated_at: time('NOT NULL DEFAULT NOW()'), archived_at: time(),
}, false);
foreign('incidents', 'directory_organization_id', 'directory_organizations');
foreign('incidents', 'directory_site_id', 'directory_sites');
foreign('incidents', 'ticket_id', 'techdeck_tickets');
constraint('incidents', 'site_parent_fk', 'FOREIGN KEY (tenant_id,directory_organization_id,directory_site_id) REFERENCES directory_sites(tenant_id,organization_id,id)');
constraint('incidents', 'site_parent_ck', 'CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL)');
constraint('incidents', 'dates_ck', 'CHECK (closed_at IS NULL OR opened_at IS NULL OR closed_at >= opened_at)');
idx('incidents', 'recent_idx', '(tenant_id,created_at DESC,id)');
idx('incidents', 'client_idx', '(tenant_id,directory_organization_id,created_at DESC)');
idx('incidents', 'ticket_idx', '(tenant_id,ticket_id)');

table('raw_exports', {
  incident_id: id('NOT NULL'), revision: c('INTEGER', 'NOT NULL CHECK (revision > 0)'),
  schema_version: c('VARCHAR(16)', "NOT NULL CHECK (schema_version='1.0')"),
  source_type: str("NOT NULL CHECK (source_type IN ('paste','api','internal','fixture'))"),
  raw_text: c('TEXT', 'NOT NULL'), raw_sha256: c('VARCHAR(64)', 'NOT NULL'),
  fingerprint: c('VARCHAR(64)', "NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$')"),
  normalizer_version: c('VARCHAR(40)', 'NOT NULL'), redactor_version: c('VARCHAR(40)', 'NOT NULL'),
  human_report: c('TEXT'), validation_report: json(),
  security_screened: c('BOOLEAN', 'NOT NULL CHECK (security_screened = TRUE)'),
}, false);
// Accepted UTF-8 input is authoritative; JSONB is deliberately not used as raw storage.
constraint('raw_exports', 'size_ck', 'CHECK (octet_length(raw_text) BETWEEN 2 AND 1048576 AND (human_report IS NULL OR octet_length(human_report) <= 1048576))');
// Replace the ordinary text cap for the two bounded source documents.
for (let i = constraints.length - 1; i >= 0; i--) if (['tdri_raw_exports_raw_text_len','tdri_raw_exports_human_report_len'].includes(constraints[i].name)) constraints.splice(i, 1);
constraint('raw_exports', 'json_ck', "CHECK (jsonb_typeof(raw_text::jsonb)='object' AND (raw_text::jsonb->>'schema_version') IS NOT DISTINCT FROM '1.0' AND (raw_text::jsonb->>'export_type') IS NOT DISTINCT FROM 'msp_incident_closeout')");
constraint('raw_exports', 'checksum_ck', "CHECK (raw_sha256=encode(sha256(convert_to(raw_text,'UTF8')),'hex'))");
constraint('raw_exports', 'revision_uq', 'UNIQUE (tenant_id,incident_id,revision)');
constraint('raw_exports', 'fingerprint_uq', 'UNIQUE (tenant_id,fingerprint,normalizer_version)');
foreign('raw_exports', 'incident_id', prefix + 'incidents', 'id', 'ON DELETE CASCADE');
constraint('incidents', 'active_revision_fk', `FOREIGN KEY (tenant_id,id,active_revision) REFERENCES ${prefix}raw_exports(tenant_id,incident_id,revision) DEFERRABLE INITIALLY DEFERRED`);

table('incident_assets', {
  asset_id: id(), asset_type: str(), hostname: str(), device_name: str(), manufacturer: str(), model: str(), serial_number: str(),
  operating_system: str(), os_version: str(), os_build: str(), ip_addresses: json('array'), mac_addresses: json('array'), role: str(),
});
foreign('incident_assets', 'asset_id', 'techdeck_assets');
idx('incident_assets', 'asset_idx', '(tenant_id,asset_id,incident_id)');
idx('incident_assets', 'host_idx', '(tenant_id,lower(hostname))');

const claimColumns = { claim_kind: str(`NOT NULL DEFAULT 'reported_fact' CHECK (claim_kind IN ${claims})`), confidence: str(`CHECK (confidence IN ${confidence})`) };
table('symptoms', { kind: str("NOT NULL CHECK (kind IN ('reported','observed','unspecified'))"), description: str('NOT NULL'), ...claimColumns });
table('identifiers', {
  kind: str("NOT NULL CHECK (kind IN ('error_code','event_id','hostname','service','application','port','file_path','registry_path','os_build','error_message'))"),
  original_value: str('NOT NULL'), normalized_value: c('VARCHAR(2048)', 'NOT NULL'),
  numeric_value: c('BIGINT'), context: str(),
});
constraint('identifiers', 'port_ck', "CHECK (kind <> 'port' OR (numeric_value IS NOT NULL AND numeric_value BETWEEN 0 AND 65535))");
constraint('identifiers', 'normalized_size_ck', 'CHECK (octet_length(normalized_value) BETWEEN 1 AND 2000)');
idx('identifiers', 'exact_idx', '(tenant_id,kind,normalized_value)');
table('components', { kind: str("NOT NULL CHECK (kind IN ('application','service','vendor','platform','technology','component'))"), name: str('NOT NULL'), normalized_name: c('VARCHAR(512)', 'NOT NULL'), version_label: str() });
idx('components', 'name_idx', '(tenant_id,kind,normalized_name)');
table('root_causes', { kind: str("NOT NULL CHECK (kind IN ('primary','contributing','secondary','not_proven'))"), summary: str('NOT NULL'), category: str(), ...claimColumns });
table('actions', {
  kind: str("NOT NULL CHECK (kind IN ('diagnostic','corrective','failed','successful','recovery','final'))"),
  sequence: c('INTEGER', 'CHECK (sequence >= 0)'), observed_at: time(), action: str('NOT NULL'), purpose: str(),
  expected_result: str(), actual_result: str(), outcome: str("CHECK (outcome IN ('SUCCESS','FAILURE','PARTIAL','INCONCLUSIVE','NOT_RUN'))"),
  successful: c('BOOLEAN'), reason_failed: str(), error_message: str(), side_effect_text: str(), lesson: str(),
  source_evidence_text: str(), risk_level: str(`CHECK (risk_level IN ${risks})`), destructive: c('BOOLEAN'), requires_elevation: c('BOOLEAN'),
  reviewed_risk_level: str(`CHECK (reviewed_risk_level IN ${risks})`), reviewed_by_user_id: id('REFERENCES users(id) ON DELETE SET NULL'), ...claimColumns,
});
idx('actions', 'outcome_idx', '(tenant_id,outcome,kind)');
function localRef(name, column, target) {
  constraint(name, `${column.replace(/_id$/, '')}_fk`, `FOREIGN KEY (tenant_id,incident_id,revision,${column}) REFERENCES ${prefix}${target}(tenant_id,incident_id,revision,id)`);
}
table('commands', { action_id: id(), sequence: c('INTEGER', 'CHECK (sequence >= 0)'), source_type: str("NOT NULL CHECK (source_type IN ('incident','recommended_future'))"), command_type: str(), language: str(), command_text: str('NOT NULL'), search_text: str('NOT NULL'), purpose: str(), actual_result: str(), successful: c('BOOLEAN'), destructive: c('BOOLEAN'), requires_elevation: c('BOOLEAN'), risk_level: str(`CHECK (risk_level IN ${risks})`) });
localRef('commands', 'action_id', 'actions');
table('side_effects', { triggering_action_id: id(), recovery_action_id: id(), triggering_action_text: str(), recovery_action_text: str(), effect: str('NOT NULL'), severity: str(), recovered: c('BOOLEAN'), causal_status: str("NOT NULL DEFAULT 'temporal_association' CHECK (causal_status IN ('temporal_association','supported_causation','unverified'))"), ...claimColumns });
localRef('side_effects', 'triggering_action_id', 'actions'); localRef('side_effects', 'recovery_action_id', 'actions');
table('evidence_links', { evidence_id: id(), source_evidence_id: str(), observed_at: time(), evidence_type: str(), source_label: str(), description: str(), value_text: str(), numeric_value: c('NUMERIC'), units: str(), path: str(), ...claimColumns });
foreign('evidence_links', 'evidence_id', 'techdeck_evidence');
table('changes', { action_id: id(), sequence: c('INTEGER', 'CHECK (sequence >= 0)'), observed_at: time(), change_type: str(), target: str(), before_value: str(), after_value: str(), reason: str(), reversible: c('BOOLEAN'), rollback: str() });
localRef('changes', 'action_id', 'actions');
table('validations', { kind: str("NOT NULL CHECK (kind IN ('performed','successful','failed','pending'))"), description: str('NOT NULL'), ...claimColumns });
table('followups', { action: str('NOT NULL'), priority: str(), owner_label: str(), due_label: str(), due_at: time(), assigned_to_user_id: id('REFERENCES users(id) ON DELETE SET NULL'), completed_at: time() });
table('warnings', { description: str('NOT NULL'), side_effect_id: id(), risk_level: str(`CHECK (risk_level IN ${risks})`), ...claimColumns });
localRef('warnings', 'side_effect_id', 'side_effects');
table('lessons', { description: str('NOT NULL'), ...claimColumns });
table('escalation_conditions', { description: str('NOT NULL'), target: str(), ...claimColumns });
table('automation_opportunities', { candidate: c('BOOLEAN'), name: str(), trigger_description: str(), estimated_minutes: c('NUMERIC', 'CHECK (estimated_minutes >= 0 AND estimated_minutes <= 525600)'), status: str("NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','draft','reviewed','archived'))"), execution_enabled: c('BOOLEAN', 'NOT NULL DEFAULT FALSE CHECK (execution_enabled=FALSE)') });
table('automation_steps', { opportunity_id: id('NOT NULL'), kind: str("NOT NULL CHECK (kind IN ('input','diagnostic_logic','safe_suggestion','approval_required','risk'))"), description: str('NOT NULL'), sequence: c('INTEGER', 'CHECK (sequence >= 0)') });
localRef('automation_steps', 'opportunity_id', 'automation_opportunities');
table('ip_opportunities', { description: str('NOT NULL'), ...claimColumns });
table('quality_notes', { kind: str("NOT NULL CHECK (kind IN ('missing','conflicting','assumption'))"), description: str('NOT NULL') });
table('document_links', { document_id: id('NOT NULL'), document_version: c('INTEGER', 'NOT NULL CHECK (document_version > 0)'), kind: str("NOT NULL CHECK (kind IN ('knowledge_base','runbook','command_reference'))") });
constraint('document_links', 'document_version_fk', 'FOREIGN KEY (tenant_id,document_id,document_version) REFERENCES techdeck_document_revisions(tenant_id,document_id,version)');
idx('document_links', 'document_idx', '(tenant_id,document_id,document_version)');
table('artifact_references', { artifact_type: str(), name: str(), path_or_reference: str(), description: str() });
table('tags', { original_value: str('NOT NULL'), normalized_value: c('VARCHAR(160)', 'NOT NULL') });
constraint('tags', 'value_uq', 'UNIQUE (tenant_id,incident_id,revision,normalized_value)');
idx('tags', 'value_idx', '(tenant_id,normalized_value)');
table('search_documents', { section: c('VARCHAR(80)', 'NOT NULL'), title: str('NOT NULL'), search_text: str('NOT NULL'), redactor_version: c('VARCHAR(40)', 'NOT NULL'), content_sha256: c('VARCHAR(64)', "NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$')"), search_vector: c('TSVECTOR', "GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig,coalesce(title,'')),'A') || setweight(to_tsvector('english'::regconfig,search_text),'B')) STORED") });
idx('search_documents', 'fts_idx', 'USING GIN (search_vector)');
constraint('search_documents', 'chunk_uq', 'UNIQUE (tenant_id,incident_id,revision,section,source_pointer)');

const nodeTargets = { symptom: 'symptoms', error: 'identifiers', component: 'components', root_cause: 'root_causes', action: 'actions', side_effect: 'side_effects', device: 'incident_assets', kb: 'document_links', automation: 'automation_opportunities', evidence: 'evidence_links' };
table('nodes', { kind: c('VARCHAR(32)', 'NOT NULL'), ...Object.fromEntries(Object.keys(nodeTargets).map(kind => [`${kind}_id`, id()])) });
for (const [kind, target] of Object.entries(nodeTargets)) localRef('nodes', `${kind}_id`, target);
const refs = Object.keys(nodeTargets).map(kind => `${kind}_id`);
constraint('nodes', 'target_ck', `CHECK ((kind='incident' AND num_nonnulls(${refs.join(',')})=0) OR (num_nonnulls(${refs.join(',')})=1 AND (${Object.keys(nodeTargets).map(kind => `(kind='${kind}' AND ${kind}_id IS NOT NULL)`).join(' OR ')})))`);
constraint('nodes', 'kind_uq', 'UNIQUE (tenant_id,id,kind)');
constraint('nodes', 'source_uq', 'UNIQUE (tenant_id,incident_id,revision,id,kind)');
constraint('nodes', 'source_pointer_uq', 'UNIQUE (tenant_id,incident_id,revision,kind,source_pointer)');

const edgeKinds = {
  INDICATES: ['symptom', 'root_cause'], ASSOCIATED_WITH: ['error', 'component'], RESOLVED: ['action', 'incident'],
  FAILED_FOR: ['action', 'incident'], CAUSED_SIDE_EFFECT: ['action', 'side_effect'], FOLLOWED_BY: ['action', 'side_effect'],
  RECOVERED_BY: ['side_effect', 'action'], AFFECTS: ['root_cause', 'component'], SIMILAR_TO: ['incident', 'incident'],
  OCCURRED_ON: ['incident', 'device'], GENERATED: ['incident', 'kb'], SUGGESTS_AUTOMATION: ['incident', 'automation'],
  SUPPORTED_BY: ['root_cause', 'evidence'],
};
table('relationships', { source_node_id: id('NOT NULL'), target_node_id: id('NOT NULL'), source_kind: c('VARCHAR(32)', 'NOT NULL'), target_kind: c('VARCHAR(32)', 'NOT NULL'), relationship_type: c('VARCHAR(32)', 'NOT NULL'), evidence_link_id: id(), algorithm_version: c('VARCHAR(40)'), score: c('NUMERIC', 'CHECK (score >= 0 AND score <= 1)'), ...claimColumns });
constraint('relationships', 'source_fk', `FOREIGN KEY (tenant_id,incident_id,revision,source_node_id,source_kind) REFERENCES ${prefix}nodes(tenant_id,incident_id,revision,id,kind) ON DELETE CASCADE`);
constraint('relationships', 'target_fk', `FOREIGN KEY (tenant_id,target_node_id,target_kind) REFERENCES ${prefix}nodes(tenant_id,id,kind) ON DELETE CASCADE`);
localRef('relationships', 'evidence_link_id', 'evidence_links');
constraint('relationships', 'type_ck', `CHECK (${Object.entries(edgeKinds).map(([edge, [source, target]]) => `(relationship_type='${edge}' AND source_kind='${source}' AND target_kind='${target}')`).join(' OR ')})`);
constraint('relationships', 'self_ck', 'CHECK (source_node_id <> target_node_id)');
constraint('relationships', 'causal_ck', "CHECK (relationship_type <> 'CAUSED_SIDE_EFFECT' OR (claim_kind='supported_conclusion' AND confidence IS NOT NULL AND confidence IN ('CONFIRMED','HIGH') AND evidence_link_id IS NOT NULL))");
constraint('relationships', 'edge_uq', 'UNIQUE (tenant_id,source_node_id,target_node_id,relationship_type)');
idx('relationships', 'source_idx', '(tenant_id,source_node_id,relationship_type)');
idx('relationships', 'target_idx', '(tenant_id,target_node_id,relationship_type)');

const ddl = [
  ...tables.map(t => `CREATE TABLE IF NOT EXISTS ${t.name} (\n${Object.entries(t.columns).map(([name, definition]) => `  ${name} ${definition}`).join(',\n')}\n);`),
  // Unique keys precede ALL dependent foreign keys, including the revision cycle.
  ...[...constraints].sort((a, b) => (a.kind === 'f') - (b.kind === 'f')).map(c => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.${c.table}') AND conname='${c.name}') THEN ALTER TABLE ${c.table} ADD CONSTRAINT ${c.name} ${c.definition}; END IF; END $$;`),
  ...indexes.map(i => `CREATE INDEX IF NOT EXISTS ${i.name} ON ${i.table} ${i.definition};`),
  `CREATE OR REPLACE FUNCTION tdri_preserve_raw_export() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'created_by_user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'created_by_user_id')
     OR (NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id AND NEW.created_by_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Accepted resolution source is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER tdri_raw_export_immutable BEFORE UPDATE ON ${prefix}raw_exports FOR EACH ROW EXECUTE FUNCTION tdri_preserve_raw_export();`,
].join('\n\n');

function camel(value) { return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase()); }
function columnCode(name, def) {
  let code;
  if (def.startsWith('VARCHAR')) code = `varchar('${name}', { length: ${def.match(/\((\d+)\)/)[1]} })`;
  else if (def.startsWith('TIMESTAMPTZ')) code = `timestamp('${name}', { withTimezone: true })`;
  else if (def.startsWith('INTEGER')) code = `integer('${name}')`;
  else if (def.startsWith('BIGINT')) code = `bigint('${name}', { mode: 'bigint' })`;
  else if (def.startsWith('NUMERIC')) code = `numeric('${name}')`;
  else if (def.startsWith('BOOLEAN')) code = `boolean('${name}')`;
  else if (def.startsWith('JSONB')) code = `jsonb('${name}').$type<${def.includes("'[]'") ? 'string[]' : 'Record<string, unknown>'}>()`;
  else if (def.startsWith('TSVECTOR')) code = `tsvector('${name}').generatedAlwaysAs(sql\`setweight(to_tsvector('english'::regconfig,coalesce(title,'')),'A') || setweight(to_tsvector('english'::regconfig,search_text),'B')\`)`;
  else code = `text('${name}')`;
  if (def.includes('PRIMARY KEY')) code += '.primaryKey()';
  else if (def.includes('NOT NULL')) code += '.notNull()';
  if (def.includes('DEFAULT gen_random_uuid()')) code += '.default(sql`gen_random_uuid()`)';
  else if (def.includes('DEFAULT NOW()')) code += '.defaultNow()';
  else if (def.includes('DEFAULT FALSE')) code += '.default(false)';
  else if (def.includes('DEFAULT 1')) code += '.default(1)';
  else if (def.includes('DEFAULT')) {
    const value = def.match(/DEFAULT '([^']*)'/)[1];
    code += `.default(${value === '{}' || value === '[]' ? value : JSON.stringify(value)})`;
  }
  return `  ${camel(name)}: ${code},`;
}
const header = '// Generated by scripts/techdeck/generate-resolution-storage.mjs --write. Edit that definition.\n';
function constraintCode(item) {
  const { name, definition } = item;
  if (item.kind === 'c') return `check('${name}', sql.raw(${JSON.stringify(definition.slice(7, -1))}))`;
  const columns = value => value.split(',').map(col => `t.${camel(col.trim())}`).join(', ');
  if (item.kind === 'u') return `unique('${name}').on(${columns(definition.match(/^UNIQUE \(([^)]+)\)/)[1])})`;
  const match = definition.match(/^FOREIGN KEY \(([^)]+)\) REFERENCES ([a-z_]+)\(([^)]+)\)/);
  if (!match) throw new Error(`Unmapped foreign key: ${name}`);
  const target = camel(match[2]);
  const refs = match[3].split(',').map(col => `${target}.${camel(col.trim())}`).join(', ');
  const onDelete = definition.match(/ON DELETE (CASCADE|SET NULL)/)?.[1].toLowerCase();
  return `foreignKey({ name: '${name}', columns: [${columns(match[1])}], foreignColumns: [${refs}] })${onDelete ? `.onDelete('${onDelete}')` : ''}`;
}
function indexCode(item) {
  const match = item.definition.match(/^(?:USING (GIN) )?\((.*)\)$/);
  if (!match) throw new Error(`Unmapped index: ${item.name}`);
  const expressions = match[2].split(',').map(value => `sql.raw(${JSON.stringify(value)})`).join(', ');
  return `index('${item.name}').${match[1] ? "using('gin', " : 'on('}${expressions})`;
}
const outputs = new Map([
  ['apps/api/src/generated/techdeck-resolution-storage.ts', `${header}export const resolutionStorageDdl = ${JSON.stringify(ddl)};\nexport const resolutionStorageTables = ${JSON.stringify(tables, null, 2)} as const;\nexport const resolutionStorageConstraints = ${JSON.stringify(constraints, null, 2)} as const;\nexport const resolutionStorageIndexes = ${JSON.stringify(indexes, null, 2)} as const;\n`],
  ['apps/api/src/techdeck-resolution-schema.ts', `${header}// Root release SQL owns apply and deferred-FK timing (not expressible in Drizzle).\n// Lazy extra-config callbacks resolve platform references after schema initialization.\nimport { pgTable, text, varchar, timestamp, integer, bigint, numeric, boolean, jsonb, customType, check, unique, foreignKey, index, type PgTableExtraConfigValue } from 'drizzle-orm/pg-core';\nimport { sql } from 'drizzle-orm';\nimport { tenants, users, directoryOrganizations, directorySites, techdeckTickets, techdeckAssets, techdeckEvidence, techdeckDocumentRevisions } from './schema.js';\nconst tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });\n\n${tables.map(t => `export const ${camel(t.name)} = pgTable('${t.name}', {\n${Object.entries(t.columns).map(([name, def]) => columnCode(name, def)).join('\n')}\n}, (t): PgTableExtraConfigValue[] => [\n${[...constraints.filter(c => c.table === t.name).map(constraintCode), ...indexes.filter(i => i.table === t.name).map(indexCode)].map(line => `  ${line},`).join('\n')}\n]);`).join('\n\n')}\n`],
]);
for (const [file, content] of outputs) {
  if (process.argv.includes('--write')) writeFileSync(resolve(root, file), content);
  else if (readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n') !== content) throw new Error(`Resolution storage artifact stale: ${file}`);
}
console.log(`Resolution storage ${process.argv.includes('--write') ? 'generated' : 'verified'}: ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} indexes.`);
