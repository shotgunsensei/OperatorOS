# OutCall Architecture

Status: implemented source/local candidate; globally coming soon. OutCall uses
OperatorOS exact-host SSO, launcher, entitlement, and billing authority, but its
catalog and production launch remain closed. Configuration is not provider or
customer acceptance. See the current [readiness ledger](../PRODUCTION_OUTCALL_READINESS_2026-10-14.md).

## Product boundary

OutCall is a distinct verified-self exit-assistance product. An authenticated,
entitled user can:

- accept the non-emergency safety notice;
- verify one personally owned mobile number;
- create neutral call profiles and private exact-match SMS phrases;
- request immediate, delayed, or scheduled calls to that verified number;
- cancel pending calls and review safe call history;
- export or delete private OutCall data after password reauthentication.

The browser never supplies a destination for a call. Arbitrary destinations,
caller-ID spoofing, recording, emergency-service contact, location, trusted-
contact escalation, and emergency/government/healthcare/school impersonation
are outside this release.

## OperatorOS authority

OperatorOS remains the only authority for identity, sessions, tenants, roles,
billing, entitlements, module registration, launch policy, shared activity,
usage, and audit. OutCall uses the host-only module session and resolves the
trusted tenant and user on the server. Every read, write, uniqueness rule, job,
event, rate-limit bucket, and callback lookup is tenant or user scoped as
appropriate. Foreign resources are not enumerated.

The active implementation lives in:

- `apps/api/src/lib/outcall.ts`
- `apps/api/src/lib/outcall-provider.ts`
- `apps/api/src/lib/outcall-db-init.ts`
- `apps/api/src/routes/outcall-routes.ts`
- `apps/web/src/components/module-shells/OutCallShell.tsx`

`apps/modules/outcall/source` remains non-executable migration evidence.

## Durable workflow

Release v33 adds `outcall_product_operations` after the base OutCall tables.
The additive, idempotent schema binds triggers to owned profiles, prevents a
provider call identifier from being reused, and stores durable tenant/user rate
limits. Calls are queued through the shared PostgreSQL job worker; no browser
timer, request continuation, workspace uptime, or filesystem state is
authoritative.

The live worker uses one provider submission attempt. If the provider outcome
is uncertain, OperatorOS keeps the call processing with
`OUTCALL_PROVIDER_OUTCOME_UNKNOWN` for reconciliation and never submits again.
An expired lease after process death marks the same uncertainty. A matching
signed callback can recover final state and exactly-once acceptance usage.
This does not prove process termination or autonomous carrier reconciliation.
Test mode remains available only when all of
`APP_ENV=test`, `NODE_ENV=test`, and `OUTCALL_TEST_ADAPTER=enabled` are true.

## Twilio boundary

The module-scoped Twilio integration provides Verify SMS, verified-self voice,
status callbacks, DTMF confirmation, and exact-match inbound SMS triggers.
Recording is forced off. The controlled launch permits North American `+1`
destinations only and requires `US` or `CA` in the explicit country allowlist.

Twilio signs the public `/api/modules/outcall/webhooks/...` URL. The shared web
runtime rewrites that route to Fastify `/v1/modules/outcall/webhooks/...`; the
signature verifier restores the exact public URL before validating the digest.
Callbacks require a valid signature, persist a payload digest and safe fields,
bind provider identifiers to the existing call, and use the shared replay-safe
receipt processor. Raw SMS content, OTP values, trigger phrases, and full phone
numbers are not copied into activity, usage, or callback metadata.

Production provider calls require complete configuration plus the explicit
`OUTCALL_LIVE_PROVIDER=enabled` gate. Missing or invalid configuration leaves
calling unavailable while the rest of the module remains safely readable.
Current permission, phone ownership, safety acknowledgement, destination
integrity and SMS suppression are rechecked at execution. SMS STOP suppresses
SMS replies/triggers; it does not revoke a separately requested self voice call.
Country-level validation and aggregate spending/concurrency controls remain
launch blockers; the existing +1 prefix check is not a country determination.

## Privacy and lifecycle

Phone numbers and trigger phrases use AES-256-GCM protection with separate
HMAC lookup keys. APIs return masked numbers and never return a trigger phrase.
Private export returns decrypted user-owned values only after password
reauthentication. Deletion cancels pending jobs, rejects deletion during an
in-flight call, removes the current user/tenant private slice and callback
receipts, and retains only central platform audit and billing-usage records.

## Release boundary

Source/local acceptance requires focused provider and database workflows,
the full API aggregate, typecheck, the ordered release apply/reapply, production
build, and exact-host browser coverage. State 5 and a production-ready label
remain blocked until the exact committed revision is deployed and passes DNS,
TLS, health/readiness, SSO, tenant denial, real Twilio Verify/voice/SMS/DTMF,
spend and geo controls, monitoring, backup/restore, rollback, and controlled
customer acceptance.
