# OfficeExit complete tenant product: local source handoff

This isolated follow-on starts from unchanged tool-commerce candidate
`b305feeea7d84794fcbc9cdda166f030f07345b1`. The approved product is OfficeExit 2026,
USD $99 once for the whole purchasing tenant, with all ten current features,
including Publisher Rescue. Free and paid OperatorOS accounts are eligible.
There is no recurring fee, bundled annual support/update fee or user/device/site
count limit. Future major-version coverage remains undecided.

The existing internal capability alias is `MSP Pro`; it is not a new public tier.
The dedicated grant requires exactly these existing feature keys:

`localAssessment`, `migrationPlanning`, `htmlReporting`, `multiDevice`,
`silentDeployment`, `uploadAssessment`, `publisherRescue`, `whiteLabel`,
`deploymentTokens`, `commercialUse`.

`packages/sdk/src/tool-bridge.ts` exports `createOfficeExitTenantToolGrant()`,
`OFFICEEXIT_TENANT_PURCHASE_EDITION` and
`OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION`. The dedicated bridge validator rejects
narrower historical aliases, alternate aliases/terms, omitted or invented features
and extra limit fields. The historical standalone edition matrix is unchanged.
The wire operation and object shape are unchanged.

The future server-owned `ToolCheckoutOffer.snapshot` uses `amountMinor=9900`,
`currency='usd'`, `licenseUnit='tenant'`, `licenseAllowance=1`,
`coverage='entire_tenant'`, `licenseTermsVersion='officeexit-2026-tenant-v1'`, and
`officeexitGrant={edition:'MSP Pro',coverage:'entire_tenant',capabilities:[all ten]}`.
Allowance 1 means one purchasing tenant, not one device, user or site. Provider
Price/Product/Account IDs and mode remain explicit reviewed configuration; this
change creates no provider object and seeds no enabled offer. The terms identifier
is technical immutable metadata for this current-release lane, not future coverage.

## Completed local checks

Evidence is in the task-owned `evidence/resume-oct21/officeexit-complete` directory.
Each check has a command/start receipt, full log and terminal receipt.

| Check | Result | Evidence label |
| --- | --- | --- |
| Complete-product, bridge assertions, provider, fulfillment and module policy | 115/115, no skips | `unit-v1` |
| Real PostgreSQL 16.14 store and commerce integration, inert provider | 41/41, no skips | `sql-v1` |
| Actual producer-to-frozen consumer mapping/grant/refund/replay | 8/8 | `joint-v2`, `joint-officeexit-proof.json` |
| Chromium built free/paid catalog, synthetic auth/tenant isolation and mobile/desktop accessibility | 8/8, no skips | `browser-v2` |
| Local SDK TypeScript build | passed | `sdk-build-v1` |
| Four workspace TypeScript checks | passed | `types-v1` |
| Root lint, zero warnings | passed | `lint-v1` |
| Production Next web build | passed, build ID `kTDV---V7ui7BUWPWWXZm` | `web-build-v1` |

The joint proof loads the actual producer candidate and OfficeExit master
`417c8335d52f3c2de0401b1ec86cdad062f476de`. Producer writes target only the verified
task-owned loopback PostgreSQL 16.14 database `operatoros_officeexit_complete_test`;
the consumer is isolated in-memory PGlite. Native RSA keys exist only in memory;
actual assertion verification and SQL execute through injected in-process transport.
The consumer stores `MSP Pro`, null device allowance, exact ten-capability set and
current terms; refund propagates and old signed active grants cannot restore access.
Consumer source hashes are unchanged before/after. Consumer feature ordering is
canonical, so the exact capability set and length are compared rather than array
order. This is not real Supabase authentication, HTTPS deployment or Stripe acceptance.

The first browser helper accidentally selected an unrelated built route before its
server existed (`ERR_CONNECTION_REFUSED`); all six intended synthetic cases passed.
The corrected focused run includes the newly built free/paid owner routes. The first
joint assertion expected capability insertion order; its corrected run checks the
same exact feature set after canonical ordering. Both failed receipts remain present.
No production behavior was changed to accommodate either harness correction.

## Remaining activation gates

`apps/api/src/lib/tool-commerce.ts` and `CLOSED_TOOL_COMMERCE` remain byte-identical
to the frozen base: checkout, mapping, delivery and private artifacts stay disabled.
No production schema was changed and no new schema source is needed for this follow-on.
The base candidate's review-only OperatorOS schema68 and OfficeExit separate proposal
still need exact database confirmation, recovery/backup/write-pause and explicit
application approval. Dedicated signing trust, real HTTPS origins, reviewed provider
prices/webhook binding, accepted exact release artifacts/signatures, remaining
refund/upgrade policy and approved non-charging live-account acceptance remain gates.
Publication is held; no push, PR update, CI rerun, merge or deployment occurred.

The inherited held SSO file is unchanged and unexecuted. Existing reused tool trees
are not a canonical frozen-lockfile install. These targeted results do not replace
the all-module release gate, actual binary execution or complete live commerce journey.
