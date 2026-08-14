# Business Directory migration map

Status: Phase 2 mapping authority, 2026-07-17.

This map separates OperatorOS tenant authority from tenant-owned external
organizations. Source identity, membership, session, entitlement, billing, and
provider-secret records are excluded from directory migration.

| Source | Source meaning | Shared target | Module extension or retained workflow data | Duplicate/migration risk |
| --- | --- | --- | --- | --- |
| Active `tradeflowkit_customers` | Customer identity embedded in the current revenue slice | `directory_organizations`; primary contact/address become shared contact/address associations | `tradeflowkit_customer_profiles`; jobs, quotes, invoices, payment references remain TradeFlowKit data | Names are not currently unique and address is free text. Import must retain old customer ID, normalize cautiously, and require review for same-name customers. |
| Imported TradeFlowKit `customers` | Customer with phone, email, address, notes, SMS opt-out and portal token | Organization, contact, and address | SMS consent/opt-out and customer commercial settings belong in the TradeFlowKit profile; portal tokens are never imported as authority | Email/address may be blank; portal tokens and standalone Stripe IDs must be excluded. |
| Imported TradeFlowKit `orgs` and memberships | Standalone subscriber/account and local user authority | OperatorOS tenant/user mapping only, never a directory organization by default | None | Conflating this row with a customer would merge authority and business data. |
| Imported TechDeck `clients` | Managed customer/client | `directory_organizations` plus contact | `techdeck_managed_client_profiles` for service tier, account code, and MSP notes | `company` duplicates `name`; no version/archive fields. Match within mapped tenant only. |
| Imported TechDeck `sites` | Customer location | `directory_sites` plus `directory_addresses` | Site-specific asset/network data remains TechDeck-owned | Address is free text and client can be null. Orphan sites require explicit organization assignment or a documented standalone-site decision. |
| Active/imported TechDeck assets | Managed endpoint/network inventory | References shared organization/site after module migration | Asset identity, hostname, IP, OS, health, serial, evidence, and runbook context remain TechDeck-owned | Current active assets have no client/site reference; backfill must not guess. |
| Imported PulseDesk `orgs` | Standalone healthcare subscriber/facility authority | OperatorOS tenant mapping; create a directory facility only when source semantics prove it is an external service client | `pulsedesk_service_client_profiles` for facility category and PHI boundary | The same row currently owns auth/billing. Authority fields, password data, Entra secrets, and Stripe IDs are excluded. |
| Active/imported PulseDesk departments | Internal operational department | Retained PulseDesk workflow entity; optional future association to a shared site | Department routing and SLA behavior remain PulseDesk-owned | Department contact fields may become shared contacts only through explicit reviewed mapping. |
| Imported PulseDesk vendors | External service provider | `directory_organizations` type `vendor` plus shared contacts | Contract/service coordination notes remain PulseDesk profile/workflow data | Emergency contact and contract notes may be sensitive; do not place them in generic organization fields. |
| Imported PulseDesk ticket/facility locations | Operational location labels | Shared site/address only when a stable facility/site exists | Room/floor and patient-impact workflow data remain PulseDesk-owned | Free-text locations are not safe automatic site identities. |

## Required import behavior

1. Resolve the OperatorOS tenant through an approved tenant mapping; never
   accept an arbitrary source/browser tenant ID.
2. Dry-run normalization and duplicate candidates before inserts.
3. Preserve `(source_system, source_table, source_id)` in an importer mapping
   ledger created in the later migration phase; do not overload directory IDs.
4. Insert shared organization/contact/site/address records before module
   profiles and workflow foreign keys.
5. Reconcile source counts, mappings, skipped rows, ambiguous matches, archived
   rows, and orphan relationships.
6. Exclude passwords, sessions, tokens, local roles, standalone entitlements,
   subscription authority, provider secrets, and local Stripe customer IDs.
7. Prevent dual writes during cutover. Until a module's product phase completes
   migration, its legacy table is read-only migration input rather than an
   automatically synchronized second authority.
