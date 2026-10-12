# Dedicated canonical billing webhook binding

John approved this change and owner-only private production setup at
2026-10-12T20:46:18Z. The unchanged approval transcript is retained in the
local billing-binding-oct12/APPROVAL-EVIDENCE.txt artifact. This code does
not create a Replit secret, read an owner value, generate a Stripe key, activate
a provider, migrate a database, replay an event or publish an application.

## Exact binding policy

Canonical platform billing now requires
OPERATOROS_BILLING_WEBHOOK_SIGNING_SECRET. The inherited generic
STRIPE_WEBHOOK_SECRET is never selected or retried as a fallback, in any mode.
Missing, empty and malformed dedicated values disable the canonical payment
adapter and block new Stack and usage-credit Checkout initiation before SDK
access or purchase-intent persistence. Tenant/owner and price validation remain
in their existing paths. Requests receive a bounded503 configuration error.

One non-secret JSON contract owns the name and full-value format pattern.
API and preflight apply that same policy: whsec_ plus a nonempty opaque suffix,
without whitespace, quotes or control characters. Values are never trimmed,
decoded or normalized. The end check rejects a terminal newline; valid opaque
symbols are retained. Inspection returns metadata only, without values,
lengths, digests or arbitrary environment output.

The server captures one binding at module load. SDK verification, adapter
configuration, billing-mode status and operator health use that same snapshot.
Revenue preflight and the read-only audit apply the same validation contract to
their supplied environment. Configuration means format/presence, not proof
that a key matches the intended endpoint or came from a particular provider
storage tier. Current settings do not update an already running API process.

The original raw bytes, three SDK arguments, default300-second tolerance,
signature rejection, event claims and receipt idempotency remain unchanged.
No alternative key is attempted after SDK rejection. Separate TradeFlowKit
Connect signing configuration is unchanged.

isStripeEnabled() still describes the API key/mode. It is deliberately not
changed to depend on signing readiness: that helper also controls legacy
cancellation/provider management. Cancellation, reactivation, existing
subscription management and refund/settlement code are preserved. Only new
charge-initiating Stack and usage-credit Checkouts gain the additional guard.
The runtime supervisor omits this new credential from Next and database
verification children; the API child retains the binding.

## Owner-private setup and publication gate

1. Confirm the exact new name is absent from Account/workspace inheritance
   using names only. Source collision searches passed, but they cannot prove
   provider inventory. If there is an applicable same-name shared binding,
   stop and report it rather than editing the shared Account value.
2. After exact-source review/CI and the parent's source handoff, the owner
   privately creates this entry only in the selected Production deployment,
   using the existing live canonical endpoint signing secret. This is new
   persistent credential access and is specifically covered by the approval;
   no agent may receive, view, transmit, paste or enter its value.
3. Verify saved independent/linkage metadata, then use the sole publisher's
   approved exact v65 artifact path. The name does not guarantee Replit's
   persistence or injection behavior. No real value goes into Git, .replit,
   .env files, screenshots, Library artifacts, logs or chat.
4. Check the serving release identity and private operator billing readiness.
   Keep new customer checkout intake paused until separately authorized live
   signing acceptance. Configuration readiness alone is not payment recovery.
   No replay is authorized by this change; natural delivery or another live
   action requires the parent's acceptance scope.

Missing/invalid injection produces a visible disabled binding and blocked
checkout instead of silent generic-key fallback. A format-valid wrong value,
altered raw bytes/header or clock problem can still cause SDK rejection. Such
a result is evidence for further diagnosis, not permission for another blind
key change or wider tolerance.

## Scope, tests and rollback

The v65 branch starts from reviewed source
9f485444e34ce214982ea61e456c4a4c1ca3ecb7, tree
cc0505a9c440a515eff843b0c8fa3f505f0e6935, matching the reported serving tree.
The main integration starts from daf78578267ff929f049c0d7dc18619f03f28a82
and preserves PR120, AI work and manifest v66. This feature adds no migration.
The v65 artifact does not acquire main's unrelated v66 work.

Focused synthetic tests cover invalid/absent binding despite a valid generic
key, snapshot consistency, exact SDK bytes/arguments and default tolerance,
generic-key signature rejection, blocked provider/intent access and unchanged
legacy provider cancellation. Tests also bind API/preflight policy and isolate
the signing key from nonbilling child environments. Compiled API smoke checks
the copied JSON policy using fake values and blocked networking.

Required aggregate release/vector evidence and independent review are separate
gates, recorded in the final local receipt/PR rather than inferred from another
commit. No real credentials, provider calls or customer data are used in tests.
The four inherited patched exceptions remain unchanged and disclosed:
GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr, GHSA-86w9-cpqp-85rv,
GHSA-vfj7-8cjw-p6xm.

Removing the new binding fails closed and does not restore generic acceptance.
Keep receipts and schema intact. Reverting this policy itself would restore the
unresolved inherited-key behavior, so that is a security-sensitive rollback,
not an automatic publication fallback. Prefer forward repair; keep billing
intake paused if a rollback binding cannot be verified. Main/v66 production
target/recovery/write-pause gates remain unchanged.
