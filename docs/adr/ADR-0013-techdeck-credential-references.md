# ADR-0013: TechDeck stores credential references, never credential values

Status: Accepted

## Context

Managed-infrastructure documentation often needs to identify where an
authorized operator can obtain a credential. The recovered source includes an
`externalVaultReference` concept, but OperatorOS has no approved vault adapter
or encryption-key lifecycle for module-owned secrets. Plaintext passwords,
tokens, keys, connection strings, recovery codes, and private material would
create unacceptable exposure through databases, exports, logs, search, and
support tooling.

## Decision

Phase 5 persists only optional external vault references using an allowlisted
non-secret reference shape. TechDeck exposes no secret-value, reveal, decrypt,
copy, or rotation API. Request bodies and generic metadata reject keys or
fields shaped like passwords, passphrases, secrets, tokens, API keys, private
keys, connection strings, or credential values. List/detail/search/export and
audit projections contain references only.

An actual credential store requires a future ADR covering an approved vault
or envelope encryption, key custody and rotation, break-glass authorization,
masked lists, explicit reveal auditing, export exclusion, retention, and
incident response. Until then, a vault reference is documentation, not proof
that a credential exists or is usable.

## Consequences

- No TechDeck schema column can hold an ordinary secret value.
- Imported local-auth/MFA/API-token/reviewer-password fields and the browser
  `localStorage` IT Ops "vault" are excluded from the active runtime.
- Operators may record a bounded reference such as `vault://team/item-id` or
  an approved HTTPS item URL without embedded credentials or query strings.

## Migration and rollback

The dry-run importer reports secret-bearing or unsupported fields as excluded
authority/security data and never maps their values. Rollback follows the
root database restore procedure. No secret material is created by this phase.
