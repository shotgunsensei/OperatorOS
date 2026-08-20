# ADR-0044 — Tenant invitation consent and default workspace

- Status: Accepted for release v55 source/local candidate
- Date: 2026-08-20
- Supersedes: ADR-0043 invitation auto-recovery and direct-to-company registration decisions

## Context

ADR-0043 moved invitation authentication onto one exact OperatorOS platform
host, but the invitation page mounted the shared authentication provider while
the provider still treated every anonymous `/app/*` identity check as an
invalid protected session. A fresh browser therefore received the expected
`401` from `/api/auth/me`, navigated through local logout, returned to the same
invite URL, and repeated without rendering the invitation form.

ADR-0043 also made invitation-specific registration create the account
directly inside the inviting company tenant and allowed exact pending
same-business-domain invitations to be accepted during generic registration,
login, or `/auth/me`. Those paths made an administrator-authored invitation a
valid capability, but they did not preserve a separate recipient decision.
Account creation or authentication could therefore join and select a company
tenant before the person chose to accept.

OperatorOS already models every ordinary account with a server-owned personal
tenant. That row is the account's default single-owner workspace; it is still
a real tenant security boundary, not a second identity or an unscoped personal
data mode.

## Decision

OperatorOS retains sole authority for invitation creation, identity, sessions,
tenants, membership, roles, active-tenant selection, and audit. The supported
journey is now:

1. A tenant owner or administrator creates an invitation for an exact email
   and bounded role. The server persists the inviting tenant, inviter, opaque
   192-bit token, expiry, and role, then sends a review link to the canonical
   OperatorOS invitation page.
2. `/app/invites/:token` is an explicit public inline-authentication surface.
   Its first `/api/auth/me` request may return `401`; that response must not
   restart central SSO or navigate away from the invitation.
3. A new recipient creates a normal OperatorOS account. In one transaction the
   server derives the email from the opaque invitation, creates the user,
   creates/ensures the user's default personal tenant and owner membership,
   seeds the normal free-account apps, and issues a host-only platform
   session. The inviting tenant receives no membership at this step.
4. An existing recipient signs in on the same invitation page. Login does not
   inspect, accept, or select any pending invitation.
5. After either authentication path, the exact invited account sees an
   explicit choice. **Join organization** atomically creates or reuses the
   invited membership, marks the invitation accepted, selects the inviting
   tenant, and records audit evidence. A same-user retry is idempotent.
6. **Decline invitation** atomically records `declined_at` and audit evidence.
   It creates no membership and does not change the user's active tenant. A
   same-user retry is idempotent. A declined invitation cannot later be
   accepted; an administrator must issue a new invitation.
7. Generic registration, login, session refresh, and `/auth/me` never
   auto-accept invitations. Domain matching is no longer an onboarding grant,
   even when an exact invitation exists.

The internal tenant type remains `personal` for the default single-owner
workspace so existing billing, lifecycle, entitlement, and ownership rules
remain stable. Product copy calls it the user's current or default workspace.

## Consequences

- A first-time email recipient can create an account and review the invitation
  without a redirect loop or a second sign-in.
- New and existing users keep their current workspace until they deliberately
  join the inviting organization.
- Declining is a durable, visible decision rather than a silent ignore or row
  deletion.
- Tenant administrators see only still-pending invitations in the active
  invitation list; accepted and declined records remain available for audit
  and lifecycle enforcement.
- Invitation emails use **Review invitation** language and explain that the
  existing workspace is unchanged unless the recipient joins.
- Existing release-v54 accounts that lack a personal tenant are repaired by
  the existing idempotent personal-tenant backfill before the v55 consent
  step. That backfill does not overwrite an existing active-tenant choice.

## Data and security impact

Release v55 adds nullable `tenant_invites.declined_at`, a constraint preventing
one invitation from being both accepted and declined, and a partial pending
index. No existing invitation is reclassified.

Acceptance and decline require an authenticated platform session whose
normalized email exactly matches the invitation email. Both operations lock
the invitation transactionally. Only acceptance writes `tenant_users` or
`users.current_tenant_id`. The browser never stores the invitation capability
in local storage, sends credentials in a URL, trusts a client-selected tenant,
or mints a module-local identity. Invitation tokens remain opaque URL
capabilities and are not written to logs or audit details.

The public peek response still exposes only invitation display context to the
holder of the high-entropy token and never returns the tenant ID. Wrong-account,
expired, unavailable-tenant, accepted, and declined states fail with bounded
errors. Existing host-only `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`
session rules remain unchanged.

## Migration and rollback

Release v55 is additive and uses the supported ordered database-release path.
Production requires a verified backup before `db:apply`, then reconciliation
of pending/accepted/declined invitation counts and deployed browser acceptance.

The added column, constraint, and index may remain during an application
rollback. However, a v54 application ignores `declined_at` and could accept a
previously declined invitation. Traffic must therefore not roll back to an
unpatched v54 invitation handler. The safe rollback choices are to keep the
v55 invitation guards, disable invitation accept/decline traffic, or restore
the pre-v55 database into a new database and switch traffic under the backup
and restore procedure.

## Superseded and retained decisions

This ADR supersedes ADR-0043 only where that record:

- skipped the default personal tenant for direct invitation registration;
- accepted exact pending invitations during generic registration, login, or
  `/auth/me`; or
- treated invitation-specific account creation and company membership as one
  automatic transaction.

ADR-0043 remains authoritative for exact-host authentication, opaque invite
tokens, transactional membership acceptance, idempotent same-user acceptance,
identity/tenant deletion safeguards, and retained audit history.

## Rejected alternatives

- Automatic same-domain recovery: rejected because an administrator-authored
  invite is authority to offer access, not proof of recipient consent.
- Create the account directly in the company tenant: rejected because account
  creation and organization membership are distinct user decisions.
- Delete a declined invitation: rejected because it loses the decision state,
  complicates support, and makes retries ambiguous.
- Encode accept/decline in email query parameters: rejected because the action
  must follow authenticated exact-email verification and a deliberate browser
  choice.
- Weaken CSP to run browser tests against `next dev`: rejected; verification
  uses the optimized production build instead.
