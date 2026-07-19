# TorqueShed Phase 8 parity matrix

Assessment date: 2026-07-18

## Provenance

The immutable quarantined snapshot is pinned to
`c33ade5cef525d62d371a63946b814c58a72a4a7` and contains 148 imported files
from 263 tracked source files with zero high-confidence secret findings. The
separate `C:\Dev\TorqueShed-Codex` checkout is read-only evidence: its local
`main` is `68da4548f665`, its already-present `origin/main` is
`508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75`, and the working tree contains
uncommitted user work. No fetch, pull, install, migration, server, or write was
performed there.

The newer committed reference adds a 602-line product schema, 722-line route
module, a persistent E2E workflow, and garage/diagnostic/build UI. Its useful
product concepts are design evidence, not runtime authority. Uncommitted
`garage.ts` and `operations.ts` are recorded only as non-deterministic design
input and are ineligible for migration provenance.

| Source capability | OperatorOS Phase 8 disposition | Evidence target |
| --- | --- | --- |
| Standalone users, sessions, orgs, memberships, credentials | Excluded; OperatorOS authority | Auth/tenant/module guards and negative tests |
| Vehicle profile, year/make/model/trim/engine/transmission/drivetrain | Namespaced vehicle record | CRUD, search/page, restart, tenant tests |
| VIN | Fingerprint + masked suffix only; plaintext discarded | API/DB no-plaintext assertions |
| Personal/team/public visibility | Owner plus private/tenant/public-build eligibility; no anonymous publishing in Phase 7 | Role/owner tests and ADR-0016 |
| Mileage history | Durable idempotent mileage events and current-mileage projection | Retry/count and persistence tests |
| Maintenance, repairs, inspections, modifications | One typed service record with parts, labor, vendor, and minor-unit costs | Full-chain and integer-cost tests |
| Vendors | Tenant/owner-scoped automotive vendor record; not platform billing | CRUD/tenant tests |
| Builds, stages, tasks, budgets, timeline | Versioned namespaced project build hierarchy | Stage/task/status/cost tests |
| Reminders and schedules | Date/mileage due records with recurrence fields | CRUD/dashboard tests |
| Diagnostic sessions | Concern, symptoms, conditions, states, cause, repair, verification, resolution | Transition/concurrency/restart tests |
| Trouble codes and freeze frame | Durable child records with bounded code state and JSON freeze frame | Full-chain timeline tests |
| Inspections, tests, measurements, hypotheses, cause, repair, verification | Typed diagnostic entries with text/numeric value, unit, reference range, outcome, metadata | Idempotency and timeline tests |
| Photos/documents | OperatorOS shared attachment storage, MIME/signature/hash/scan service | Attachment metadata/timeline test |
| Diagnostic templates | Private or tenant-shared reusable test plans | Role/list/create tests |
| Dashboard and `/diagnostics` deep routes | Real aggregate API and responsive native workspace | Static, production build, browser E2E |
| Torque Assist diagnostic context | Server reloads authorized vehicle, diagnostic, codes, freeze frame, observations, repair history, and bounded follow-up answers; no browser-supplied tenant/provider authority | Context preview, ownership/tenant, size/hash, and redaction tests |
| Torque Assist response | Strict facts/assumptions/ranked low-or-medium hypotheses/warnings/tests/follow-ups/disclaimer schema with high-risk escalation | Deterministic, malformed, unsafe-certainty, provider-failure, and UI tests |
| Provider execution | Shared server-selected adapter with bounded context, timeout, two attempts, user/tenant rate limits, tenant circuit, disabled state, and redacted errors | Domain/static contracts plus database workflow |
| Token purchase and credit | OperatorOS-owned package price/units, Stripe Checkout, signed raw-body webhook, test/live binding, duplicate-safe credit, failure and refund reversal | Signed payment/replay/mode/refund tests |
| Usage debit and balance | Append-only tenant/user/module ledger; computed balance; atomic accepted request plus exact one debit; no mutable authoritative balance | Exhaustion, replay, race, append-only, reconciliation, and restart tests |
| Marketplace and community | Excluded until later phases | No mounted routes/tables |
| Standalone billing/Stripe | Excluded; OperatorOS platform authority | No mounted child route/schema |
| Child runtime and migrations | Excluded | Root release manifest only |

## Completion boundary

The combined Phase 7/8 candidate can reach consolidation state 4 only after
isolated database apply, the complete foundation and Torque Assist payment/
ledger/provider/role/tenant/concurrency/restart tests, root typecheck/build/
preflight, local production readiness, and production-host SSO/deep-link
checks pass.
State 5 additionally requires an approved cumulative deployment, current
public acceptance, and an approved standalone-data apply/cutover. A rendered
shell or older public deployment is not parity.
