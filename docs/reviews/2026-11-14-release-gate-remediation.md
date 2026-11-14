# Release gate reconciliation, 2026-11-14

Source: [hosted release run 43623221975](https://github.com/shotgunsensei/OperatorOS/actions/runs/43623221975), exact commit 7c105891e1a870219c752d9fe1075aaba742f648. API reported 34 failures; integration, build, types and lint passed. No parity promotion or production database change is claimed.

## Repairs

- Shared API fixtures now initialize the real release68 purchase ledger needed by expiry tests.
- CallCommand fake sidebands implement explicit greeting and assert once-only greeting across replay/recovery. Existing bounded reconnect behavior retains unknown calls and lane capacity after local socket loss. Tests now verify that behavior and reattachment without repeated provider acceptance. Persistence fault injection occurs after confirmed hangup, preserving preflight ownership checks and durable outcome-unknown/no-resend assertions.
- TechDeck fixtures use unique identity names and the canonical module-session slug. Cross-tenant, platform and foreign-module revocation denials remain asserted.
- TradeFlowKit explicitly grants both tested readers module access. Release identity expectations track committed schema68.
- The clean-schema commerce proof was incorrectly in the API sweep after shared fixtures. It now runs immediately after the guarded disposable integration reset and before shared apply. Failed/missing/skipped summaries block the gate. Its captured URL is guarded, empty-schema assertion retained, release68 applied and verified twice, and zero commerce side effects asserted. A regression test protects this mandatory ordering.
- Browser contracts and two individually reviewed Linux snapshots are documented separately. Pixel tolerance, accessibility requirements and fail-on-skipped behavior remain intact.

## Verification

- New loopback PostgreSQL16 disposable databases only, no production/provider calls.
- Complete integration runner: 108/108 with zero skipped/todo/cancelled, plus required clean-schema proof 1/1.
- Focused CallCommand/TechDeck: 14/14, including 35-second owner renewal, recovery and revocation boundaries.
- Focused UI/static: 44/44. Visual contract: 13 modules, zero issues. SSO discovery: 15 tests, not an E2E pass.
- Aggregate typecheck and lint passed after final fixture edits. Full API rerun passed 2,997/2,997 with zero failed/skipped/cancelled/todo. The former 2,998th test is the separately mandatory clean-schema proof.
- Exact Linux hosted browser/visual acceptance remains required. This report does not claim release eligibility or publication.
