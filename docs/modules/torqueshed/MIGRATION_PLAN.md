# TorqueShed migration plan

Assessment date: 2026-07-18

Status: dry-run planning only. No data apply is implemented or authorized.

## Source and mapping

Immutable source provenance is the quarantined snapshot at commit
`c33ade5cef525d62d371a63946b814c58a72a4a7`. The newer committed reference
`508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75` informs the export contract but is
not silently substituted for the pinned snapshot. Dirty working-tree content
is never eligible migration input.

The versioned dry-run planner maps vehicles, mileage, vendors, service
records, parts, builds/stages/tasks, reminders, diagnostics/codes/entries,
templates, and attachment metadata to namespaced or shared OperatorOS targets.
Legacy owners must have an explicit source-user to OperatorOS-user mapping.
Users, sessions, memberships, credentials, token ledgers, subscription, and
billing records are excluded.

Marketplace and Community are not eligible for Phase 9 import. The inspected
standalone checkout contains schema declarations and simulated/local-only UI,
not an approved production dataset or authoritative export. Protected-checkout,
shipping, dispute, seller-rating/sales-count and fee mockups are not mapped.
No standalone table or migration is applied to OperatorOS.

If a later approved export proves real user content exists, it requires a new
versioned dry-run contract mapping each source author to an OperatorOS tenant
member; converting prices to exact integer minor units; reducing location to
locality/region/country; rejecting prohibited/protection claims; scanning every
image through shared attachments; reconciling tags/comments/reactions/follows/
favorites/messages/reports; and preserving source moderation timestamps in a
separate import ledger. Sessions, credentials, exact addresses, private VIN/
diagnostic data, transaction/payment/shipping records and synthetic reputation
remain excluded.

## Reconciliation rules

- Every source ID is unique and receives a per-record SHA-256 mapping ledger
  entry plus a whole-export fingerprint.
- Every vehicle, vendor, service, part, build, stage, task, reminder,
  diagnostic, code, entry, and attachment reference must resolve before an
  apply design can be approved.
- VINs are validated then transformed to fingerprint plus suffix; plaintext
  values are never target data.
- Labor, parts, other, part-unit, task, and build amounts must be
  non-negative integer minor units. Dry-run totals are reconciled.
- Attachment object references, counts, and byte totals are reconciled.
  Bytes later enter through shared storage and scanning; source paths and
  storage keys are not trusted.
- `readyToApply` means only that the export is internally coherent. It is not
  permission to connect to or mutate a database.

Example fixture command from the repository root:

```powershell
pnpm --dir apps/api exec tsx src/scripts/torqueshed-import.ts --dry-run --input test/fixtures/torqueshed-export-v1.json
```

## Apply requirements

A future apply mode requires explicit approval of the exact export
fingerprint, destination tenant, identity mapping, reviewed commit, backup,
maintenance window, rollback owner, attachment disposition, and conflict
policy. It must use transactional batches, durable migration claims,
tenant-composite lookups, idempotent reruns, row/count/cost/attachment
reconciliation, and second-tenant negative tests. Child migrations and direct
copies are prohibited.
