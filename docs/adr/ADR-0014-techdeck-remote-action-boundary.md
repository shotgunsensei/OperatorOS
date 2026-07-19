# ADR-0014: TechDeck runbooks are documentation-only

Status: Accepted

## Context

The recovered source includes an AI-assisted IT Ops console that drafts
PowerShell, Bash, and network responses. The active OperatorOS slice also
stores runbook text. Neither repository contains an approved endpoint agent,
device identity, signed command envelope, least-privilege execution policy,
operator confirmation protocol, result attestation, or emergency kill switch.
Executing this content from the OperatorOS server would create an arbitrary
remote-code-execution control plane.

## Decision

TechDeck may author, review, approve, publish, version, link, and attach
documentation-only runbooks and procedures. It exposes no execute, dispatch,
shell, SSH, PowerShell, Bash, RMM, or device-mutation route. Status and audit
events describe document workflow only and must never say that a command ran.

Any future remote action requires a separate signed endpoint-agent trust
boundary and threat model covering device enrollment/attestation, mutually
authenticated transport, scoped commands, multi-party authorization for high
risk actions, anti-replay, expiry, output redaction, durable audit, tenant and
device isolation, revocation, rate limits, kill switch, and incident response.

## Consequences

- Runbook content is rendered as safe text/Markdown, never executed.
- The standalone IT Ops AI console, localStorage "vault", and remote-action
  language are excluded from the active Phase 5 UI and API.
- Approval or publication means the procedure is reviewed documentation; it
  is not authorization to execute it.

## Migration and rollback

Source runbooks import as documents with source references. No execution
history is inferred. The schema and routes are additive; rollback uses the
OperatorOS backup/restore runbook.
