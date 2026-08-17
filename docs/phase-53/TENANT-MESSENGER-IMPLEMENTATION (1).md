# Phase 53 tenant messenger implementation and acceptance

Date: 2026-08-16  
Branch: `codex/tenant-messenger`  
Disposition: source/local release candidate; production deployment pending

## Delivered behavior

The authenticated title bar now carries one shared organization messenger
through the OperatorOS console, all consolidated module routes, and Platform
Command. Changing the active tenant clears the client state before loading the
new tenant. Logged-out pages do not mount the control.

Users can search active members in the selected tenant, start deduplicated
direct conversations or groups, see online/offline state, send and page through
saved history, reply, edit or delete their own messages, mark conversations
read, mute conversations, rename groups they own, and remove a conversation
from their personal history. New activity produces a title-bar unread badge
and in-app alert. Desktop notifications are opt-in and are never requested on
page load.

The mobile panel fills the viewport and retains conversation navigation,
composition, and accessible labels. Loading, empty, disconnected/reconnecting,
validation, error, destructive-confirmation, and deleted-message states are
explicit.

## Authority and privacy

- The API accepts only an authenticated platform or tenant-bound module
  session and resolves the current tenant server-side.
- Current membership in the active tenant is mandatory even for a platform
  super administrator. Foreign members and conversations return non-enumerating
  failures.
- The member directory, conversation rows, message rows, unread markers,
  presence, delivery targets, and audit records are tenant-scoped.
- Delivery targets are joined to current `tenant_users` membership. A socket
  heartbeat revalidates membership and closes a stale connection when that
  membership ends.
- Responses are `private, no-store`; message contents are not written to audit
  metadata or PostgreSQL notification payloads.
- User-controlled message deletion nulls the body but retains a timeline
  marker. Removing a conversation is per-user and does not destroy another
  participant's history.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/messenger/members` | Search current active-tenant members and presence |
| `GET` | `/v1/messenger/conversations` | List visible conversations and unread totals |
| `POST` | `/v1/messenger/conversations` | Create/reuse a direct conversation or create a group |
| `GET` | `/v1/messenger/conversations/:conversationId` | Load one authorized conversation |
| `GET` | `/v1/messenger/conversations/:conversationId/messages` | Page durable message history |
| `POST` | `/v1/messenger/conversations/:conversationId/messages` | Send an idempotent message or reply |
| `POST` | `/v1/messenger/conversations/:conversationId/read` | Advance the caller's read marker |
| `PATCH` | `/v1/messenger/conversations/:conversationId/messages/:messageId` | Versioned sender-only edit |
| `DELETE` | `/v1/messenger/conversations/:conversationId/messages/:messageId` | Versioned sender-only soft deletion |
| `PATCH` | `/v1/messenger/conversations/:conversationId` | Mute/unmute or owner-rename a group |
| `DELETE` | `/v1/messenger/conversations/:conversationId` | Hide the caller's conversation copy |
| `WS` | `/v1/tenants/:tenantId/messenger/socket` | Presence, message, and conversation events |

The web proxy exposes the REST surface below `/api/messenger/*` and the socket
below `/ws/v1/tenants/:tenantId/messenger/socket` without placing credentials
or tokens in a URL.

## Persistence and realtime design

Release v53 appends `tenant_messenger_tables` and owns six tables:

1. `tenant_messenger_conversations`
2. `tenant_messenger_participants`
3. `tenant_messenger_messages`
4. `tenant_messenger_presence`
5. `tenant_messenger_presence_connections`
6. `tenant_messenger_events`

Composite tenant/conversation keys enforce row relationships in PostgreSQL.
Message sends are transactional, bounded at 60 messages per user per minute,
and uniquely keyed by `(tenant_id, sender_user_id, client_message_id)`.
The original request hash is retained so replaying an ID with changed content
still fails after a message is edited or deleted. Optimistic versions protect
edits, deletions, and group renames.

Each API process keeps only its connected WebSocket handles in memory.
PostgreSQL `LISTEN`/`NOTIFY` distributes metadata-only event envelopes between
instances; the receiver reloads the saved message and active participants from
the database before delivering locally. A 12-second conversation poll and
30-second member poll are recovery paths, not the primary delivery mechanism.

## Release and rollback procedure

No new environment variable is introduced. The existing production database,
session, exact-host, proxy, and release-mode variables remain mandatory.

1. Select the reviewed application commit and run `corepack pnpm db:plan`.
2. Capture and verify the production provider snapshot and logical backup.
3. Run the core production preflight and production build.
4. Set `OPERATOROS_DATABASE_RELEASE_MODE=apply` through the approved secret
   environment and start only through `scripts/start-unified-runtime.mjs`.
5. Confirm `/readyz`, authenticate two real test users in the same tenant, and
   repeat the desktop and mobile messenger gate on the deployed exact host.
6. Confirm a user in another tenant cannot enumerate members, conversations,
   messages, or sockets. Confirm removing a membership stops new delivery.
7. If a gate fails, return traffic to the prior application artifact while
   retaining the additive tables. For database rollback, restore into a new
   database, validate it, and switch traffic. Do not drop v53 tables in place.

## Local acceptance evidence

| Gate | Current result |
| --- | --- |
| Focused API, database contract, cross-instance fan-out, and static UI contracts | PASS — 16/16 |
| Release plan | PASS — v53, 53 ordered steps, final `tenant_messenger_tables`, additive |
| Fresh empty-database release apply/reapply | PASS — 53/53 in 19,343 ms, then 53/53 in 1,716 ms |
| Workspace typecheck | PASS — API, runner-gateway, web, and TorqueShed native |
| Production build | PASS — FaultlineLab 4/4, typecheck, API, runner-gateway, SDK, and Next production build |
| Two-user production-build browser workflow and mobile viewport | PASS — 2/2 in 17.7 seconds |
| Complete API aggregate | Exercised — 1,156 pass, 19 fail, 6 intentional HTTP skips; all Phase 53 cases pass; one release fixture was fixed and 18 unrelated historical failures remain |
| Core production preflight in the unconfigured developer shell | Expected FAIL — required production environment is absent |
| Target deployment, production backup/apply, authenticated deployed E2E | NOT RUN — human-controlled gates |

This evidence does not promote any module to consolidation state 5 and does
not prove deployment, provider acceptance, production migration, monitoring,
or rollback.
