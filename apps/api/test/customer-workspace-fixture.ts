import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { PgDialect } from 'drizzle-orm/pg-core';
import ts from 'typescript';
import { utf16Length } from '../src/lib/zod-string-length.js';

const require = createRequire(import.meta.url);
const dialect = new PgDialect();
export type Row = Record<string, any>;
export function compiled(query: any) { return dialect.sqlToQuery(query); }
export function loadWorkspaceSource(relative: string, dependencies: Row) {
  const source = process.env.CUSTOMER_WORKSPACE_BASELINE === '1' && relative === 'lib/cross-module-workflow-adapters.ts'
    ? execFileSync('git', ['show', 'beaaf1dbccd2261bf57139e32104bf45d078627d:apps/api/src/lib/cross-module-workflow-adapters.ts'], { encoding: 'utf8', cwd: new URL('../../..', import.meta.url) })
    : readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');
  const module = { exports: {} as Row };
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(javascript, { module, exports: module.exports, Buffer, Date, URL,
    process: { env: { NODE_ENV: 'test', APP_ENV: 'test' } },
    fetch() { throw new Error('No network permitted'); },
    require(name: string) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name === '../lib/zod-string-length.js') return { utf16Length };
      if (['drizzle-orm', 'node:crypto', 'zod'].includes(name)) return require(name);
      throw new Error(`Unmodeled dependency: ${relative} -> ${name}`);
    },
  }, { filename: `actual-${relative}` });
  return module.exports;
}

/** Bounded actual WHERE evaluation. Unsupported policy syntax is a test failure. */
export function selectRows(query: ReturnType<typeof compiled>, rows: Row[]) {
  const where = query.sql.split(/\bWHERE\b/i).at(-1)?.replace(/\b(?:ORDER BY|LIMIT|FOR SHARE|FOR UPDATE)\b[\s\S]*/i, '').trim();
  assert.ok(where);
  return rows.filter(row => where.split(/\s+AND\s+/i).every(expression => {
    const text = expression.trim();
    const equal = /^(?:\w+\.)?(\w+)\s*(?:=|IS NOT DISTINCT FROM)\s*(?:\$(\d+)|'([^']*)')$/i.exec(text);
    if (equal) { assert.ok(Object.hasOwn(row, equal[1]), `Unknown column ${equal[1]}`); const value = equal[2] ? query.params[Number(equal[2]) - 1] : equal[3]; return value == null ? row[equal[1]] == null : String(row[equal[1]]) === String(value); }
    const nil = /^(?:\w+\.)?(\w+) IS NULL$/i.exec(text);
    if (nil) { assert.ok(Object.hasOwn(row, nil[1])); return row[nil[1]] == null; }
    throw new Error(`Unmodeled WHERE predicate: ${text}`);
  }));
}

export const ids = { tenant: '10000000-0000-4000-8000-000000000001', otherTenant: '10000000-0000-4000-8000-000000000002', organization: '20000000-0000-4000-8000-000000000001', contact: '30000000-0000-4000-8000-000000000001', site: '40000000-0000-4000-8000-000000000001', job: '50000000-0000-4000-8000-000000000001', user: '60000000-0000-4000-8000-000000000001', native: '70000000-0000-4000-8000-000000000001' };

