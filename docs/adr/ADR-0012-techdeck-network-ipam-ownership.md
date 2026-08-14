# ADR-0012: TechDeck owns documentation-grade network and IPAM records

Status: Accepted

## Context

TechDeck's recovered source at
`C:\Dev\Tech-Deck@8125f8d89d8d39d60a50c8061a26133a0c917792` models servers,
network devices, VLANs, subnets, addresses, DNS, DHCP, WAN circuits, public
addresses, lifecycle records, and relationships as tenant-scoped
configuration items. OperatorOS already owns tenants, users, entitlements,
and the shared Business Directory. Creating another client/site authority or
treating documented topology as discovered truth would split authority.

## Decision

TechDeck owns documentation-grade configuration and topology records for an
OperatorOS tenant. Client and site associations reference shared Directory
organization/site IDs. The canonical configuration model supports typed
assets, applications/services, vendors, licenses, certificates, warranties,
VLANs, subnets, addresses, gateways, DNS records, DHCP scopes, WAN circuits,
public addresses, and directed relationships.

IP and CIDR syntax is validated before persistence. VLAN numbers, address and
subnet relationships, site/client pairing, and relationship endpoints are
tenant-checked. These records are operator-maintained documentation unless a
future signed discovery adapter is separately approved; TechDeck must not
claim that a device was scanned, configured, or changed.

## Consequences

- TechDeck can present inventory, topology, lifecycle, and incomplete-record
  dashboards without duplicating Directory clients or sites.
- Generic technical metadata is bounded and rejects secret-shaped keys.
- Vendor-specific discovery, SNMP, RMM, DNS/DHCP mutation, and device
  configuration are excluded from this decision.
- Imported `clients`, `sites`, and generic standalone migrations remain
  evidence only and are never applied to OperatorOS.

## Migration and rollback

The Phase 5 release is additive. Existing `techdeck_assets` rows are retained
and receive the expanded documentation fields with safe defaults. Standalone
imports use source references and a dry-run reconciliation plan. Rollback is
restore-to-new-database and traffic switch; there is no destructive down
migration.
