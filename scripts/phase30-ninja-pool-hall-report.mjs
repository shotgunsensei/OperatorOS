import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/phase-30/NINJA-POOL-HALL-GAME-REPORT.md');
const parity = JSON.parse(readFileSync(resolve(root, 'docs/parity/modules/ninja-pool-hall.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(resolve(root, 'apps/modules/ninja-pool-hall/source/SOURCE_SNAPSHOT.json'), 'utf8'));
const esc = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const native = parity.stateCounts.ACTIVE_NATIVE;
const shared = parity.stateCounts.ACTIVE_SHARED_EQUIVALENT;

const report = [
  '# Phase 30 — Ninja Pool Hall Full Game and Multiplayer Restoration',
  '',
  '> Generated from the pinned Ninja Pool Hall source snapshot and the executable OperatorOS parity ledger. Capability counts and item states are not maintained by hand.',
  '',
  '## Outcome',
  '',
  `Pinned source commit \`${parity.provenance.commit}\` compiles to **${parity.capabilities.length} exact facets**: **${native} ACTIVE_NATIVE**, **${shared} ACTIVE_SHARED_EQUIVALENT**, **${parity.stateCounts.OWNER_WAIVED} OWNER_WAIVED**, and **${parity.stateCounts.BLOCKED} BLOCKED**.`,
  '',
  `The pinned source contains ${snapshot.trackedFileCount} tracked files; ${snapshot.fileCount} bounded product files (${snapshot.totalBytes.toLocaleString()} bytes) are retained as read-only evidence. Exact facets: ${Object.entries(parity.typeCounts).map(([type, count]) => `${count} ${type}`).join(', ')}.`,
  '',
  'Practice free-shoot, seeded CPU 8-ball, local hot-seat, and authenticated online rooms are real Canvas gameplay modes. No form or dashboard card substitutes for a game mode.',
  '',
  'This is source/local release evidence: additive v39 was applied and reapplied against disposable PostgreSQL, and the compiled exact-host journey passed locally. It does not claim production database promotion or deployment.',
  '',
  '## Physics and rules coverage',
  '',
  '- Fixed-step browser and API engines share the pinned collision, cushion, pocket, jaw, friction, spin, and placement model.',
  '- Four fixed initial-state golden shots cover straight, cut, side-English, follow/draw, rail, collision, and pocket behavior. Browser and server output the same state/events/result hash.',
  '- Rules fixtures cover legal and failed breaks, 8-on-break choices, break and regular scratches, open-table group assignment, fouls, rail-after-contact, ball-in-hand/head-string placement, called-pocket 8-ball, early/incorrect/scratch 8-ball losses, legal 8-ball wins, and the optional three-foul loss.',
  '- The CPU uses a seeded jitter path. A deterministic CPU-vs-CPU rack reaches the source-correct early 8-ball loss in 14 bounded shots under the local performance budget.',
  '- Touch/mouse aiming, power, side English, follow/draw, called pocket, responsive 2:1 Canvas sizing, reduced motion, procedural audio, mute/haptics, table speed, and device-local visual quality are active.',
  '',
  '## Multiplayer authority and traces',
  '',
  '- OperatorOS session, tenant membership, module entitlement, and write access gate room REST and WebSocket paths. Browser-generated player identity and permissive standalone CORS remain retired.',
  '- A guest submits a strictly parsed shot intent. The host runs the visible deterministic simulation and returns an eight-character result hash. Fastify independently re-simulates the exact shot before transactionally committing the next state.',
  '- Room state, pending guest intent, sequence/version, result hashes, player bindings, reconnect timestamps, expiry, completion, and append-only events persist in PostgreSQL. Process memory stores sockets/presence only.',
  '- Fixed size/rate windows, shot-start limits, a 500-shot cap, finite geometry bounds, ball-in-hand placement validation, stale-version rejection, idempotent client action IDs, result-hash mismatch recovery, and tenant non-authority protect the room.',
  '- The two-client database test proves host/join, two committed shots, authenticated intent forwarding, stale rejection, cross-tenant denial, explicit leave, same-user rejoin, socket reconnect, host disconnect persistence, state request, and reconnect-window abandonment.',
  '',
  '## PWA and navigation',
  '',
  '- `/practice`, `/cpu`, `/local`, `/online`, `/host`, `/join`, `/profile`, `/matches/:id`, and `/rooms/:id` resolve on both the module host and `/modules/ninja-pool-hall/*` parent route.',
  '- The manifest selects exact-host or parent-route start/scope at request time. The service worker never caches authenticated pages or API data and returns a static reconnect-safe offline shell.',
  '- The OperatorOS ecosystem header remains the canonical return path to My Apps. The module session remains tenant/module sealed, including the tenant-in-path WebSocket route browsers require because they cannot set `X-Tenant-Id`.',
  '',
  '## Executable evidence',
  '',
  '- `apps/api/test/ninja-pool-phase30-domain.test.ts` — golden hashes, browser/API parity, chained scratch parity, impossible-shot rejection, idempotent authenticated-intent relay, seeded CPU rack, and performance budget.',
  '- `apps/api/test/ninja-pool-rules.test.ts` — break, foul, scratch, groups, ball-in-hand, called-pocket, legal/illegal 8-ball, and three-foul fixtures.',
  '- `apps/api/test/ninja-pool-online-db.test.ts` — real PostgreSQL and two authenticated WebSocket clients with authority, replay, reconnect, disconnect, and expiry traces.',
  '- `apps/api/test/ninja-pool-physics.test.ts` — stationary rack, fixed-step repeatability, geometry bounds, and aim prediction.',
  '- `apps/api/test/ninja-pool-phase10b-contract.test.ts` — routes, guards, deep links, Canvas controls, PWA, and trust-boundary static contract.',
  '- `apps/web/e2e/ninja-pool-hall-phase30.spec.ts` — compiled exact-host two-browser 23-shot full rack, legal 8-ball completion, mobile touch, reconnect, resize/orientation, no-overflow, manifest, and service-worker contract.',
  '- `scripts/phase20-product-truth.test.mjs` — reproducible 56-facet ledger with zero blocked/waived outcomes and evidence on every facet.',
  '',
  '## Verification status',
  '',
  '- API and web TypeScript: PASS.',
  '- Golden physics/rules/CPU focused suite: PASS.',
  '- Disposable PostgreSQL two-WebSocket workflow: PASS.',
  '- Compiled production build: PASS. Exact-host Playwright two-browser full-rack journey: PASS. Production deployment remains a separate owner gate.',
  '',
  '## Full source capability ledger',
  '',
  '| # | Type | Source identity | State | Current boundary | Capability ID |',
  '|---:|---|---|---|---|---|',
  ...parity.capabilities.map((capability, index) => `| ${index + 1} | ${capability.type} | ${esc(capability.title)} | ${capability.state} | ${esc(capability.currentTargets.slice(0, 3).join('; '))} | \`${capability.capabilityId}\` |`),
  '',
  '## Deployment gates',
  '',
  '- Back up the reviewed target database and apply cumulative additive release v39 through the supported release runner.',
  '- Verify the reviewed commit on `ninja-pool-hall.operatoros.net`, including module SSO, exact-host WebSocket upgrade, two-device full-rack play, reconnect, PWA install, and return to OperatorOS.',
  '- Run target backup/restore and rollback rehearsal. Production promotion remains owner-controlled.',
  '',
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${report}\n`);
  console.log(JSON.stringify({ mode: 'write', output: 'docs/phase-30/NINJA-POOL-HALL-GAME-REPORT.md', capabilities: parity.capabilities.length, native, shared, blocked: parity.stateCounts.BLOCKED }, null, 2));
} else {
  if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== `${report}\n`) throw new Error('Phase 30 report is stale; run phase30:report:write');
  if (parity.stateCounts.BLOCKED || parity.stateCounts.OWNER_WAIVED) throw new Error('Phase 30 requires zero blocked and zero implicit waivers');
  console.log(JSON.stringify({ mode: 'check', capabilities: parity.capabilities.length, native, shared, blocked: 0 }, null, 2));
}
