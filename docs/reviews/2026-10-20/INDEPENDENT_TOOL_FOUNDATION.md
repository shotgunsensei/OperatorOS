# Independent Tool Modules: disabled purchase foundation

This draft source slice reserves `officeexit` and `vendortrust365` as separate,
one-time tenant purchases. An active free or paid account owner may be eligible
without an Application Stack subscription or Stack seat. Sales and downloads
remain disabled. No payment, license, native activation or executable delivery is
implemented or accepted by this change.

The source base is `677bdb6fe620b359e4119163e360a6a24bda7f24`, tree
`96de88f9896883458740249c356f4b2ebdf13795`: the publication descendant of the
reviewed PR134 launch candidate. This branch changes no database schema, ordered
release (67), existing product price, companion allowance, hosted registry or
deployment. It is a separate draft; its source gates must not be attributed to
the already reviewed launch candidate, or vice versa.

## Implemented boundary

- The SDK exports a separate frozen tool catalog. `null` price and allowance
  mean undecided, never free or unlimited. One-time payment, no recurring charges
  and no automatic renewal are explicit. Updates/support coverage and release
  compatibility are pending; neither lifetime upgrades nor periodic repurchase
  is promised.
- Authenticated `GET /v1/tools/catalog` returns readiness for the server-resolved
  tenant with `Cache-Control: no-store`. It re-reads the real membership and
  tenant owner rather than trusting the platform-support synthetic owner role.
  An actual active owner is eligible; other members can read readiness but are
  ineligible. Missing/foreign/removed membership and archived tenants return 404;
  suspended tenants return 403. No checkout, download, activation or scan route
  is registered.
- Existing manual/system/plan rows, explicit assignments, `allowAllMembers`,
  trials and platform support authority cannot launch these reserved slugs.
  Global availability, tenant/member status and explicit deny remain authoritative.
  Generic grant **and revoke** reject with `TOOL_PURCHASE_LANE_REQUIRED` before
  writes, including for archived reserved tools. This reserved-lane error takes
  precedence over the generic archived-module error. Other modules retain their
  current resolver/grant behavior.
- Neither tool is registered in the hosted catalog/ecosystem/SSO registry.
  Future registration requires an authority review: the SSO helper currently
  skips subscription checks for a `requiresSubscription: false` entry (currently
  platform-only). A future tool entry must not bypass the independent ledger.

This is preventive separation for future integration. It does not assert that
either unregistered tool currently has a reachable hosted entitlement exploit.
The underlying desktop applications and standalone license authority are not
changed by this branch.

## Required next purchase contract

| Stage | Authority and invariant | Current status |
| --- | --- | --- |
| Catalog and eligibility | Active persisted tenant owner; no paid-base/seat prerequisite | Implemented, sales disabled |
| Purchase intent | Immutable tenant, initiating actor, tool, edition/release, accepted terms, amount/currency and intended allowance | Not implemented; commercial decisions required |
| Provider session | Server-owned account/mode/customer and immutable intent correlation; no client metadata ownership inference | Not implemented; no live provider setup |
| Settlement | Signed event plus exact provider/payment/amount/currency proof, idempotent transaction receipt, mutation fences, audit/outbox | Not implemented |
| Tool license | Dedicated purchase provenance, distinct from Stack/companion rows; valid license usable by a free base tenant | Not implemented |
| Base cancellation | Preserve independent tool purchases when Stack subscription or seats end | Future ledger regression gate; no license exists here |
| Refund/reversal | Revoke only the implicated purchase, preserving other licenses; replay/stale/foreign events fail closed | Not implemented; refund policy pending |
| Private delivery | Accepted platform/edition, signed manifest, exact bytes/hash/size and publisher signature; short-lived tenant-bound download grant | Not implemented; no public artifact URL |
| Desktop authority | Server-owned OperatorOS tenant to OfficeExit organization bridge; issuer/audience/device/expiry and exact tenant binding | Not implemented |
| Local execution | Explicit device/operator actions and independent Graph consent/target binding | No purchase grants execution, consent, scan, upload or removal |

The three identities must remain distinct: the OperatorOS customer tenant,
OfficeExit organization and VendorTrust365 audited Microsoft 365 directory.
Never merge them by email or infer consent from payment. OfficeExit's existing
standalone organization purchase/device leases are extension seams, not evidence
that its allowance or online/offline terms were approved for OperatorOS.
VendorTrust365's current local PowerShell/WPF audit has no paid hosted licensing
backend. Its unsigned release candidates are not accepted private distribution.

The smallest next commercial decision is **what one purchase licenses, and the
quantity**: the OperatorOS customer organization, audited Microsoft 365 tenant,
or Windows device. The current response intentionally leaves that allowance
null. Price/currency, refund rules, edition compatibility, upgrade eligibility,
updates/support coverage, device/offline terms and accepted distribution must
also be accepted before sales can be enabled. A one-time charge is already
decided; annual billing must not be introduced.

## Verification and remaining acceptance

The actual new policy source passes 20 native cases. Real Fastify routes and
PostgreSQL-backed entitlement behavior pass 18 cases, including existing Stack
seat enforcement and legacy tenant-authority controls, zero failures/skips.
The database is a task-only loopback PostgreSQL 16 container using an already
installed immutable image, tmpfs, no host mounts and synthetic fixtures.
The child environment contains no inherited provider/PAT credentials and a
network guard permits only that PostgreSQL port and local tsx IPC.

Root zero-warning lint, API types, strict checking of both new test files and
read-only release plan pass. The first SQL harness attempt stopped before tests
because its test session key was missing; the key is now supplied before
imports. Initial strict-test checking found one widened role fixture type and
missing standalone compiler options; both were corrected. These failures are
retained in task evidence, not omitted from the result.

Full production build passes: all four workspace typechecks, SDK/API/runner
compilation and Next's 38 static pages. The existing unit gate completed with
51/52 passes, zero skips. Its one failure was the Corepack-version control:
the default process cache could not resolve the installed pnpm and its npm DNS
lookup failed; no package bytes were acquired. The entire affected quality-gate
file then passed 20/20 with the verified existing Corepack cache and networking
disabled. The complete 52-case aggregate was not repeated or called green.
An initial build compiled API/runner and all four workspace typechecks, then
Windows sandbox refused a generated Next route directory. A task-scoped build
retry passed with the same existing packages; no dependency install was run.

Independent immutable-head source review found no substantive issue across all
twelve changed paths; its own 20 policy cases and strict new-test checks pass.
Final documentation-delta attestation and hosted release/vector checks remain
required before source acceptance. Purchase settlement, refund, free-buyer licensed access, native
packaging/signature, browser purchase/download, device/offline and protected
production recovery/acceptance tests are unrun because those features are not
implemented or authorized for rollout. Public runtime readiness was separately
observed at source `677bdb6` and build `ec5af153072658e37d57c318`; it does not
establish acceptance of this unmerged foundation. No production action occurred.
