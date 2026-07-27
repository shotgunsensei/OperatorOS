# ADR-0027: OutCall personal-safety and provider boundary

- Status: Accepted
- Date: 2026-07-27
- Phase: 12B
- Supersedes: ADR-0006's interim disabled decision and ADR-0025's temporary
  OutCall reservation

## Context

The original OutCall repository is unavailable. The owner recovered the ten
implementation prompts that defined the product: a discreet exit-assistance
and personal-safety module where an authenticated, entitled user verifies their
own mobile number, creates private exact-match SMS triggers and neutral rescue
profiles, and requests immediate, delayed, or scheduled calls. The prompts
explicitly prohibit arbitrary destinations, caller-ID spoofing, recording by
default, emergency-service contact, emergency/government/healthcare/school
impersonation, and any claim that OutCall replaces 911.

CallCommand AI already owns consent-first business receptionist and call-
operations workflows. Treating OutCall as another CallCommand mode would mix
business contacts, customer consent, safety triggers, and personal phone
ownership in one authorization and privacy boundary.

## Decision

OutCall is a distinct OperatorOS add-on. OperatorOS remains the only identity,
session, tenant, entitlement, billing, module-registry, launch, audit, durable
job, and shared-usage authority.

The Phase 12B source/local workload owns:

- resumable safety acknowledgement and privacy-first user settings;
- one globally verified phone owner per OperatorOS user, projected into each
  authorized tenant without duplicating identity;
- AEAD-protected phone and trigger values plus independent keyed lookup
  fingerprints;
- tenant/user-scoped rescue profiles and exact-match private triggers;
- verified-self-only immediate/delayed scheduling through the shared
  PostgreSQL leased-job worker;
- cancellation, persistent history, safe activity, and append-only usage;
- a runtime-explicit test adapter only when `APP_ENV=test`, `NODE_ENV=test`,
  and `OUTCALL_TEST_ADAPTER=enabled`.

The browser shell never accepts a destination number for a call. The server
copies the current verified phone fingerprint and masked display into the
request. Spoken-message validation blocks emergency, government, healthcare,
school, and law-enforcement impersonation terms. Recording is always false.

Live Twilio Verify, Messaging, Voice, inbound SMS trigger execution, DTMF,
status reconciliation, trusted contacts, check-ins, duress, location, export,
deletion workflows, and administrative support are not claimed complete.
Their UI is absent or explicitly disabled. Production provider operations fail
closed until exact canonical URL signature validation, replay protection,
country/spend/rate controls, and controlled real-number acceptance pass.

## Consequences

- OutCall may use the existing OperatorOS SSO client and source/local module
  shell, but this does not make the deployment or provider path production
  ready.
- CallCommand remains business call operations and does not gain personal
  safety triggers, check-ins, or emergency-adjacent language.
- The shared worker provides lease/retry/restart semantics; OutCall does not
  create an in-memory scheduler or second queue.
- Stripe customer/subscription/webhook authority stays in OperatorOS. OutCall
  usage uses the shared append-only ledger.
- Public promotion requires live Twilio and deployed-host evidence, not a test
  adapter or rendered screen.

## Data and security impact

Every workflow row is tenant-scoped and every user-owned operation also checks
the session user. Foreign rows are not enumerated. Phone ownership is global to
the immutable OperatorOS user, while settings remain tenant-scoped. Private
phrases and full numbers never appear in API projections, logs, usage
metadata, URLs, or browser storage.

## Migration and rollback

Phase 12B adds the ordered, additive, idempotent `outcall_tables` release step
after Ninjamation. Rollback keeps additive tables and disables OutCall in the
catalog, SSO client registry, and deployment registry. Destructive schema
removal or production data deletion requires the documented backup/restore and
human approval gates.
