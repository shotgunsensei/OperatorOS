# Ninjamation threat model

## Phase 39 platform-hardening overlay (2026-08-14)

GitHub provenance/checksums, bounded downloads, generated-script safety
metadata, owner/admin isolation, and the strict no-execution-in-web/API
boundary are release-gated by the platform threat model and
[Phase 39 register](../../phase-39/THREAT-MODEL-REGISTER.md).

Assessment date: 2026-07-27

## Protected assets and boundaries

Protected assets are tenant automation definitions, reviewed script source,
execution requests, approvals, runner capability metadata, results, provider
configuration, and audit evidence. The public application does not execute
arbitrary browser-supplied commands on the OperatorOS host.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Cross-tenant automation access | Session-derived tenant, tenant predicates on definitions/runs and masked foreign-resource responses |
| Unauthorized script creation or approval | Server-side write/manage permission gates and explicit approval state |
| Arbitrary server command execution | Shared runtime records reviewed workflows; no public route passes free-form input to an OperatorOS shell |
| Script tampering after approval | Versioned source/digest and approval invalidation when content changes |
| Secret disclosure | Scripts must reference external secret handles rather than values; request/log/export redaction and forbidden sensitive fields |
| Duplicate or runaway execution | Idempotency, bounded concurrency/timeouts, leases, retry limits and cancellation state |
| Unsafe target reachability | Explicit runner/target capability boundary and deny-by-default provider configuration |
| Result or audit forgery | Server-owned state transitions, durable result metadata and append-only audit events |
| Injection or stored XSS | Bounded validation and text rendering; script content is displayed as inert source and is not rendered as HTML |

## Residual risks

Execution against real endpoints is deployment- and agent-dependent and is not
proven by storing a workflow. A signed least-privilege runner protocol,
per-target authorization, egress policy, sandboxing, artifact provenance, and
emergency revocation are mandatory before expanding the execution boundary.
