# ADR-0017: Torque Assist provider, safety, and token-ledger semantics

Status: Accepted
Date: 2026-07-18

## Context

Torque Assist uses paid third-party inference within an automotive diagnostic
workflow. The browser, standalone TorqueShed source, and model must not become
authority for identity, tenant, entitlement, price, payment success, balance,
diagnostic facts, or repair safety. Provider retries and signed-payment replays
must not create duplicate charges.

## Decision

OperatorOS owns server-selected provider configuration, package pricing,
Stripe Checkout, signed raw-body webhook verification, test/live separation,
credits, refunds, entitlements, shared usage, and audit. TorqueShed loads the
authorized diagnostic context and owns the exact debit for an accepted Assist
result.

The result is strict structured JSON that separates sourced facts from user
facts, assumptions, low/medium hypotheses, contradicting evidence, warnings,
tests, stop conditions, and follow-up questions. High-confidence or unsafe
certainty is rejected. Brake, steering, fuel/fire, high-voltage, SRS, and
lifting contexts require explicit escalation. The fixed disclaimer states that
Torque Assist is diagnostic assistance, not repair authorization or safety
certification.

The accounting source is an append-only tenant/user/module ledger. Balance is
computed from credits, debits, reversals, and adjustments. A database trigger
rejects update/delete. The accepted request, exact one debit, shared usage,
activity, audit, and idempotency completion commit in one transaction after a
final locked balance check. Provider failures and rejected results create no
debit.

Full prompts and raw provider errors are not stored or logged. The request row
stores context hash/count/size, estimate/actual units, provider/model/version,
attempts, latency, result, and bounded error code. Context, timeout, attempts,
user/tenant rate, and tenant circuit limits are enforced server-side.

## Consequences

- Browser payment returns and client-selected providers cannot grant credits
  or select billing scope.
- Signed event replay, request replay, and concurrent debits are designed to
  be duplicate-safe without a mutable balance.
- A refund after consumed usage can produce a truthful negative balance; it is
  flagged by reconciliation and later usage is denied.
- Torque Assist cannot claim authoritative diagnosis and remains unavailable
  when its provider is disabled.

## Data, migration, and rollback

Phase 8 adds purchase intents, assist requests, rate/circuit state, and ledger
entries through the root additive release contract. It imports no child
billing, provider credentials, prompt history, or token balance. Apply requires
an approved backup and isolated verification. Rollback restores to a new
database and switches traffic; accounting history is never repaired through
destructive row edits.
