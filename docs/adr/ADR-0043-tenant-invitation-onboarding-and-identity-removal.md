# ADR-0043 — Tenant invitation onboarding and identity removal

- Status: Accepted for release v54 source/local candidate
- Date: 2026-08-18

## Context

Tenant invitations previously crossed from the invitation landing page to a
different authentication host while relying on origin-scoped
`sessionStorage`. The destination host could not read that state. Recipients
saw repeated navigation, created an ordinary personal account, and remained
unassociated with the inviting tenant while the invitation stayed pending.
Invitation acceptance also wrote membership and invitation state in separate
operations, and a successful browser retry returned a false conflict.

Platform hard-delete treated ordinary owned records such as members, free
module assignments, workspaces, and the personal tenant created for every
account as blockers. User deletion could not retain historical audit records
because `admin_audit_logs.admin_id` required the live user row.

## Decision

OperatorOS retains sole authority for accounts, sessions, tenants,
memberships, and audit. The invitation landing page performs both account
creation and existing-account sign-in on its own exact platform host. New-user
invitation registration derives the email from the opaque invitation token,
creates the account directly in the inviting tenant without an extra personal
tenant, accepts the invitation, selects the inviting tenant, and issues the
host-only platform session in one database transaction. Existing users sign
in on the same page and accept the same token. Acceptance is serialized and
idempotent for the invited account. Generic self-registration retains the
existing personal tenant and free-account behavior.

Generic registration and subsequent platform authentication may recover a
missed invitation only when all of these conditions hold:

- an active, unexpired, still-pending invitation exists for the exact
  normalized account email;
- the invitation is not for the owner role;
- the active tenant owner's email has the exact same domain;
- the domain is not a public mailbox provider; and
- membership is still created through the server-owned invitation record.

This is not suffix-based tenant discovery or a domain-wide auto-join policy.
Without an exact administrator-authored invitation, no membership is created.
Owner-role invitations continue to require the opaque link.

Confirmed tenant hard-delete treats members, invitations, module assignments,
entitlements, and tenant-owned product rows as cascade-owned data. Active or
trialing OperatorOS subscriptions or add-ons remain a fail-closed billing
guard. User hard-delete removes owned personal tenants and user-owned product,
workspace, session, membership, and authentication rows. An owned company
tenant must be transferred or explicitly deleted first, and active user
billing must be cancelled and reconciled first. Self-deletion and removal of
the final platform super administrator remain prohibited.

## Consequences

- Invitation links no longer depend on cross-origin browser storage or a
  second login immediately after password creation.
- Direct company-invite registration does not leave an unnecessary personal
  tenant for an administrator to clean up.
- A user retry cannot turn a completed tenant join into an error or duplicate
  membership.
- A coworker who used generic registration can recover the exact pending
  business invitation during registration, login, or a platform-session
  identity refresh.
- Personal tenants, free module rows, and ordinary workspace/project data no
  longer make administrative deletion impossible.
- Deletion remains deliberate and recoverable only from backup. Billing and
  company ownership are explicit prerequisites, not opaque dependency errors.

## Data and security impact

Release v54 adds `admin_audit_logs.actor_email_snapshot`, backfills it from the
current user table, makes `admin_id` nullable, and changes its foreign key to
`ON DELETE SET NULL`. Historical audit rows therefore survive a privacy purge
without retaining a live identity reference. New audit writes snapshot the
actor email at event time.

Invitation tokens remain high-entropy, opaque URL capabilities. The client
does not store them in local storage, place credentials in a URL, mint a
module-local session, or accept client-selected tenant authority. Passwords
are hashed by the existing OperatorOS credential path. Platform sessions stay
host-only, `Secure`, `HttpOnly`, and `SameSite=Lax`. Domain matching alone is
never sufficient for membership.

All cascade operations and their audit snapshots run in a single database
transaction. Tenant deletion uses the same complete product-data cascade when
invoked directly or through deletion of an owned personal tenant.

## Migration and rollback

Release v54 is additive with respect to retained audit data. Production must
take and verify a backup before the supported root `db:apply`. The application
can roll back while retaining the nullable audit actor and snapshot column.
Destructive identity or tenant deletions cannot be reversed by an application
rollback; recovery requires a validated database restore under
`docs/DATABASE_BACKUP_RESTORE.md`.

## Rejected alternatives

- Cross-origin `sessionStorage` relay: rejected because browser storage is
  origin-scoped and lost at the authentication-host transition.
- Query-string credentials or browser bearer storage: rejected by the shared
  SSO and session contract.
- Domain suffix alone as tenant authority: rejected because an email suffix is
  not proof of an administrator grant or domain ownership.
- Keeping ordinary dependents as permanent blockers: rejected because they
  are owned lifecycle data and can be removed atomically.
- Deleting audit history to make user deletion succeed: rejected because
  privileged lifecycle evidence must remain durable.
