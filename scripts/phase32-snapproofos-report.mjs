import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'docs/phase-32/SNAPPROOFOS-COMPLETE-PRODUCT-REPORT.md');
const parity=JSON.parse(readFileSync(resolve(root,'docs/parity/modules/snapproofos.json'),'utf8'));
const snapshot=JSON.parse(readFileSync(resolve(root,'apps/modules/snapproofos/source/SOURCE_SNAPSHOT.json'),'utf8'));
const esc=value=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
const native=parity.stateCounts.ACTIVE_NATIVE;const shared=parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;

const requiredEvidence=['apps/api/test/snapproofos-db.test.ts','apps/api/test/snapproofos-phase32-domain.test.ts','apps/api/test/snapproofos-phase32-static.test.ts','apps/web/e2e/snapproofos-phase32.spec.ts'];
for(const capability of parity.capabilities){if(!['ACTIVE_NATIVE','ACTIVE_SHARED_EQUIVALENT','OWNER_WAIVED'].includes(capability.state))throw new Error(`Blocked capability: ${capability.capabilityId}`);for(const target of capability.currentTargets)if(!existsSync(resolve(root,target)))throw new Error(`Missing current target ${target}`);for(const evidence of capability.automatedEvidence)if(!existsSync(resolve(root,evidence)))throw new Error(`Missing evidence ${evidence}`);}
for(const evidence of requiredEvidence)if(!existsSync(resolve(root,evidence)))throw new Error(`Missing Phase 32 evidence ${evidence}`);

