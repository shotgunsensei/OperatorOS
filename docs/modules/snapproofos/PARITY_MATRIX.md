# SnapProofOS Phase 32 parity matrix

## Current executable truth (2026-08-12)

Pinned source `26bded38c13b5b6361d407462c68052b0c30613d` compiles to
341 exact facets: 240 `ACTIVE_NATIVE`, 101 `ACTIVE_SHARED_EQUIVALENT`, zero
`OWNER_WAIVED`, and zero `BLOCKED`. All sixteen source table domains are active.
The full per-facet ledger is `docs/parity/modules/snapproofos.json` and the
generated record is `docs/phase-32/SNAPPROOFOS-COMPLETE-PRODUCT-REPORT.md`.

Phase 32 restores customers, jobs/assignment/archive, findings, internal and
customer/voice notes, parts/labor totals, scanned and retry-safe mobile files,
templates, branding/logo, report approval, real PDF/DOCX exports, and secure
expiring/revocable shares. ADR-0036 supersedes Phase 11B's product-boundary and
public-share retirements while preserving OperatorOS parent authority.

The Phase 11B material below is historical evidence, not current disposition.

## Phase 20 truth notice (2026-08-08)

The matrix below is historical implementation evidence. Current release truth
is `docs/parity/modules/snapproofos.json`: 341 capabilities, 0 native, 0
shared-equivalent, 0 owner-waived, and 341 blocked pending exact target/test
mapping. See `docs/phase-20/PRODUCT-TRUTH-REPORT.md`.

Assessment date: 2026-07-26

Candidate status: Phase 11B source/local consolidation state 4. This document
does not claim state 5 or production readiness.

## Provenance

The clean `C:\Dev\snapproof` checkout and quarantined snapshot resolve to
`26bded38c13b5b6361d407462c68052b0c30613d`. The snapshot records 336 tracked
files, 259 retained files, 3,400,008 bytes and zero high-confidence secret
findings. The child runtime, dependencies, auth and migrations are not used.

## Capability disposition

| Source capability | Source reality | Phase 11B disposition |
| --- | --- | --- |
| Auth, organizations, teams | Child JWT credentials and local organization/team authority | Exclude; OperatorOS SSO/session/tenant/member authority only |
| Billing | Child subscription controls | Exclude; OperatorOS billing and entitlement only |
| Jobs | Persistent proof-of-work collection | Map to tenant-scoped evidence cases |
| Findings and notes | Persistent but inconsistently tenant-joined | Retain with case/evidence composite tenant validation; comments append-only |
| Files | Metadata trusts client `fileUrl`; no bytes, signature, scan or authorized content route | Replace with shared private attachments, signature/MIME validation, scan state and integrity rehash |
| Review | Loose job/report states | Server lifecycle with member submission and tenant-admin decision |
| Chain of custody | Absent | Add sequence-locked append-only SHA-256-linked events |
| Reports | Persistent metadata/content | Generate immutable report snapshots with content hash |
| Exports | Marks complete and returns a fake path | Generate real synchronous JSON/CSV bytes and append provenance record |
| Share links | Public raw token and broad case response | Exclude until a separately approved constrained sharing contract exists |
| Retention/archive | Incomplete | Add retention dates, legal hold and server-enforced archive |
| Dashboard/search | Partially real plus static/empty source surfaces | Use only persisted counts and bounded server filtering/pagination |
| Integrations | No approved provider contract | Disabled; future providers must use shared OperatorOS adapters |

## Completion boundary

State 4 requires persistent approved workflows, tenant/user non-enumeration,
viewer denial, reviewer enforcement, append-only database controls, secure
attachment behavior, deterministic migration assessment, ordered clean release,
production build/start, health, canonical deep links, SSO return/logout and
local production-host browser acceptance. State 5 additionally requires the
exact revision deployed and accepted on the target environment with an
authorized data reconciliation/cutover record.

## Evidence status

- Focused domain/import/database/release/deep-link contracts pass 17/17.
- The clean aggregate passes 787/787 with zero failures or skips.
- Typecheck passes for API, runner gateway and web; the complete production
  build and core preflight pass.
- The ordered 24-step release passes clean apply and idempotent reapply.
- The compiled supervisor, direct and web-proxied health/readiness, and the
  full production-host browser matrix pass locally. SnapProofOS is exercised
  through real private upload, review, custody, report/export, return, global
  logout, direct deep-link reauthentication, refresh, mobile and persistence.
- No production deployment, standalone source-data apply, backup/cutover or
  deployed acceptance was authorized. State 5 remains blocked.
