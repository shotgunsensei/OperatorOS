# PulseDesk privacy and threat model

Assessment date: 2026-07-18

## Protected assets and boundaries

PulseDesk protects tenant-scoped operational tickets, internal notes,
requester replies, attachments, equipment references, time, SLAs, vendor
coordination, supply/facility requests, and audit history. OperatorOS owns the
authenticated subject, trusted tenant, module access, platform role,
entitlement, billing, Directory, shared files, notifications, jobs, webhooks,
providers, and platform audit.

PulseDesk is intentionally not a PHI system of record. The principal privacy
risk is a user or importer placing patient identifiers or clinical narrative
into otherwise operational free text.

## Threats and controls

| Threat | Control |
| --- | --- |
| Patient/clinical data entered in operational fields | No patient schema; explicit no-PHI acknowledgement; strict allowlisted bodies; prohibited-key and PHI-indicator checks; bounded sanitized plain text; warnings on every composing surface |
| PHI echoed in validation, logs, audit, notification, or importer output | Stable field/code errors only; no rejected value; structured metadata excludes message bodies; notifications use only ticket ID/event labels; importer reports source type/ID and reason code |
| Cross-tenant record or relationship access | Trusted session tenant on every query; foreign IDs revalidated; composite tenant constraints/indexes; foreign records return the same 404/validation class |
| Viewer/requester sees internal notes or files | Separate visibility records/object types; server response filtering; internal create/download/list requires service-agent access; UI hiding is not relied upon |
| Role escalation through assignment/config/bulk actions | Server module-access and tenant-admin/manager checks; assignees must be active same-tenant PulseDesk users; bulk actions are allowlisted and transactional |
| Duplicate reply or notification on retry | Required idempotency key, tenant/ticket uniqueness, one transaction for message/event/outbox/audit, shared outbox deduplication |
| Ticket state tampering or lost updates | Explicit transition graph, optimistic versions, row-count conflict detection, append-only event/SLA/activity history |
| Unsafe rich text or uploads | Plain text only for active content; HTML/control characters rejected or normalized; shared attachment size/MIME/signature/hash/scan/private-download controls |
| TechDeck authority bleed | PulseDesk stores operational equipment/service context only; it cannot store network topology, credentials, discovery state, or remote actions |
| Provider credential or callback compromise | No child connector credentials/routes are mounted; future email/SMS/webhook work must use shared providers, exact signatures, idempotency, retention, and readiness gates |
| Destructive loss or repudiation | Archive rather than hard delete; transaction-bound activity records; additive release; verified backup/restore procedure before authorized cutover |

## Residual risks

- Automated PHI detection is a guardrail, not a HIPAA compliance guarantee;
  policy, training, access review, retention, incident response, vendor BAAs,
  and legal review remain organizational requirements.
- Calendar-aware business hours/holidays and external provider delivery are
  not claimed until their schedulers/providers pass deployment acceptance.
- Existing standalone exports may contain sensitive free text. A human privacy
  review and a quarantined dry run are mandatory before any apply is designed.
