# FieldNode: free application and public hardware introduction

Status: source candidate; deployment and database activation are unapproved.
Base: `677bdb6fe620b359e4119163e360a6a24bda7f24`.

FieldNode joins TorqueShed, FaultlineLab and Operator Pool Hall in the existing
free-account policy. It is included for free and paid accounts, excluded from
paid companion selection, and has no application license or subscription price.
OfficeExit and VendorTrust365 retain their separate one-time purchase direction;
this branch does not change their separate draft implementation.

## Customer flow and implemented boundary

| Surface | Behavior | Authority / limitation |
| --- | --- | --- |
| `fieldnode.operatoros.net/` | Public shared hardware introduction | Intended domain only; not claimed live |
| `operatoros.net/fieldnode` | Same introduction and hardware-purchase section | No account, tenant grant or device proof required to read marketing |
| Get a FieldNode | OperatorOS hardware-information/purchase entry | No invented price or live checkout |
| Manage my FieldNodes | Exact-host `/manage`, local `/modules/fieldnode/manage` | Existing central sign-in and active-tenant module grant |
| Management entry | Explicitly unavailable pending verified device pairing | No inventory, remote operation, ownership inference or fake success |

The catalog, shared product copy, source registry mirrors, exact SSO client and
free-account grant list agree on `fieldnode`. Existing signup/personal-tenant
transactions and approved backfill operations consume that list. Free access
does not bypass tenant membership, explicit user denial, tenant-admin disable or
the global module kill switch. The registry's historical `requiresSubscription`
field still means a server-confirmed module grant; free grants do not require a
paid subscription. Management never redirects owners into paid TechDeck.

The public middleware exception is limited to the introduction root. An exact-host
relative Next beforeFiles rewrite serves the canonical root inside one request;
the middleware passes that root through rather than proxying an absolute URL back
through the private gate. A built-server browser probe exposed and motivated this
routing correction; a direct middleware response alone did not verify rendering.
Management,
unknown deep paths and SSO callbacks retain existing exact-host rules. Public
management links disable prefetch so reading the introduction does not start a
background sign-in transaction. Private module metadata stays noindex.

## Purchase configuration

No verified hardware purchase destination was found in the examined OperatorOS
source. `FIELDNODE_HARDWARE_PURCHASE_URL` is optional and blank by default. An
owner may configure it only after verifying the actual public hardware purchase
page on `https://operatoros.net`. The source validator rejects foreign origins,
credentials, query/fragment values, ambiguous encoded paths and auth/API/private
routes. Configuration validation does not prove that a checkout exists or works.
Without it, the public page states that online hardware ordering is unavailable.
No Stripe product, price, credential, application license or subscription is made.

## Ownership and pairing prerequisite

No approved FieldNode device ownership/pairing backend exists in the examined
OperatorOS base. TechDeck inventory is operator-entered documentation; its public
software-license fingerprint endpoint does not prove hardware ownership. Neither
is reused. The management entry exposes no device data or controls until a
separately reviewed service can establish immutable device identity, verified
pairing, active-organization ownership and per-request authorization/revocation.
Any required persistence design needs separate database approval. The separately
owned FieldNode appliance repository is untouched. Local appliance access,
remote agent execution and updater operation are not established by this page.

## Hosting and activation gates

John intends to create `fieldnode.operatoros.net`. The recommended hosting for
this OperatorOS candidate is the existing OperatorOS Replit deployment and public
Next port: its public introduction and central-account management entry use the
existing OperatorOS session and tenant grant. This is a proposal requiring an
explicit hosting decision, not an attachment that has happened.

The separately owned FieldNode PR17 (`df44b977`) also provides a public introduction
and a `/manage` portal using its existing workspace/device authentication. It does
not implement OperatorOS SSO. Select one host/routing owner before attaching the
domain; do not attach both applications to the same root or assume their sessions
and device ownership are interchangeable. This candidate does not connect that
portal, pair devices or replace the appliance authentication boundary. A future
management handoff requires a reviewed ownership and tenant integration contract.
The separate portal and updater are not prerequisites for the free core launch.

The selected provider must supply the exact DNS type, target and verification
record. John adds those values, then the owner verifies TLS and proxy host/protocol
forwarding. For the OperatorOS choice also verify `/healthz` and `/readyz`. No DNS,
hosting or live authentication configuration was changed. No record is guessed.

Proposed source registrations are exact HTTPS origins: callback
`https://fieldnode.operatoros.net/sso`, logout `/logout`, and allowed origin
`https://fieldnode.operatoros.net`. Existing host-only secure cookies, PKCE,
one-time codes, tenant binding and return-URL rules remain unchanged. Preview and
loopback links use the existing nonproduction origins; production links never
inherit an internal port or unrecognized host. No live auth setting was changed.

Schema and ordered release contract remain **67/67** with no new table, DDL,
release step or imported appliance migration. Existing production startup is
verify-only: deployment alone does not insert FieldNode's module or free grants.
Catalog/grant data activation requires a reviewed plan, exact database identity,
recoverable backup and separate approval before any apply/backfill. No database
command or database change was performed in this source task.

## Verification and rollout

Recorded checks include22 new regressions in selected suites147pass/0fail with
six existing optional HTTP skips, strict checking of13 changed test files, full
four-workspace typecheck, zero-warning lint, full52/52 unit tests and a production
build on the initial candidate. The review added a return-path regression and
corrected pricing copy; final checks must name the amended commit. SQL cases were
not run. Exact
production-build, browser and independent-review outcomes must be recorded in
the PR verification evidence; none is inferred from these source checks. A rendered
introduction does not establish a working checkout, paired fleet, provider path
or deployed customer journey. Existing pinned visual baselines cover the prior
13 modules; no FieldNode baseline or hardware acceptance is fabricated.

For rollback, retain the currently deployed compatible commit/build and source
artifact. Before approved promotion, capture its configuration and recovery
point. On routing/rendering failure, return traffic to that known compatible
artifact and verify identity, readiness and the ordinary free-user core flow.
Removing this source is not a database rollback: any future approved catalog/
grant activation must preserve data and have its own reviewed reversal plan.
No merge, production deploy, billing change, network change or device action is
authorized by this document.
