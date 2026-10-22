# Independent tenant tools: source candidate

OfficeExit 2026 and VendorTrust365 are separate USD $99 one-time purchases for
the entire purchasing tenant, available to free and paid accounts. Neither has
a recurring charge, per-user/device/site allowance, or bundled annual support
or update fee. Future major-version coverage is undecided. Lunch Break remains
free and its existing access policy is unchanged.

John approved OfficeExit's $99 whole-tenant purchase to unlock all ten current
OfficeExit 2026 features, including Publisher Rescue. The dedicated tenant
purchase uses the existing internal `MSP Pro` capability alias, not an additional
customer-facing tier. `createOfficeExitTenantToolGrant()` supplies all ten exact
feature keys, `coverage=entire_tenant`, and the technical terms identifier
`officeexit-2026-tenant-v1`. Narrower historical aliases and alternate terms are
rejected in this dedicated bridge lane. Existing standalone edition behavior is
unchanged. This decision promises no future major-version coverage and removes
no binary/release-acceptance gate. `CLOSED_TOOL_COMMERCE` remains unchanged.

## Implemented boundaries

The dedicated ledger stores an immutable server-selected offer, exact provider
account/mode/price/product/session/customer/payment/charge bindings, and signed
webhook receipts. Current persisted tenant owners may initiate a purchase;
synthetic support ownership and Stack subscriptions confer no purchase right.
Pending or already-paid orders prevent accidental duplicate tenant purchases.
Retryable payment declines remain pending. Refund/dispute/cancellation revisions
cannot be reactivated by late paid events. Exact raw-event replay preserves the
original normalized receipt and returns the current order without mutation.

Settlement and a revisioned outbox commit atomically. The OfficeExit worker is
registered only by explicit enabled configuration, prevents overlapping runs,
checks current purchase state and lease before signing, uses a fixed HTTPS
consumer destination with no redirects, and fences acknowledgement/retry by
revision and lease. Shutdown stops scheduling and awaits the active operation.
VendorTrust fulfillment uses the separate authenticated tenant download path;
it needs no hosted SSO or OfficeExit mapping. No scan is executed by purchasing
or downloading either tool.

Private download configuration must name a reviewed local immutable ZIP and
root, exact size/hash/version, and archive-acceptance receipt hash. The receipt
hash is a reference to separately reviewed acceptance, not signature verification.
The reader rejects path/link/type/size/hash changes before returning any bytes.
Technical limits are 256 MiB per archive, two unique reads, and two outstanding
download responses. Larger artifacts require a separately reviewed distribution
design. Tenant membership and paid purchase are re-read after artifact validation;
revocation wins. No real accepted artifact is configured in this candidate.

## OfficeExit browser connection

Both existing accounts must be owned and explicitly confirmed; there is no
email-based mapping, automatic Supabase account creation, or SSO credential reuse.
OfficeExit creates a private five-minute request bound to its current owner and
organization. Top-level navigation to the fixed OperatorOS connection page carries
only a non-authorizing request UUID. Current OperatorOS owners review and confirm
the exact tenant/local organization/account. Dedicated RS256 assertions travel
server to server, with pinned issuer/audience/key and a maximum 60-second lifetime.
The fixed OfficeExit return page requires a second, same-origin local-owner
confirmation and atomically consumes the request/assertion with the mapping.

Lost proposal responses can be retried with identical mapping data. Every old and
new assertion ID remains bound to its request; stale replay cannot extend its
validity or bypass final confirmation. Central authority is checked before issue;
the issued capability has a bounded 60-second window. Final consumption checks
current local ownership; it does not query live central ownership again.

COOP remains `same-origin`; no opener, iframe, CORS, cookie-domain, security-header
or new consumer signing-key change is needed. The transport does not contain
credentials or assertions in redirect URLs. HTTP cookie/session acceptance on
the selected real origins remains a deployment test, separate from source proof.

## Closed production composition and release gates

`CLOSED_TOOL_COMMERCE` disables checkout, OfficeExit linking/delivery, and artifact
delivery. Environment values alone cannot activate these paths. The marketplace
shows the approved $99 tenant price and honestly closed purchase/download state.
Generic module/Stack grants remain fenced; no hosted SSO entry was created for
the desktop tools. Approved activation requires reviewed composition configuration,
not changing a client's paid flag.

This source adds **review-only additive schema 68** to OperatorOS. The prior
schema-67 candidate is preserved. The before-Torque webhook correlation path
depends on the new ledger even while checkout is closed, so schema68 readiness
must precede serving this candidate. No production migration was performed.
OfficeExit's separate proposal is deliberately outside its automatic migration
script. Its two unrelated Git histories retain identical source changes without
merging the histories.

Before activation: approve exact database identities/schema proposals, recoverable
backups and write-pause/restore plan; accept the exact current OfficeExit build
and record remaining refund/upgrade terms; configure existing
provider account/mode/one-time prices and verified webhook bindings; approve
dedicated central signing trust plus exact HTTPS origins; produce and accept
private signed release artifacts; approve test accounts/data and perform the
complete non-charging/test-mode acceptance. Existing source publication and hosted
runner gates still apply. No credential, payment, production data or settings
change is authorized by this document.

Deployment sequence after approval: back up and pause writes; apply/verify each
approved database proposal; deploy compatible disabled services; verify health and
host-only sessions on the selected TLS origins; perform approved test-mode payment,
two-owner connection, grant/download, refund and tenant-isolation acceptance; then
review activation separately. Keep previous service artifacts and database backup.
For rollback, stop new purchases/delivery, preserve provider receipts, and reconcile
in-flight events before any version change. Restore to a new database and switch
traffic if schema rollback is required; never drop ledger/history in place.

Actual check counts, immutable commits, failed attempts and remaining limitations
are recorded in the accompanying portfolio evidence; focused proof does not
establish hosted CI, live provider delivery or an all-module public launch.
