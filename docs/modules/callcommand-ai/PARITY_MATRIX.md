# CallCommand AI parity matrix

Status: Phase 11E source/local implementation contract. The imported source is
read-only evidence, not an executable child application.

## Provenance

| Evidence | Value |
| --- | --- |
| Standalone checkout | `C:\Dev\Call-Command-AI` |
| Pinned commit | `d49434e1d641d62cc141591c7208539a7afbf11e` |
| Remote | `https://github.com/shotgunsensei/Call-Command-AI.git` |
| Imported snapshot | `apps/modules/callcommand-ai/source` |
| Manifest | `apps/modules/callcommand-ai/source/SOURCE_SNAPSHOT.json` |
| Snapshot inventory | 450 tracked files; 369 retained files; 4,436,242 bytes |
| High-confidence secret findings | 0 |
| Authority decision | `docs/adr/ADR-0025-callcommand-outcall-consent-and-provider-boundary.md` |

## Product parity

| Source capability | OperatorOS target | Phase 11E acceptance |
| --- | --- | --- |
| Channels and phone lines | Tenant channel with E.164 line, timezone, consent language, recording default and lifecycle | Persisted, unique, tenant-scoped and audited |
| Receptionist profiles | Bounded receptionist/intake/dispatcher profile and intake fields | Persisted configuration; no medical/automotive diagnosis |
| Transfer targets | Review-only external or voicemail target configuration | No automatic verification or execution claim; user/queue placeholders excluded |
| Consent toggles | Evidence-bearing purpose-specific consent ledger | Server required before every outbound provider request |
| Call flows and events | Signed inbound DTMF intake plus constrained operational state and append-oriented safe events | No arbitrary child flow execution, speech capture or raw provider payload |
| Call records | Masked tenant call history, direction, status, purpose, provider, summary and operator disposition | Persistent dashboard and detail endpoint |
| Telephony provider | Twilio only, exact callback URL and signed shared receipt processing | Disabled when unconfigured; no production stub |
| Test/simulation | Explicit local test adapter | Only `APP_ENV=test` plus opt-in; no external contact |
| Recording | Forced-off recording state with replay-audited callback rejection | No recording SID/URL activation in API or UI; no recording content in storage or logs |
| Follow-up | Persisted SMS/email/task draft requiring review | No simulated delivery claim |
| Analytics | Counts derived from persisted call records | No fake counters |
| Import | Commit-pinned dry-run mappings and exclusions | No apply mode or production mutation |

## Explicit exclusions

- Standalone users, Clerk auth, sessions, roles, tenant and admin authority.
- Child Stripe plans, subscriptions, checkout and billing webhooks.
- Integration/ingestion tokens and provider credentials.
- Demo AI fallbacks, simulated delivery and static dashboard counters.
- SIP/Asterisk/FreePBX TODO providers.
- User and queue transfer placeholders.
- Unverified transfer execution, recording, transcription and AI summaries.
- Bulk/cold/predictive dialing, purchased lists and autonomous campaigns.
- Public recording URLs, raw provider payload retention and browser provider
  credentials.
- Medical, automotive, legal or emergency diagnosis/advice.

## Threat model and controls

| Threat | Control |
| --- | --- |
| Cross-tenant reads/references | Trusted tenant predicates plus composite tenant FKs; foreign IDs return not found |
| UI-only access | Server entitlement and read/write guards on every first-party endpoint |
| Unconsented contact | Exact phone fingerprint plus active same-purpose consent checked inside transaction |
| Do-not-call violation | Active suppression checked before consent; suppression wins |
| Duplicate/costly provider requests | Tenant idempotency uniqueness and per-tenant/user rate limit |
| Fake provider success | Production provider absence returns 503; test adapter is explicit and test-only |
| Forged/replayed callbacks | Twilio signature plus shared receipt deduplication/retry |
| Recording leakage | Recording enablement fails closed; signed callbacks remain disabled and never persist a SID or provider URL |
| Sensitive logs | Masked phone responses, safe event projections and scrubbed bounded errors |
| Abusive automation | No campaign/bulk surfaces; OutCall remains disabled |

## Reconciliation and cutover gate

Dry run accepts only the pinned source commit and reports stable checksums,
counts, mappings, exclusions and blockers. Apply remains blocked until tenant
and user mapping, consent/suppression reconciliation, recording jurisdiction
review, backup/restore rehearsal, source write freeze and reconciliation
thresholds are authorized.

State 5 additionally requires deployed-host SSO, entitlement, persistence,
deep-link, tenant-isolation, authorization, signed-provider, health, logout and
end-to-end evidence. Local source implementation is not production readiness.

## Phase 11E local closure evidence

- Focused static/domain/import contracts pass.
- Disposable PostgreSQL workflows pass 5/5 for tenant isolation,
  authorization, consent, suppression, disposition, follow-up and persistence.
- Signed Twilio callback, inbound DTMF, replay and recording-privacy workflows
  pass 4/4.
- The ordered release contains 27 steps and passes clean apply plus idempotent
  reapply.
- Workspace typecheck, production build, core preflight, compiled supervisor
  and direct/web-proxied health/readiness pass locally.
- The complete API aggregate passes 825/825 with no fail or skip.
- The focused CallCommand browser workflow passes 1/1 in 12.3 seconds; the
  complete production-host SSO/workflow matrix passes 9/9 in 1.8 minutes.

No production deployment, live Twilio call/callback, recording-jurisdiction
approval, standalone data apply or traffic cutover is included in this
evidence. The module remains state 4.
