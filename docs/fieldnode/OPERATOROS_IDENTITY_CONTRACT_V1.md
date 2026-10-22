# FieldNode / OperatorOS identity read contract 1

Status: source contract only. This endpoint does not activate FieldNode
management, create a workspace or device grant, replace FieldNode login/MFA,
or establish that a separately deployed FieldNode service can consume an
OperatorOS session. The FieldNode consumer, reviewed account/workspace linking,
authenticated transport and local step-up remain separate acceptance gates.
There is no FieldNode application license or subscription requirement.

## Authority and endpoint

`GET /v1/modules/fieldnode/identity` is served by the shared OperatorOS Fastify
API. The existing unified web proxy exposes it as the target host's same-origin
`GET /api/modules/fieldnode/identity`. The caller must have a valid, current
OperatorOS **module** session sealed to `fieldnode` and one tenant. A broad
platform session, another module session, a requested foreign tenant, an
inactive account/tenant, missing persisted membership or denied module access
cannot establish this identity.

The route retains the actual `authenticate`, `requireTenantMember` and
`requireTenantModuleAccess('fieldnode')` chain. It additionally re-reads the
persisted membership and tenant/user module policy using the sealed tenant and
user IDs. A platform administrator's inspection override alone cannot create
a FieldNode workspace identity or synthetic owner role. Persisted viewer
membership is always bounded to viewer. Module access is the narrower central
decision and explicit grant; an admin-derived module decision without an
explicit user grant is bounded to viewer. An explicit deny and disabled or
archived tenant module remain denied even for platform administrators.
The ceiling uses the actual later module decision's `admin_role` provenance
as well as cached tenant context, so a concurrent platform-role promotion
cannot turn an ungranted identity into manager.

The issuer is the fixed namespace `https://operatoros.net`, never an incoming
Host/forwarded header or email domain. A consumer must pin its expected
OperatorOS authority and environment; development fixtures cannot be accepted
as production identities merely because they use this namespace.

Successful JSON has exactly these version-1 fields:

```json
{
  "contractVersion": 1,
  "issuer": "https://operatoros.net",
  "subject": "opaque-operatoros-user-id",
  "tenantId": "opaque-operatoros-tenant-id",
  "module": "fieldnode",
  "membershipRole": "member",
  "moduleAccessLevel": "user",
  "sessionExpiresAt": "2030-01-01T12:00:00.000Z",
  "authenticationAssurance": "not_attested"
}
```

`membershipRole` is `owner | admin | member | viewer`, taken from the actual
persisted membership. `moduleAccessLevel` is `viewer | user | manager` and is
an upper bound, not a FieldNode device permission. `subject` is the immutable
OperatorOS user ID. No bearer, cookie, session token, email, global-admin flag,
device identifier or ownership assertion is returned. Unsupported persisted
roles or unrecognized grants fail closed.

The response is a current authority read, **not a signed portable credential**.
A FieldNode backend must not accept browser-submitted copies of this JSON as
authentication. A separately deployed consumer needs a reviewed authenticated
server/authority session transport which validates the real current session
against the pinned OperatorOS authority. This change does not introduce a new
client secret, token forwarding channel, parent-domain cookie or identity in
a URL. That transport remains unimplemented by this component.

## Existing SSO contract, unchanged

The existing shared-runtime protocol remains
[OperatorOS SSO contract v1](../auth/OPERATOROS_SSO_CONTRACT_V1.md):

1. Authenticated `POST /api/sso/issue` (also `/v1/sso/issue`) binds
   `moduleId: "fieldnode"`, `tenantId`, `clientId: "operatoros:fieldnode"`,
   exact `redirectUri: "https://fieldnode.operatoros.net/sso"`, validated
   relative `returnTo`, `state`, `nonce`, `codeChallenge` and
   `codeChallengeMethod: "S256"`.
2. Only the opaque, short-lived, single-use authorization code travels to the
   exact target-host `/sso` callback. No identity/access/session JWT is placed
   in the URL.
3. Target-host `POST /api/sso/browser-exchange` (also `/v1/sso/browser-exchange`)
   receives `{ "code": "opaque", "state": "transaction-state" }`. The
   existing host-only HttpOnly state, nonce and PKCE verifier cookies and
   registered host/client/environment must match. After revalidation and
   atomic consume, the server sets the host-only application session; it does
   not return the session token in JSON.

These existing unified-runtime routes are not proof that a separate FieldNode
deployment already implements the callback, same-origin proxy, authority
transport or local mapping. No DNS, deployment or security setting is changed.

## Mapping and local authorization requirements

The FieldNode owner must implement and review these rules before enabling the
joint journey:

- Enforce a unique mapping `(issuer, tenantId) -> FieldNode workspace`. Enforce
  a unique mapping `(issuer, subject) -> FieldNode user`. Tenant membership
  links must retain that same issuer and tenant. Never derive workspace keys
  from names, email domains, a requested tenant header or a global admin role.
- Linking an existing FieldNode workspace/user requires an explicit reviewed
  linking action and proof of the existing owner's authority. Never silently
  claim a workspace, merge users by email, auto-provision on a failed lookup,
  or reassign an existing mapping. Ambiguous or colliding mappings deny access
  pending review. This source component performs no mapping/provisioning write
  or schema migration.