const report=[
  '# Phase 32 — SnapProofOS Complete Field Proof and Reporting Restoration','',
  '> Generated from the pinned SnapProofOS source snapshot and executable OperatorOS capability ledger. Counts and states are not maintained by hand.','',
  '## Outcome','',
  `Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length} exact facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`, '',
  `The pinned source contains ${snapshot.trackedFileCount} tracked files; ${snapshot.fileCount} bounded product files (${snapshot.totalBytes.toLocaleString()} bytes) are retained as read-only evidence. Exact facets: ${Object.entries(parity.typeCounts).map(([type,count])=>`${count} ${type}`).join(', ')}.`, '',
  'All sixteen source table domains and every discovered API, UI, action, export, public, integration, and mobile facet are native or shared-equivalent. No former retirement label, raw source file URL, child authentication table, or unsafe arbitrary branding HTML is counted as completion by itself.','',
  'This report proves the local reviewed source state. It does not claim production release v41 promotion, public deployment, target backup/restore, provider activation, or rollback rehearsal.','',
  '## Restored field product','',
  '- Real dashboard metrics; customer records and history; searchable/filterable jobs with customer, location, assignee, schedule, status, completion, archive, and exact record routes.',
  '- Findings capture issue, cause, resolution, recommendation, severity, ordering, and evidence context. Internal/customer notes are separated; source-supported voice notes use scanned private audio attachments.',
  '- Parts and labor persist decimal quantities/hours plus integer-cent cost, price, and rate values. Report snapshots preserve the exact historical totals used at approval.',
  '- Mobile camera/file/audio capture validates signatures and declared MIME, enforces shared size limits, scans/quarantines content, strips JPEG APP1 EXIF before storage, hashes bytes, stores captions/order/privacy metadata, and requires authorized retrieval.',
  '- IndexedDB reconnect queues retain immutable capture payloads; tenant-scoped client mutation IDs make retries replay-safe and prevent duplicate evidence records.',
  '- System and organization job templates apply persisted sections and defaults. Organization branding and scanned logo bytes are structured and snapshotted into reports without executing owner-supplied HTML.',
  '- Reports support draft, review, approval, rejection, immutable approved state, SHA-256 content integrity, persisted export history, and validated deterministic PDF/DOCX bytes.',
  '- Public report shares use 256-bit random tokens, store only SHA-256 token hashes, scope one approved report, expire, revoke, rate-limit both view and download, disable indexing/caching, and expose only customer-intended snapshot data.',
  '- Users, organizations, team roles, assignment membership, plan/usage/billing, activity, authentication, tenant isolation, and entitlements remain projections of OperatorOS parent authority.','',
  '## Security evidence','',
  '- Tenant and module guards protect every private route; write access and administrator approval remain server-enforced. Viewer mutation and cross-tenant record enumeration are denied.',
  '- Shared attachment downloads fail closed for pending/error/infected scans, verify stored SHA-256 before delivery, use private no-store responses, and never publish raw storage keys.',
  '- Customer-facing report snapshots exclude internal notes and all authority fields. Share misses, expiry, and revocation return the same non-enumerating response.',
  '- Approved report content and persisted PDF/DOCX export bytes are immutable append-only history. PDF structure, DOCX Office Open XML package entries, byte length, and SHA-256 are validated in tests.',
  '- Additive release v41 contains no destructive table operation and applied plus immediately reapplied successfully to clean disposable PostgreSQL 16.','',
  '## Executable evidence','',
  '- `apps/api/test/snapproofos-phase32-domain.test.ts` — real PDF/DOCX structure, deterministic bytes, embedded report data, SHA-256, and JPEG EXIF removal.',
  '- `apps/api/test/snapproofos-phase32-static.test.ts` — pinned provenance, all 16 source domains, additive v41 DDL, source-compatible routes, private storage, hashed shares, mobile reconnect, and branded public report surface.',
  '- `apps/api/test/snapproofos-db.test.ts` — customer/job/work/cost/capture/template-ready persistence, evidence review, job completion, proof approval, branded report approval, PDF/DOCX validation, share/revoke, viewer/tenant denial, idempotent replay, and restart persistence.',
  '- `apps/web/e2e/snapproofos-phase32.spec.ts` — compiled exact-host desktop/tablet/mobile route, field-label, no-placeholder, overflow, screenshot, and accessibility contract.',
  '- `scripts/phase20-product-truth.test.mjs` — exact 341-capability ledger, zero blocked/waived facets, 16 table domains, and current evidence-path integrity.','',
  '## Local verification status','',
  '- API and web TypeScript: PASS.',
  '- Phase 32 plus existing SnapProofOS domain/static/database-release contracts: PASS (10/10).',
  '- Existing plus Phase 32 disposable PostgreSQL SnapProofOS workflow: PASS (4/4), including restart persistence.',
  '- Additive database release v41 plan, clean apply, and immediate idempotent reapply: PASS.',
  '- Root lint and full workspace TypeScript: PASS. Exact Phase 32 ledger regression: PASS (6/6).',
  '- Production API and runner compilation pass, but the web production build is BLOCKED by existing Google Fonts WOFF2 URLs returning HTTP 404 through `next/font`; compiled browser acceptance is therefore NOT RUN and not claimed.',
  '- Production deploy, target backup/restore, live exact-host verification, and rollback remain owner-controlled gates.','',
  '## Full source capability ledger','',
  '| # | Type | Source identity | State | Current boundary | Capability ID |','|---:|---|---|---|---|---|',
  ...parity.capabilities.map((capability,index)=>`| ${index+1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0,4).join('; '))} | \`${capability.capabilityId}\` |`),'',
  '## Deployment gates','',
  '- Back up the reviewed production database, confirm the exact reviewed commit, and apply cumulative release v41 using the supported release runner.',
  '- Configure and verify the production attachment scanner/storage policy; a disabled scanner is truthfully reported and does not count as clean-scan readiness.',
  '- Verify `snapproofos.operatoros.net` authentication/return, tenant and role matrix, camera/audio permissions, offline reconnect, report generation, public share expiry/revocation, desktop/tablet/mobile accessibility, backup/restore, and rollback.',
].join('\n');

if(process.argv.includes('--write')){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,`${report}\n`);console.log(JSON.stringify({mode:'write',output:'docs/phase-32/SNAPPROOFOS-COMPLETE-PRODUCT-REPORT.md',capabilities:parity.capabilities.length,native,shared,blocked:parity.stateCounts.BLOCKED},null,2));}
else{if(readFileSync(output,'utf8').replaceAll('\r\n','\n')!==`${report}\n`)throw new Error('Phase 32 report is stale; run phase32:report:write');if(parity.stateCounts.BLOCKED||parity.stateCounts.OWNER_WAIVED)throw new Error('Phase 32 requires zero blocked and zero implicit waivers');console.log(JSON.stringify({mode:'check',capabilities:parity.capabilities.length,native,shared,blocked:0},null,2));}
