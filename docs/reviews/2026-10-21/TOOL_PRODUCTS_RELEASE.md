# Independent one-time tools: source release increment

OfficeExit 2026 and VendorTrust365 are separate one-time tenant add-ons for
free and paid OperatorOS accounts. Neither requires a paid base plan, Stack
seat, subscription renewal or bundled annual updates/support fee. The current
`not_bundled` coverage contract supersedes the October 20 foundation's pending
support decision. It promises neither lifetime upgrades nor an invented price
or license allowance.

## Implemented boundary

The previously reviewed foundation from `5f88a7e6` is now integrated onto the
Lunch Break/all-module candidate `28b78070`. The authenticated read-only
`GET /v1/tools/catalog` rechecks active user/tenant, actual membership and current
persisted ownership. A support administrator's synthetic owner context cannot
authorize a purchase. Free versus paid subscriptions do not affect eligibility.

Browse tools now presents the two products separately from Application Stacks.
Their real local Windows workflows and unavailable sales/download state are
explicit. There is no inactive purchase button, invented checkout URL, price,
unlimited allowance, hosted scanner or subscription upsell. The display clears
old identity/tenant decisions synchronously and ignores late requests. Server
authorization remains authoritative.

Reserved tool slugs cannot inherit legacy/manual/Stack/trial/support grants or
generic grant/revoke writes. Existing module access, FieldNode free-account
behavior, Lunch Break, Pool Hall and paid Stack terms are retained. No tool is
registered for hosted SSO launch. No database schema or release-manifest change
is included; the existing manifest remains v67.

## Verification before the source commit

- Policy: 20/20, no failures or skips.
- Real Fastify/PostgreSQL 16.14: 21/21, including catalog authorization,
  foreign/synthetic ownership, owner transfer, inactive/removed contexts,
  reserved-tool entitlement fences, existing Stack seats and free apps.
- Existing routing/navigation/free-module regressions: 64/64.
- Real AuthProvider/TenantProvider and catalog component in local Chromium:
  6/6, no retries/skips, covering member scope, mismatched-response rejection,
  read-only retry, late tenant/identity responses, same-ID relogin and WCAG
  A/AA checks at 390/1440 pixels. All HTTP responses in this fixture are
  synthetic; this is not a deployed session or purchase proof.
- Four workspace type checks and zero-warning root lint passed for the runtime
  change. Final checks include the new browser test/configuration.
- Independent scoped source review found no concrete defect. Formal Security
  scan infrastructure was unavailable; no formal scan completion is claimed.

The first sandboxed SQL/routing attempts failed local socket permissions; the
authorized isolated reruns above passed. The first browser fixture failed CSS
bundle configuration before exercising the component; the corrected fixture
passed. Those failed logs are retained, not relabeled as passes.

Final production build, built Browse tools acceptance and final artifact/tree
closure are recorded in the external frozen candidate manifest after this
commit. They are required and are not preclaimed here. Prior full-platform API
and unit failures and the held SSO expectation remain outstanding; focused
results do not become a complete all-module gate.

Tools were reused from existing installations without acquisition. This is not
a canonical frozen-lockfile dependency installation. Maintained PulseDesk
ImapFlow 1.3.1/Mailparser 3.9.8 closure remains unresolved and untouched.

## Remaining source work and owner gates

The catalog is readiness, not a completed purchase. The real unified journey
still needs a verified one-time purchase ledger, provider settlement and
reversal handling, tenant-scoped private fulfillment and native licensing.
Generic module grants must never substitute for purchase provenance.

The recommended authority is OperatorOS for its tenant add-on checkout and
verified fulfillment ledger, preserving OfficeExit's existing standalone
orders and signed device leases. OfficeExit has its own Supabase organization
and one-time Stripe checkout; it has no OperatorOS mapping/import endpoint.
Use an explicit stable OperatorOS tenant-to-OfficeExit organization mapping
and server-verified immutable user/role mapping. Do not join by email or trust
browser organization IDs or paid flags. VendorTrust's assessed Microsoft 365
directory is a third distinct identity; purchasing the tool grants no Graph
consent or permission to scan that directory. A coordinated bridge/schema and
idempotency/revocation contract must be implemented and reviewed before a
unified add-on journey is advertised. Any proposed migration is review-only
until separate exact-database, backup and apply approval.

Owner decisions still needed: price/currency, license unit/allowance, refunds,
supported edition/release and upgrade rules, device/offline policy and accepted
private distribution/signing. No annual support/update fee is proposed. These
decisions must be supplied before active products/checkout or license limits
are configured; no billing product, credential or entitlement was created.

Acceptance requires approved free/paid owners, member and second-tenant
negatives; test-mode checkout, signed event/replay/refund/revocation and private
download evidence; exact rebuilt signed Windows artifacts and isolated
installer/native workflow acceptance. Historical tool packages do not contain
the October 21 fixes and must not be advertised as current builds.

All fourteen platform modules including Outcall remain in Friday's target.
Source publication of this combined OperatorOS ancestry remains held on the
already-pending `apps/web/e2e/sso-v1.spec.ts` approval. That file was neither
edited, executed nor published in this increment. No merge, deployment,
production data/schema, account, credential, provider/security change, purchase,
call, scan or live artifact installation occurred.

Rollback for this source-only increment is a reviewed application-source
revert; there is no schema rollback. Any eventual deployed/native artifact
rollback remains a separately approved exact-build operation.