- Local roles must narrow both persisted membership and bounded module access.
  A viewer identity remains read-only. A manager/owner identity is not evidence
  of hardware ownership. Every device read/action additionally requires the
  existing verified device pairing/ownership and local device grant for the
  mapped workspace. No central role can bypass device grants, local revocation
  or required step-up.
- Revalidate the session, account, tenant, persisted membership and module
  access through the real authority on every protected request. Do not cache
  this JSON as a new independent login or keep authorization beyond its
  `sessionExpiresAt`. A revoked/expired session, removed membership, explicit
  deny, failed authority request or unavailable mapping fails closed; no stale
  identity or offline-admin fallback may grant device operations. This is
  per-request authority, not a transaction-wide revocation guarantee.

OperatorOS presently has no durable authentication-method (`amr`) or
authentication-time claim. `authenticationAssurance: "not_attested"` must not
be interpreted as proof of central MFA, recent authentication or FieldNode
step-up. Existing FieldNode MFA and privileged-action step-up stay required
until a separately reviewed attestation contract exists.

## Failures, caching and operation

All identity route responses use `Cache-Control: no-store`, `Pragma: no-cache`
and `Referrer-Policy: no-referrer`. Existing guard denials retain their bounded
status/code. Typical failures are 401 for missing/invalid/revoked sessions,
403 for platform/wrong-module/foreign-tenant scope or denied access, and 404
`TENANT_NOT_FOUND` for missing persisted membership. A session expiring during
the identity lookup returns 401 `FIELDNODE_SESSION_INVALID`. Lookup/guard
outages return sanitized 503 `FIELDNODE_IDENTITY_UNAVAILABLE`; no SQL detail or
previous identity is returned. Consumers must deny on every non-200 response.

The endpoint adds only reads to existing tables; no release manifest, schema,
payment, credentials, device or entitlement mutation is introduced. Existing
central authentication may record browser-session bookkeeping. Rollback can
remove this route's registration while leaving consumer activation disabled;
there is no data migration to reverse.

## Verification and remaining acceptance

The focused test executes the complete real route through Fastify injection,
real JWT verification and extracted complete production authentication and
tenant guard bodies. Storage rows, browser-session bookkeeping and the central
entitlement storage decision are modeled. The actual production policy SELECT
builder is executed against a recording query builder to check FieldNode slug
and trusted tenant/user predicates; **no SQL is executed**. Negative controls
cover platform/wrong-module/foreign-tenant sessions, revocation, absent or
foreign persisted membership, membership-less platform administrators,
viewer/admin narrowing, explicit deny, inactive tenants/modules, expiry and
sanitized outage. Repeated requests verify changed revocation/membership/grant
state is read again rather than reusing a previous identity.

Independent review found a privilege-ceiling race in the first frozen endpoint:
tenant context could cache `viaPlatformRole: false` before a later central
entitlement read independently observed a platform-admin promotion. The original
route could return member/manager without an explicit grant. Two durable tests
now execute the real central resolver and wrapper with separately modeled row
snapshots, reproducing promotion during the third authentication and during the
later resolver read. Both expected-viewer assertions failed before the fix
(48 controls passed, two failed). The route now also caps from the later
decision's actual `admin_role` provenance. Actual central free-account user and
explicit manager-grant positive controls preserve normal access. No shared
tenant/auth policy or SDK wire field changed.

Local validation on the isolated source based at
`520cc585b7efe887b0da06132b2981c2e5e576cf` completed on 2026-10-20:

- The final selected seven-file native command passed **101/101**, with zero
  skips; this includes **50** new identity controls and **51** existing free-module,
  role/cookie and SSO contract/helper controls.
- Strict typing of the new test, root zero-warning lint and all four workspace
  type checks passed. `pnpm build:production` passed for API, runner and Next,
  including **39/39** generated pages. No service was started for these checks.
- Only existing installed dependency bytes were linked, with zero acquisition
  or install. The retained local graph contains `follow-redirects@1.16.0`
  while the source lock pins `1.16.1`; this endpoint does not use that library.
  Local build success is not proof of a fresh locked dependency installation.

The exact commands, sanitized child-environment flags, logs and frozen hashes
are retained in the task evidence under
`evidence/resume-oct20/operatoros-fieldnode-identity`. Two initial evidence-only
wrapper attempts resolved the cached pnpm path under sandbox-local app data
and failed before pnpm ran; their logs remain preserved. The corrected wrapper
uses the verified existing absolute pnpm path; no package acquisition occurred.
Two subsequent sandbox builds of the corrected endpoint hit `EPERM` creating
generated Next directories (including after retaining the old cache). Their
failure logs remain preserved. The final identical-source production build
completed successfully at 2026-10-20T21:17:42Z with the same sterile child
environment outside the sandbox; no ACL/security setting, source dependency,
database or service was changed to obtain that result.

SQL-backed guard/route acceptance, deployment, authenticated
browser exchange across the real hosts, the separate FieldNode consumer and
unique mapping/linking, local step-up/device grants, revocation/outage tests
across both services and a reviewed hosting/DNS configuration remain unverified
here. Existing FieldNode standalone acceptance is historical evidence for that
separate application, not proof of this new joint identity journey.
