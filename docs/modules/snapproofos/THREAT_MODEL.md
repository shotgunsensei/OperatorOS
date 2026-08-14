# SnapProofOS Phase 32 threat model

## Phase 32 additions

- Public shares: 256-bit random token, SHA-256 at rest, one approved report,
  expiry/revocation, durable IP-minute rate limit on view and download,
  non-enumerating misses, no-index/no-store, and customer-only snapshots.
- Mobile/file capture: signature and declared-MIME agreement, shared size cap,
  scan/quarantine gate, tenant/object-scoped retrieval, SHA-256 recheck, JPEG
  APP1 EXIF removal, retention-aware deletion, and replay-safe mutation IDs.
- Report history: approved content/branding/totals are immutable; PDF/DOCX bytes,
  length, provenance, and SHA-256 are persisted and checked before download.
- Authority: assignees must be tenant members; private routes enforce module
  entitlement plus viewer/write/admin boundaries; no child auth or billing is
  restored.

The Phase 11B model below remains applicable to private proof/custody controls.

| Threat | Control |
| --- | --- |
| Browser tenant or role override | Mutation parsers reject tenant/user/module/role/entitlement fields; trusted server session scopes every query |
| Cross-tenant object enumeration | Every case, evidence, finding, comment, report, export and attachment query includes tenant; foreign IDs return the same 404 |
| UI-only review authorization | Server write guards and tenant-admin guards enforce decisions, legal hold and archive |
| Public/raw evidence disclosure | No raw/public URL is stored or returned; authorized download revalidates tenant/module/object and uses `private, no-store` |
| MIME spoof or malicious upload | Size bound, signature detection, declared/detected MIME comparison, scan job and quarantine/pending enforcement |
| Stored-byte tampering | SHA-256 is stored with attachment and evidence; every content read rehashes bytes before response |
| Custody tampering | Case-row serialization, unique sequence, previous/event hashes, and database triggers reject update/delete |
| Race or stale review | Expected version plus tenant/ID/state predicates are required for decisions |
| Fake export/provenance | Export bytes are generated synchronously from approved report/custody records and hashed before an append-only export record |
| Secret or sensitive metadata logging | Context recursively rejects secret-bearing keys; logs record identifiers/status codes, not bodies, bytes, URLs or tokens |
| Unsafe retention deletion | Legal hold blocks archive; attachment retention is updated with the case; purge remains shared-worker controlled |
| Child authority revival | Source runtime/auth/billing/share routes are quarantined and contract-tested as excluded |
| Unsafe external egress | No arbitrary provider URL or child credential path exists; integrations require a future shared-adapter contract |
| Tenant hard-delete blocked by immutability | Only the audited platform transaction sets a transaction-local bypass and deletes in dependency order |