export function workspaceFixture() {
  const organization: Row = { id: ids.organization, tenant_id: ids.tenant, name: 'Synthetic business', normalized_name: 'synthetic business', type: 'client', website: null, version: 1, customer_address: null, status: 'active', archived_at: null };
  const contact: Row = { id: ids.contact, tenant_id: ids.tenant, first_name: 'Sam', last_name: 'Example', email: 'sam@example.test', phone: null, title: null, version: 1, status: 'active', archived_at: null };
  const association: Row = { id: 'organization-contact-link', tenant_id: ids.tenant, organization_id: ids.organization, contact_id: ids.contact, is_primary: true, role: 'primary' };
  const site: Row = { id: ids.site, tenant_id: ids.tenant, organization_id: ids.organization, name: 'Office', type: 'office', timezone: 'UTC', address_id: null, version: 1, status: 'active', archived_at: null };
  const job: Row = { id: ids.job, tenant_id: ids.tenant, version: 1, customer_version: 1, deleted_at: null, number: 42, title: 'Existing work', status: 'scheduled', description: 'Synthetic work scope', customer_id: ids.native, customer_name: 'Original customer fact', customer_email: 'sam@example.test', customer_phone: null, customer_address: 'Original address', organization_id: ids.organization, primary_contact_id: ids.contact, primary_site_id: ids.site, site_id: null, assigned_to_user_id: null, scheduled_start: null };
  const native: Row[] = [], cases: Row[] = [], reports: Row[] = [], statements: string[] = [];
  const lockTails = new Map<string, Promise<void>>();
  let counter = 0;
  let sourceLockHook = () => undefined;
  function executor(releases: Array<() => void>): Row { return { async execute(value: any) {
    const query = compiled(value); statements.push(query.sql);
    if (/pg_advisory_xact_lock/.test(query.sql)) {
      const key = String(query.params[0]), previous = lockTails.get(key) ?? Promise.resolve();
      let release!: () => void; const next = new Promise<void>(resolve => { release = resolve; });
      lockTails.set(key, next); await previous; releases.push(release); return { rows: [{}] };
    }
    if (/FROM directory_organizations\b/.test(query.sql)) {
      if (/ILIKE/.test(query.sql)) { assert.match(query.sql, /tenant_id=\$1/); const rows = organization.tenant_id === query.params[0] && !organization.archived_at && organization.status === 'active' ? [organization] : []; return { rows }; }
      return { rows: selectRows(query, [organization]).map(row => ({ id: row.id, name: row.name, type: row.type, website: row.website, version: row.version, customer_address: row.customer_address })) };
    }
    if (/FROM directory_contacts\b/.test(query.sql)) return { rows: selectRows(query, [contact]).map(row => ({ id: row.id, first_name: row.first_name, last_name: row.last_name, email: row.email, phone: row.phone, title: row.title, version: row.version })) };
    if (/FROM directory_organization_contacts\b/.test(query.sql)) {
      if (/JOIN directory_contacts/.test(query.sql)) { assert.match(query.sql, /c.tenant_id=link.tenant_id/); return { rows: association.tenant_id === query.params[0] && association.organization_id === query.params[1] && contact.tenant_id === association.tenant_id && contact.status === 'active' && !contact.archived_at ? [{ ...contact, is_primary: association.is_primary }] : [] }; }
      return { rows: selectRows(query, [association]).map(row => ({ id: row.id, is_primary: row.is_primary, role: row.role })) };
    }
    if (/FROM directory_sites\b/.test(query.sql)) {
      if (/LEFT JOIN/.test(query.sql)) { assert.match(query.sql, /a.tenant_id=s.tenant_id/); return { rows: site.tenant_id === query.params[0] && site.organization_id === query.params[1] && site.status === 'active' && !site.archived_at ? [{ ...site, address: null }] : [] }; }
      return { rows: selectRows(query, [site]).map(row => ({ id: row.id, name: row.name, type: row.type, timezone: row.timezone, address_id: row.address_id, version: row.version })) };
    }
    if (/FROM directory_addresses\b/.test(query.sql)) return { rows: [] };
    if (/FROM tradeflowkit_jobs j/.test(query.sql)) {
      assert.match(query.sql, /c.tenant_id=j.tenant_id/); assert.match(query.sql, /c.deleted_at IS NULL/);
      if (/FOR SHARE OF j,c/.test(query.sql)) { const hook = sourceLockHook; sourceLockHook = () => undefined; hook(); }
      if (/c.organization_id=\$/.test(query.sql)) return { rows: job.tenant_id === query.params[0] && job.organization_id === query.params[1] && !job.deleted_at ? [{ ...job, primary_site_id: job.site_id ?? job.primary_site_id }] : [] };
      const projected = /COALESCE\(j.site_id/.test(query.sql) ? { ...job, primary_site_id: job.site_id ?? job.primary_site_id } : { ...job };
      return { rows: selectRows(query, [projected]) };
    }
    if (/FROM snapproof_customers/.test(query.sql)) return { rows: selectRows(query, native).slice(0, 2) };
    if (/INSERT INTO snapproof_customers/.test(query.sql)) {
      const row = { id: `native-created-${++counter}`, tenant_id: query.params[0], created_by_user_id: query.params[1], name: query.params[2], email: query.params[3], phone: query.params[4], address: query.params[5], notes: query.params[6], directory_organization_id: query.params[7], directory_site_id: query.params[8], directory_contact_id: query.params[9], archived_at: null };
      native.push(row); return { rows: [row] };
    }
    if (/INSERT INTO snapproof_cases/.test(query.sql)) { const row = { id: `case-${++counter}`, customer_id: query.params[3] }; cases.push(row); return { rows: [row] }; }
    if (/INSERT INTO snapproof_reports/.test(query.sql)) { const row = { id: `report-${++counter}`, content: JSON.parse(String(query.params[4])) }; reports.push(row); return { rows: [row] }; }
    throw new Error(`Unmodeled SQL: ${query.sql}`);
  } }; }
  const database = { execute: executor([]).execute, async transaction(task: (tx: Row) => Promise<any>) { const releases: Array<() => void> = []; try { return await task(executor(releases)); } finally { for (const release of releases.reverse()) release(); } } };
  const helper = loadWorkspaceSource('lib/customer-workspace.ts', { '../db.js': { db: database } });
  const adapter = loadWorkspaceSource('lib/cross-module-workflow-adapters.ts', { '../db.js': { db: database }, './customer-workspace.js': helper, './shared-attachments.js': {}, './faultlinelab-domain.js': {}, './ninja-launch-kit-access.js': {}, './ninja-launch-kit-phase34.js': {} });
  const selection = { organizationId: ids.organization, contactId: ids.contact, siteId: ids.site };
  return { organization, contact, association, site, job, native, cases, reports, statements, database, helper, selection,
    beforeSourceLock(task: () => void) { sourceLockHook = task; },
    context: async () => (await helper.resolveQualifiedDirectoryContext(ids.tenant, selection)).context,
    async deliver(payload: Row = {}) { return database.transaction(executor => adapter.deliverNativeWorkflow('tradeflowkit.job_to_snapproof', { tenantId: ids.tenant, actorUserId: ids.user, aggregateId: String(job.id), eventId: `event-${counter}`, workflowRunId: 'workflow-fixture', sourceModuleId: 'tradeflow-module', destinationModuleId: 'snap-module', sourceCanReviewAll: false, payload: { expectedSourceVersion: 1, ...payload }, executor })); },
  };
}
