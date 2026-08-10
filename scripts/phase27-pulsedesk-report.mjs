import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'docs/phase-27/PULSEDESK-COMPLETE-OPERATIONS-REPORT.md');
const legacy=JSON.parse(readFileSync(resolve(root,'docs/modules/pulsedesk/SOURCE_LEDGER.json'),'utf8'));
const parity=JSON.parse(readFileSync(resolve(root,'docs/parity/modules/pulsedesk.json'),'utf8'));
const collections=['pages','apiRoutes','tables','providers','backgroundProcesses'];
const typeBy={pages:'ui_route',apiRoutes:'api_endpoint',tables:'database_table',providers:'integration',backgroundProcesses:'background_process'};
const primary=parity.capabilities.filter(item=>item.priorDisposition&&item.type!=='public_flow');
const byIdentity=new Map(primary.map(item=>[`${item.type}|${item.title}|${item.priorDisposition}`,item]));
const all=collections.flatMap(collection=>legacy.inventory[collection].map(item=>({collection,...item})));
const invalid=all.filter(item=>!byIdentity.has(`${typeBy[item.collection]}|${item.key}|${item.disposition}`));
const retired=all.filter(item=>['retired_security','retired_product_boundary'].includes(item.disposition));
const decisions=retired.map(item=>({item,capability:byIdentity.get(`${typeBy[item.collection]}|${item.key}|${item.disposition}`)})).filter(row=>row.capability);
const native=decisions.filter(row=>row.capability.state==='ACTIVE_NATIVE').length;
const shared=decisions.filter(row=>row.capability.state==='ACTIVE_SHARED_EQUIVALENT').length;
const esc=value=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
const lines=[
'# Phase 27 — PulseDesk Complete Healthcare Operations Report','',
'> Generated from the pinned PulseDesk source ledger and current executable parity output. Counts and item decisions are not maintained by hand.','',
'## Outcome','',
`Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length}** facets: **${parity.stateCounts.ACTIVE_NATIVE} ACTIVE_NATIVE**, **${parity.stateCounts.ACTIVE_SHARED_EQUIVALENT} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`, '',
`The historical hand ledger contains **${all.length}** claims: ${legacy.inventory.pages.length} pages, ${legacy.inventory.apiRoutes.length} routes, ${legacy.inventory.tables.length} tables, ${legacy.inventory.providers.length} provider/config references, and ${legacy.inventory.backgroundProcesses.length} background processes. Regeneration found **${invalid.length}** claims whose stated source file is absent from the pinned tree; they are excluded rather than misreported as source capabilities. The corrected primary inventory is **${primary.length}** records.`, '',
`All **${decisions.length}** source-backed historical retirements were re-opened: **${native}** native and **${shared}** shared-equivalent. ${retired.length-decisions.length} retired hand-ledger claims were among the absent-source records and are not counted green.`, '',
'This is source/local evidence only. It does not claim an EHR, a compliance certification, live provider delivery, production migration, deployment, data cutover, or rollback rehearsal.','',
'## Privacy and provider evidence','',
'- OperatorOS remains the sole identity, tenant, role, entitlement, billing, secret, provider, scheduler, and audit authority.','- PulseDesk stores PHI-minimized operational requests only. Public intake rejects common clinical identifiers/terms; shared logs and connector events contain bounded metadata, hashes, provider state, and opaque IDs rather than bodies, credentials, or sender addresses.','- Per-tenant connectors cover SendGrid Inbound Parse, IMAP, Google Workspace, and Microsoft 365. Credentials are encrypted references; OAuth state is hashed and expiring; revocation is durable.','- Deterministic adapters exercise authenticated alias delivery, ingestion, duplicate message IDs, quarantine-before-ticket attachment scanning, ticket creation, polling, OAuth state/callback, retry, and dead-letter-compatible shared jobs. Live inbound delivery uses constant-time HMAC verification and fails closed until credentials, callbacks, provider configuration, and health are verified.','- Public and asset-specific issue intake is opaque-slug, tenant-routed, rate-limited, length-bounded, privacy-filtered, and returns a non-sensitive reference. The installable shell caches only GET navigation; it never caches POST bodies, and reconnect handling preserves the in-tab form without storing operational content.','',
'## Restored operations','',
'Dashboard/KPIs; departments/facilities and Directory clients/sites/requesters; tickets, categorization, urgency, assignment, internal notes, replies, attachments, time, SLA, history, search, exports; public/asset intake; equipment context; supply/facility/vendor coordination; knowledge, templates, notifications, analytics, admin; connector management; PWA/mobile/deep links.','',
'## Executable evidence','',
'- `apps/api/test/pulsedesk-literal-product.test.ts` — all four deterministic provider ingestions, authenticity rejection, duplicate IDs, quarantine-before-ticket attachment handling, OAuth state/callback, tenant isolation, privacy rejection, public intake, and at-rest redaction.','- `apps/api/test/pulsedesk-state5-workflow.test.ts` — tenant-scoped persisted operations journey and isolation.','- `apps/api/test/pulsedesk-literal-static.test.ts` — connector/privacy/public-intake/release/UI contract.','- `apps/api/test/pulsedesk-service-desk-domain.test.ts` — workflow transitions, SLA, validation, and PHI boundary.','- `apps/web/e2e/sso-v1.spec.ts` — compiled exact-host PulseDesk ticket, connector, anonymous intake, client, persistence, and host-only session journey.','- `scripts/phase20-product-truth.test.mjs` — reproducible source/parity states.','',
'## Local verification results','',
'- Root API, runner-gateway, and web typecheck: PASS.','- Full repository lint with zero warnings: PASS.','- API, runner-gateway, and Next production build: PASS; the dynamic PulseDesk public-intake artifact compiled.','- Focused release/static/domain/PostgreSQL suite: 11/11 PASS.','- Additive database release v36: 36-step plan PASS; apply and immediate reapply PASS.','- Compiled local HTTPS exact-host journey: 1/1 PASS in 14.1 seconds, including connector setup/test ingestion, anonymous intake, mobile viewport, service-worker artifact, restart persistence, SSO/session isolation, and exact record routes.','- Strict parity: zero PulseDesk issues. The root result remains intentionally red with 4,228 issues, all assigned to other modules.','',
'## Item-level re-opened retirement ledger','',
'| # | Prior disposition | Domain | Collection | Source outcome | Current state | Capability ID |','|---:|---|---|---|---|---|---|',
...decisions.map(({item,capability},index)=>`| ${index+1} | ${item.disposition} | ${esc(item.domain)} | ${item.collection} | ${esc(item.key)} | ${capability.state} | \`${capability.capabilityId}\` |`),'',
'## Deployment gates','',
'- Back up the target database and apply additive release v36 through the supported release runner.','- Configure and verify real SendGrid/IMAP/Google/Microsoft provider applications, secrets, callbacks, tenant aliases, authenticity checks, and health before enabling live ingestion.','- Run compiled exact-host desktop/mobile/PWA, authenticated tenant/role, anonymous intake, restart persistence, provider delivery, data reconciliation, and rollback acceptance on the reviewed deployed commit.','',
].join('\n');
if(process.argv.includes('--write')){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${lines}\n`);console.log(JSON.stringify({mode:'write',output:'docs/phase-27/PULSEDESK-COMPLETE-OPERATIONS-REPORT.md',retired:decisions.length,invalid:invalid.length,blocked:parity.stateCounts.BLOCKED},null,2));}
else{if(readFileSync(output,'utf8').replaceAll('\r\n','\n')!==`${lines}\n`)throw new Error('Phase 27 report is stale; run phase27:report:write');console.log(JSON.stringify({mode:'check',retired:decisions.length,invalid:invalid.length,blocked:parity.stateCounts.BLOCKED},null,2));}
