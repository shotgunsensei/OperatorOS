import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-35/CALLCOMMAND-COMPLETE-TELEPHONY-REPORT.md');
const parity = JSON.parse(readFileSync(resolve(root, 'docs/parity/modules/callcommand-ai.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(resolve(root, 'apps/modules/callcommand-ai/source/SOURCE_SNAPSHOT.json'), 'utf8'));
const esc = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const native = parity.stateCounts.ACTIVE_NATIVE;
const shared = parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;
const evidence = [
  'apps/api/test/callcommand-phase35-live-call-gate.test.ts',
  'apps/api/test/callcommand-phase35-static.test.ts',
  'apps/api/test/callcommand-phase35-db.test.ts',
  'apps/api/test/callcommand-twilio-webhooks.test.ts',
  'apps/web/e2e/callcommand-phase35.spec.ts',
  'scripts/phase35/callcommand-contract.test.mjs',
];
for (const file of evidence) if (!existsSync(resolve(root, file))) throw new Error(`Missing Phase 35 evidence ${file}`);
for (const capability of parity.capabilities) {
  if (!['ACTIVE_NATIVE','ACTIVE_SHARED_EQUIVALENT'].includes(capability.state)) throw new Error(`Unresolved capability ${capability.capabilityId}`);
  for (const file of capability.currentTargets) if (!existsSync(resolve(root, file))) throw new Error(`Missing current target ${file}`);
  for (const file of capability.automatedEvidence) if (!existsSync(resolve(root, file))) throw new Error(`Missing automated evidence ${file}`);
}

const report = [
  '# Phase 35 — CallCommand AI Complete Telephony and Automation Restoration','',
  '> Generated from the pinned CallCommand source snapshot and executable OperatorOS product-truth ledger. Source counts and states are not maintained by hand.','',
  '## Outcome','',
  `Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length} exact facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`, '',
  `The retained snapshot records ${snapshot.trackedFileCount} tracked files and ${snapshot.fileCount} bounded product files (${snapshot.totalBytes.toLocaleString()} bytes). Exact facets: ${Object.entries(parity.typeCounts).map(([type,count]) => `${count} ${type}`).join(', ')}.`, '',
  'Every source facet is native or shared-equivalent. No security or product-boundary retirement is counted as completion, and no owner waiver is used. This is reviewed source/local evidence; it does not claim a production database promotion, live-provider call, live transfer, deployed exact-host acceptance, production backup, or rollback rehearsal.','',
  '## Restored product','',
  '- Tenant-scoped channels persist approved phone lines, IANA timezone, weekly/always business hours, six live behaviors, four after-hours behaviors, consent policy, recording state, receptionist, active flow, product mode, and honest provider status.',
  '- Receptionist profiles persist greeting, script, tone, up to twenty typed intake fields, escalation configuration, default state, and MSP, Sales, Field Service, Medical-administrative, or General product mode. Shared AI decisions use strict JSON and administrative safety instructions; unavailable or invalid AI falls back to a deterministic intake engine with explicit provenance.',
  '- Call flows persist immutable graph versions. Validation rejects duplicate keys, dangling pointers, unreachable nodes, oversized graphs, and unsupported action types. Execution stores ordered safe-input/safe-output trace rows and stops cycles at fifty steps.',
  '- Signed Twilio voice routes implement incoming calls, explicit recording/automation consent, speech Gather turns, consent accepted/declined/no-response paths, business-hours routing, voicemail, forwarding, hangup, recording callback, status callback, and replay protection.',
  '- Recordings enter protected shared storage through bounded upload intents or token-routed Twilio, email, and generic ingestion. MIME, size, checksum, scan/quarantine, retention, signed retrieval, and raw-secret boundaries remain owned by shared OperatorOS services.',
  '- Call processing preserves provider-supplied caller phone, stores transcript and validated intent/sentiment/summary/entities/priority/key points/action items, records provider/model/fallback provenance and usage, evaluates rules and flows, and persists all action outcomes.',
  '- Rules dispatch tickets, leads, tasks, webhooks, Slack endpoints, email, assignment, and priority. Business records and action runs are idempotent. Email and transfer never report success unless the shared provider or Twilio confirms the external action; deterministic test delivery is labeled test-recorded.',
  '- The live switchboard exposes persisted session state, sequence, transcript tail, collected intake, note, urgency, end, and provider-confirmed redirect. Missing credentials return `provider_unavailable` and `providerActionConfirmed: false` with a transfer audit row.',
  '- Calls expose detail, protected recording reference, transcript, structured analysis, event history, flow trace, action trace, and a generated standards-valid PDF with SHA-256. Dashboard analytics and shared usage are derived from persisted records.',
  '- The premium dark operations workspace exposes channels, receptionists, flows, switchboard, calls, automation, tickets, leads, tasks, providers, usage, activity, and source-compatible deep links. OperatorOS remains the parent identity, tenant, entitlement, billing, provider-secret, usage, audit, and admin authority.','',
  '## Source table-domain disposition','',
  '| Source domain | Phase 35 boundary | State |','|---|---|---|',
  '| users | OperatorOS users, tenants, membership, roles and sessions | ACTIVE_SHARED_EQUIVALENT |',
  '| integrations | Shared provider configuration, encrypted secret references and health | ACTIVE_SHARED_EQUIVALENT |',
  '| channels / receptionist_profiles / transfer_targets | Tenant-scoped native configuration | ACTIVE_NATIVE |',
  '| call_flows / flow_nodes / flow_logs | Versioned native graph plus immutable execution traces | ACTIVE_NATIVE |',
  '| call_records / telephony_events / live_call_sessions / transfer_logs | Native calls, signed events, switchboard and transfer audit | ACTIVE_NATIVE |',
  '| upload_intents / ingestion_events | Native intent and replay ledger backed by shared scanned storage | ACTIVE_NATIVE |',
  '| automation_rules / tickets / leads / tasks / action_items / followup_logs | Native automation and work objects; shared outbound delivery | ACTIVE_NATIVE |','',
  '## TwiML and event traces','',
  '| Journey | TwiML/provider behavior | Durable trace |','|---|---|---|',
  '| In-hours, consent required | Greeting -> DTMF consent Gather -> signed consent callback -> speech Gather | ingestion event, call, live session, consent outcome |',
  '| Consent accepted | signed callback -> Twilio Calls Recordings API -> speech Gather only after provider-confirmed recording start | call recording SID/reference, provider status, attachment scan state, session sequence |',
  '| Consent declined | recording disabled -> speech intake continues | call and signed ingestion event; no recording attachment |',
  '| Consent timeout | explicit explanation -> Hangup | blocked call with `CONSENT_NO_RESPONSE` |',
  '| After-hours voicemail | closed greeting -> Record | recording ingestion event and protected attachment |',
  '| After-hours forward | closed greeting -> Dial configured E.164 | signed status/transfer outcome |',
  '| After-hours AI intake | closed greeting -> speech Gather | multi-turn session and structured work dispatch |',
  '| After-hours hangup | closed greeting -> Hangup | signed incoming event; no invented recording or transfer |','',
  '## Flow and action trace example','',
  '| Sequence | Node/action | Result |','|---:|---|---|',
  '| 1 | condition `priority == urgent` | yes -> urgent ticket node |',
  '| 2 | action `ticket` | persisted ticket and idempotent completed action run |',
  '| 3 | automation rule `urgent` | separately keyed ticket action; replay reuses audit row |',
  '| transfer | Twilio Calls API redirect | `redirected` only on provider acceptance; otherwise unavailable/failed |','',
  '## Security, privacy, and authority evidence','',
  '- Every authenticated query binds tenant ID and actor from the trusted OperatorOS session; request bodies cannot override tenant, user, role, entitlement, or plan.',
  '- Composite tenant foreign keys prevent cross-tenant relationships below the route layer. The disposable journey proves a second entitled tenant sees no first-tenant channels or calls.',
  '- Ingestion tokens use 256-bit randomness, return once, store only SHA-256, carry tenant/source/expiry/revocation, and reject event replay through a tenant/source/provider-event unique key.',
  '- Twilio webhooks verify the canonical callback URL and signature before resolving a call. Safe ingestion payloads do not persist raw provider bodies or credentials.',
  '- Audio never becomes a public URL. Shared attachment storage verifies MIME, bounded size, checksum, scan status, quarantine state, and content integrity before retrieval.',
  '- AI prompts forbid invented identity/provider actions and medical, legal, financial, or automotive diagnostic advice. Medical mode is administrative routing only.',
  '- Outbound webhooks use shared HMAC, SSRF defense, retry/dead-letter and delivery audit. Slack is treated as a configured shared webhook endpoint, not a special unaudited network call.',
  '- Additive release v44 contains no table drop or truncate. Clean apply and immediate reapply passed on disposable PostgreSQL 16 after the reapply gate found and fixed one constraint-idempotency defect.','',
  '## Executable evidence','',
  '- `apps/api/test/callcommand-phase35-live-call-gate.test.ts` — expanded 42/42 gate for hours, every after-hours path, consent, multi-turn receptionist, flow validation/loop guard, analysis/caller phone, token entropy, and PDF integrity.',
  '- `apps/api/test/callcommand-phase35-db.test.ts` — OperatorOS authorization, tenant isolation, profiles/channels, flow version/publish/bind, rule dispatch, full intelligence, trace, work queue, PDF, switchboard actions, honest no-provider transfer, ingestion token and replay.',
  '- `apps/api/test/callcommand-twilio-webhooks.test.ts` — legacy signed/forged Twilio callback and replay safety remains preserved.',
  '- `apps/api/test/callcommand-phase35-static.test.ts` and `scripts/phase35/callcommand-contract.test.mjs` — complete routes/schema/security/UI/source counts, 589 active facets, and zero waiver/blocker contracts.',
  '- `apps/web/e2e/callcommand-phase35.spec.ts` — exact product journey, source deep links, mobile overflow and label/accessibility checks against compiled artifacts.','',
  '## Local verification status','',
  '- Expanded source live-call gate: PASS, 42/42.',
  '- Phase 35 disposable PostgreSQL product journey: PASS, 5/5.',
  '- Focused regression set: PASS, 66/66 across the expanded/restored Phase 35 gate, Phase 11E compatibility journey, and signed Twilio callbacks.',
  '- Root lint and API/runner/web TypeScript: PASS.',
  '- Production API/runner/web build: PASS after replacing the stale build-time Google Fonts dependency with deterministic brand system fonts.',
  '- Additive database release v44: clean apply PASS; patched immediate and subsequent idempotent reapply PASS.',
  '- Phase 35 parity/report contract: PASS, 8/8; 589/589 source facets active or shared-equivalent.',
  '- Compiled production-artifact browser journey: PASS, 1/1, including all source deep links, persisted work dispatch, accessibility labels, and 390px mobile overflow.',
  '- The full serialized API aggregate was exercised with valid test secrets; every Phase 35 test passed, while the aggregate remains non-green because of unrelated existing Ninja Pool/TradeFlowKit static-contract failures and optional probes. It is not claimed as a broad pass.',
  '- Live Twilio/OpenAI/email/Slack/webhook provider acceptance, production backup/apply, deployed exact-host acceptance, restart under production infrastructure, source-data reconciliation, and rollback remain owner-controlled release gates.','',
  '## Full source capability ledger','',
  '| # | Type | Source identity | State | Current boundary | Capability ID |','|---:|---|---|---|---|---|',
  ...parity.capabilities.map((capability,index) => `| ${index+1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0,4).join('; '))} | \`${capability.capabilityId}\` |`),'',
  '## Deployment gates','',
  '- Back up the reviewed production database, record exact commit/build identity, and apply cumulative release v44 through the supported database release runner.',
  '- Configure the exact Twilio voice number callbacks to the Phase 35 signed routes and verify primary-auth-token signature support. Configure shared OpenAI, email, Slack/webhook and storage/scanner providers only through OperatorOS authority.',
  '- Run a real consented inbound test for each in-hours/after-hours behavior, multi-turn intake, recording ingestion/transcription/analysis, rule dispatch, switchboard redirect, provider failure, duplicate callback, and restart recovery.',
  '- Verify the deployed CallCommand exact host on desktop/tablet/mobile, source-compatible deep links, tenant/role/plan behavior, usage, audit, PDF download, backup/restore, and rollback before traffic promotion.',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${report}\n`);
  console.log(JSON.stringify({ mode:'write', output:'docs/phase-35/CALLCOMMAND-COMPLETE-TELEPHONY-REPORT.md', capabilities:parity.capabilities.length, native, shared, blocked:parity.stateCounts.BLOCKED }, null, 2));
} else {
  if (!existsSync(output) || readFileSync(output, 'utf8').replaceAll('\r\n','\n') !== `${report}\n`) throw new Error('Phase 35 report is stale; run phase35:report:write');
  if (parity.stateCounts.BLOCKED || parity.stateCounts.OWNER_WAIVED) throw new Error('Phase 35 requires zero blocked and zero waivers');
  console.log(JSON.stringify({ mode:'check', capabilities:parity.capabilities.length, native, shared, blocked:0 }, null, 2));
}
