# OperatorOS platform threat model

Assessment date: 2026-08-14 (Phase 39 refresh)

## Scope and assets

OperatorOS is the sole authority for credentials, sessions, tenants,
memberships, roles, subscriptions, entitlements, module registration, SSO
launches, and platform audit. Protected assets include password hashes,
host-only sessions, opaque SSO codes, tenant data, Stripe state, provider
secrets, audit evidence, and the ordered database release history.

## Trust boundaries

1. Browser to the exact OperatorOS or registered module host.
2. Next.js host router to the Fastify API.
3. Fastify authorization to tenant-scoped PostgreSQL data.
4. OperatorOS to Stripe, Twilio, email, and AI providers.
5. HTTP process to durable jobs, private attachments, and database releases.
6. Operator-controlled migration input to the isolated migration tooling.
7. Versioned cross-module outbox/inbox events to destination-module records.
8. Browser/native offline queues to authenticated replay-safe mutation APIs.
9. Public share/intake/status surfaces to token, abuse-control, and redaction boundaries.
10. Unified API to the separately isolated runner gateway. The public production
    contract sets `RUNNER_MODE=disabled`; host execution is never a fallback.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Credential theft or account probing | bcrypt hashes, generic failures, lockout, rate limits, password and session-version rotation |
| SSO interception or replay | Opaque short-lived single-use codes bound to exact client/callback, state, nonce, PKCE S256, tenant, module, entitlement, environment, and relative return path |
| Cross-host session theft | Host-only `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` cookies; no parent-domain cookie or browser bearer storage |
| Open redirect or token leakage | Registered exact origins/callbacks, relative return-path validation, no tokens in URLs, raw request URLs excluded from logs |
| CSRF from sibling or foreign origins | Exact production CORS allowlist plus same-origin validation for browser mutations |
| Cross-tenant IDOR | Trusted session tenant, membership and entitlement revalidation, tenant predicate on reads/writes/relationships, masked foreign-resource responses |
| Role or entitlement escalation | Server-side guards; modules may narrow but never widen OperatorOS authority; UI visibility is not authorization |
| Billing duplication or forgery | Stripe signatures over raw body, event claims/idempotency, transactions, reconciliation, and OperatorOS-owned subscription state |
| Injection, XSS, SSRF, or unsafe files | Schema validation, parameterized queries, bounded/sanitized text, no arbitrary provider URL fetch, private upload validation and scan states |
| Secret or sensitive-log disclosure | Structured allowlisted request metadata, header/body redaction, route templates instead of raw URLs, safe provider errors |
| Resource exhaustion | Authentication and mutation limits, bounded database pool/timeouts, paginated queries, bounded workers, leases and retry limits |
| Supply-chain compromise | Frozen pnpm lockfile, high-severity audit gate, reviewed overrides, no committed live secrets |
| Failed restart or partial migration | Readiness gate, graceful worker/database drain, ordered idempotent release manifest, backup/restore and rollback rehearsals |
| Cross-module event replay, loop, or tenant pivot | Tenant-bound references, signed envelopes, correlation/causation IDs, inbox uniqueness, hop limits, destination authorization, dead-letter repair audit |
| Queue silently stalled while the process is alive | Readiness requires a current successful worker heartbeat and no ready item older than five minutes; operational response exposes only bounded counts/ages |
| Host command execution from the unified runtime | Production preflight requires `RUNNER_MODE=disabled`; execution/control routes return a truthful 503 until a separately approved isolated gateway exists |
| Malicious image metadata exhausting a build/runtime worker | Reviewed `image-size@1.2.1` patch rejects non-advancing ICNS/JXL entries; malicious-input regression fixtures and exact GHSA exception integrity are release gates |
| Browser content injection or framing | Comprehensive CSP, no object/frame embedding, form/base restriction, HSTS, COOP/CORP, server-side sanitization and no raw user HTML |

## Privacy boundaries

Module payloads remain tenant scoped. PulseDesk forbids PHI in general
operational text; TechDeck stores vault references rather than credential
values; TorqueShed treats VIN and location as sensitive; telephony modules
require consent and keep recording disabled unless separately approved.
Provider prompts, full phone numbers, tokens, signatures, and secret values are
not permitted in request completion logs.

## Residual risk and review triggers

Live-provider behavior, proxy behavior, load characteristics, and backup
recovery must be revalidated on the target deployment. Any parent-domain
cookie, module-local credential system, arbitrary remote fetch/execution,
recording enablement, new payment authority, or unscoped database access
invalidates this model and is a release blocker pending review.
