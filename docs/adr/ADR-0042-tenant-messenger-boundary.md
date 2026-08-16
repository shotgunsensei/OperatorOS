# ADR-0042 — Tenant messenger ownership and realtime boundary

- Status: Accepted for Phase 53 source/local release candidate
- Date: 2026-08-16

## Context

OperatorOS users need durable internal communication that remains available as
they move between the launcher, Platform Command, and consolidated modules.
Implementing a login, tenant directory, or message store inside each module
would duplicate parent authority and create cross-tenant exposure risk.
Process-local WebSocket state alone would also stop being instant when two
users are connected to different Autoscale API instances.

## Decision

OperatorOS owns one shared tenant messenger. Every authenticated user with a
current, active membership in an active tenant may use it; it is an
organization-wide platform capability rather than a module entitlement. The
server derives actor and tenant authority from the validated OperatorOS
session. `X-Tenant-Id` remains a requested tenant selection that is
revalidated. A module session may use the messenger only for the tenant sealed
into that session. No request body may select a tenant or impersonate a user.
Platform super-administrator status does not grant silent access to a tenant's
private messages without an actual tenant membership.

The initial complete product slice provides:

- durable one-to-one and named group conversations for up to 20 active tenant
  members;
- persisted, paginated message history, replies, per-user unread state,
  sender-only versioned editing and soft deletion, group-owner renaming,
  per-user mute, and per-user removal from conversation history;
- tenant-member directory search plus online/offline and last-seen state;
- one title-bar surface on the authenticated console, every consolidated
  module shell/deep link, and Platform Command, with responsive full-screen
  mobile behavior;
- in-app unread badges and alert toasts by default, plus browser notifications
  only after an explicit user permission action; and
- authenticated WebSockets with reconnect/poll recovery. PostgreSQL
  `LISTEN`/`NOTIFY` fans compact identifiers between API instances. Receiving
  instances reload messages and active participant targets through
  tenant-scoped queries; message bodies never enter the notification channel.

Presence is a durable aggregate over per-connection leases. A 25-second
heartbeat extends a 70-second lease, so closing one browser tab does not mark a
user offline while another tab or instance remains connected. The heartbeat
also revalidates tenant membership and closes a socket after membership ends.
Actual message recipients are joined to current `tenant_users` membership at
delivery time.

## Consequences

- The messenger follows the authenticated user without a second login or a
  module-local identity, tenant, role, entitlement, or billing system.
- Direct conversations deduplicate inside a tenant. Sends use a client message
  key, a per-user rate limit, and a transaction so retries do not duplicate
  history.
- Removing a conversation hides only the caller's copy. It does not destroy
  other members' history. Deleting a message is sender-only, clears its body,
  preserves the timeline marker, and records a body-free audit event.
- Delivery remains durable when a socket or database notification is missed;
  reconnect and bounded polling converge from PostgreSQL.
- This phase does not claim public channels, external guests, federation,
  voice/video, file transfer, global retention administration, e-discovery, or
  legal-hold policy. Those require separate product, privacy, storage, and
  compliance decisions.

## Data and security impact

Release v53 adds conversations, participants, messages, presence aggregates,
presence connections, and audit events. Composite tenant/conversation foreign
keys prevent participants, messages, replies, and events from crossing a
conversation boundary. History and directory reads require current tenant
membership and return `private, no-store`. User deletion can retain
display-name snapshots for remaining history while removing the live user
reference. Audit metadata records action type, actor, correlation, version,
and bounded facts, never the message body.

WebSocket frames are authenticated at upgrade, size- and rate-bounded, and
accept only the heartbeat control message. Existing exact-host production
Origin checks and host-only secure session cookies remain authoritative.

## Migration and rollback

The migration is the final additive operation in release v53. Production must
take and verify a backup before the supported root `db:apply`. Application
rollback may return traffic to the previous artifact while retaining the
additive tables. Destructive table removal is not a supported rollback.
Database rollback means restore into a new database, validate it, and switch
traffic according to `docs/DATABASE_BACKUP_RESTORE.md`.

## Rejected alternatives

- Module-local messengers: rejected because they duplicate identity, tenant,
  session, and message authority and cannot follow users across the platform.
- Client-supplied tenant or sender identifiers: rejected because private
  communication must use trusted server session authority.
- Platform-admin eavesdropping: rejected because operational authority is not
  implicit membership in a tenant's private conversation.
- In-memory-only history or presence: rejected because it fails restart,
  multi-tab, and multi-instance durability.
- Message bodies in PostgreSQL notifications: rejected because fan-out needs
  only identifiers and recipients must be revalidated at the receiving
  instance.

