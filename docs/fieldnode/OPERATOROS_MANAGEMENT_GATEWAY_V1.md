# FieldNode management gateway: frozen PR19 transport

This source continuation maps the separately owned FieldNode consumer at commit
`1ea2ea7976d0e02921ce7bb7b4a3472a47da3fbd` (tree
`224139a990e80a9bc6762c40f5d94beb0ee1f0f6`) into the central `/manage` mount.
The supplied gateway contract SHA-256 is
`2bf272425002d3d5d8f9e7d96e464d0ff367a43fb350598948a38bd0c6d822b7`.
It replaces the earlier two-ceremony source profile; that reviewed profile and
its failed malformed-role probes remain preserved in Git and task evidence.

OperatorOS retains public `/`, `/sso`, browser code exchange, central sessions,
transaction cookies and `/logout`. FieldNode retains unique tenant/workspace
and subject/user mappings, local MFA, proof-based owner linking and explicit
device grants. Central identity remains `authenticationAssurance: not_attested`.
No device ownership or operational deployment follows from loading this UI.
The SDK contract, identity endpoint, database release 67 and billing are unchanged.

## Closed route inventory

The pure classifier in `packages/modules/fieldnode-management-paths.ts` checks
methods and the original encoded URI before a request can select a fixed
upstream path. Fastify's shared mount dispatch is closed by that classifier;
it is not a general-purpose URL proxy. Next's exact-host rewrites point only
to this central gateway, never directly to the private consumer.

| Public family | Upstream | Methods |
| --- | --- | --- |
| `/manage`, `/manage/` | `/manage` | GET, HEAD |
| `/manage/assets/index-B5aEKOjw.css`, `/manage/assets/index-BWuDwhpj.js` | same without `/manage` | GET, HEAD |
| `/manage/nodes/{uuid}/console` | same without `/manage` | GET |
| `/manage/api/auth/operatoros/status`, `/mfa/status` | `/portal/auth/operatoros/...` | GET |
| `/manage/api/auth/operatoros/signup`, `/setup/confirm`, `/link`, `/consume`, `/mfa/verify`, `/mfa/recovery` | `/portal/auth/operatoros/...` | POST |
| `/manage/api/auth/me`, `/manage/api/auth/logout` | `/portal/auth/me`, `/portal/auth/logout` | GET me, POST logout |
| `/manage/api/nodes`, `/manage/api/nodes/{uuid}` | `/portal/nodes`, `/portal/nodes/{uuid}` | GET/POST list, DELETE node |
| `/manage/api/nodes/{uuid}/enrollment`, `/revoke`, `/access` | `/portal/nodes/{uuid}/...` | POST enrollment/revoke, GET/PUT access |
| `/manage/api/users`, `/manage/api/users/{uuid}`, `/manage/api/audit` | `/portal/users`, `/portal/users/{uuid}`, `/portal/audit` | GET users/audit, PATCH user |
| `/manage/nodes/{uuid}/api/v1/{allowed-path}` | same without `/manage` | GET, POST, PUT, PATCH, DELETE |
| `/manage/nodes/{uuid}/api/v1/serial/connect` | same without `/manage` | WebSocket only |

UUIDs have a canonical dashed shape. Only the two frozen hashed assets are
registered. Console paths mirror the supplied `fieldnode.portal_link.allowed_path`:
ASCII `/api/v1/...` up to 2048 characters, no encoding, backslash, `..`, `//`,
portal delegation, auth bootstrap/login/logout or auth MFA path. Queries use the
same bounded grammar; portal JSON endpoints accept no query. Standalone login,
password/bootstrap, device enrollment/agent and arbitrary UI/assets/WS paths are
not proxied. The central public introduction stays public. Anonymous management
HTML retains the existing exact-host PKCE redirect; JSON errors never start an
SSO redirect. Local module fallback routes use the same central gateway.

## Explicit authority, browser requests and cookies

`FIELDNODE_OPERATOROS_AUTHORITY_ORIGIN` and
`FIELDNODE_MANAGEMENT_UPSTREAM_ORIGIN` are required server-configured TLS origins,
without credentials, path/query/fragment, encoded hosts, whitespace or port zero.
They must differ; there is no production default. Missing configuration is an
explicit 503. This source changes no environment, DNS, ingress or security setting.

Before every upstream operation the gateway reads fixed
`GET /v1/modules/fieldnode/identity` from that authority, forwarding only exactly
one real `operatoros_session` cookie. It verifies the exact nine-field DTO,
actual enum strings and current expiry. No browser JSON/header supplies identity.
The read has a hard two-second/8-KiB bound, normal TLS verification, no redirect
and no automatic retry. Host must match `fieldnode.operatoros.net` through the
existing explicit proxy-trust boundary; mutations require its exact HTTPS Origin.

Only the central cookie and five local names pass upstream: `portal_session`,
`portal_csrf`, `portal_mfa`, `portal_operatoros_mfa`, `portal_operatoros_setup`.
Duplicate incoming accepted names, malformed/quoted values and missing central
session fail closed. Authorization, tenant/user/role/grant headers, transaction
cookies and other ambient headers/cookies are removed.

GET status establishes the consumer's setup context and readable CSRF nonce.
Every mutation requires matching local `portal_csrf` and `X-CSRF-Token`;
there is no first-consume exemption. Exactly five frozen UI operations accept
an empty JSON body or only `{}`: POST consume, POST logout, POST node enrollment,
POST node revoke, and DELETE node. Their methods and UUID paths are classified
before parsing, and each sends **zero body bytes** upstream. Objects with keys
are rejected; the consumer's consume handler rejects any identity JSON. Other
registered JSON operations and unrelated API routes retain empty-JSON rejection.
MFA verification also requires the same nonce in JSON `csrf`. The consumer
validates its own nonce/challenge/local factor and never treats central login as MFA.
Normal portal JSON bodies cap at 64 KiB. Console bodies cap at 64 KiB, except the
frozen PUT library-content family at 1 MiB. Multipart is not registered.

Issued local cookies require host-only exact `Path=/manage`, Secure,
SameSite=Strict and HttpOnly except readable `portal_csrf`. Domain/unknown names,
central or transaction cookie writes and malformed attributes fail closed.
Actual Starlette 1.6.0 deletion headers omit security flags: only provable empty
clears (Max-Age <= 0 or canonical past Expires) at the same exact path are
normalized to Secure/Strict/required HttpOnly. A validated clear followed by
exactly one valid issued cookie of that name coalesces to the issued value,
matching the consumer's nonce rotation. Issued-then-anything, repeated clears or
issued values remain rejected. No nonempty issued-cookie rule is relaxed.

## Buffered, streaming and serial responses

Portal arrays/objects are bounded to 64 KiB and forwarded for 2xx/4xx, including
owner-defined factor/CSRF errors. Those payloads are not arbitrary-field redacted.
HTML and hashed CSS/JS require their expected media types, bounded bytes and no
cookie writes. Redirects, transport errors and 5xx bodies become fixed errors.
An explicit consumer `sign_in_required: true` marker survives sanitization;
gateway-level central expiry/outage also carries that marker, so the managed
UI can clear private state. Ordinary bad-factor errors remain retryable.
All gateway responses are no-store/no-referrer. Credentials and bodies are not
logged by this component. No upstream Location or arbitrary header is forwarded.

The console uses native TLS streams: a 120-second first-response ceiling,
32-KiB relay frames, four queued frames with backpressure and an atomic 16-channel
limit per node. Only Content-Type, Accept, Last-Event-ID, Range and Idempotency-Key
join the fixed cookie/Origin/CSRF forwarding set. Response media are narrowed to
JSON, SSE, plain text or attachment bytes; appliance HTML cannot execute on the
central origin. Only safe length/attachment headers are retained. Small error
bodies have an independent three-second/64-KiB completion bound. Client closure,
expiry and changed/failed central authority stop the channel. Current identity
is re-read at most three seconds apart, including idle streams; the consumer's
own channel independently rechecks local MFA, grants and appliance connection.
The gateway never infers a device grant from central membership.

Only serial/connect can upgrade to a fixed WSS destination. TLS, redirect,
handshake and 4096-byte payload bounds apply, with four queued frames and no
binary messages. Changed authority, closed peers or queue overflow close both
sides. The installed shared `@fastify/websocket` API has no per-route receive
limit. This route therefore requires exact pinned `ws` 8.21.3 and its numeric
receiver `_maxPayload` capability before attaching relay handlers or opening the
upstream. It narrows only that receiver to 4096 bytes and fails closed if the
capability/version differs. Actual single and fragmented oversized-frame tests
are required; other module receiver limits are unchanged. Shutdown releases all
owned timers/channels. There is no shared WebSocket routing refactor.

## Evidence and remaining acceptance

Task evidence lives under `evidence/resume-oct20/operatoros-fieldnode-gateway`.
The first frozen profile passed 159 controls, then independent review found
string-coerced roles. Its preserved baseline had 177 passes/two failures; the
corrected source passed 179 controls and independent malformed-route probes.
The PR19 expansion's initial 219-control checkpoint had three old middleware
failures: two exposed an early-dispatch anonymous redirect regression, which
was corrected; the third asserted the superseded unavailable-shell rewrite.
The anonymous PKCE controls remain intact, while the authenticated expectation
now points at the real gateway. The later 224-control checkpoint passed in full.
Strict fixture-typing corrections and all checkpoint logs are preserved.

Expanded independent review also reproduced rejected JSON/HTML responses issuing
cookies and malformed WS handshakes exhausting pre-accept reservations. Cookies
are now staged until full payload/static and expiry validation, with an error
handler removal defense; accepted serial channels reserve only inside the WS
handler after the library accepts the handshake and the receiver guard succeeds.
An independent strict Origin requirement covers serial GET upgrades. Original
failed probes and the actual 16-invalid-then-valid handshake regression remain
evidence; no assertion was waived. Bodyless parsing is encapsulated to this
Fastify plugin and the five exact method/path entries; unrelated JSON parsing, poison-key rejection,
fatal UTF-8 validation and raw per-route body bounds are separately exercised.

A subsequent real native-stream probe showed a known central rejection arriving
at upstream error-body close: the old branch could finish that body and issue a
local cookie despite an already-aborted authority lifetime. The corrected branch
checks the abort immediately after collection and before response/cookie commits,
preserving the independent expiry check. Its durable native-stream regression
releases an actual central HTTP 401 on upstream close and requires a sanitized
sign-in-required error with no cookie or original local-denial body. This is a
guard against already-known rejection, not a claim of atomic global revocation.

The 233-control checkpoint and its `Tl_PI-YPyN8M3N4Od-VjE` build passed local
source checks, but the actual joint browser then received a management 404 after
successful SSO. Same-cookie diagnostics found direct API and private-consumer
HTML successful while Next rejected the mount. Executing the installed Next
`matchHas` and `prepareDestination` functions proved that a `type: host` rewrite
silently appended its unused `host` parameter to the query. The strict gateway
correctly rejected that extra query. Management-only rewrites now match the
Host header without a capture, retaining canonical case/HTTPS-port spelling and
rejecting foreign hosts. A durable test executes those actual framework functions
and requires an empty generated query and an accepted gateway path; client-added
queries remain rejected. The frozen UI's four additional bodyless actions were
also traced and added to the exact parser allowlist alongside consume.

The final routing/bodyless source passed **238/238** selected native controls,
zero skips, at 23:03:44Z on October 20; strict changed-test typing and
zero-warning root lint passed. Fresh `pnpm build:production` completed at
**23:06:02Z**, exit 0, with four workspace type checks and **39/39** pages.
Its approved synthetic API rewrite is `http://127.0.0.1:5001`; the Next build ID
is `xYAgO8d7fkTKwDnwjPBYj`. `joint-runtime-source-v4.json` and
`joint-acceptance-artifacts-v4.json` bind the final source and compiled/rewrite
hashes to `joint-routing-bodyless-v5-acceptance-build-receipt.json`.
The earlier `ED444635`/`WmptyGzQSUd9W8SLA4ar-` artifact remains the failed
known-abort baseline; the 233-control artifact remains the management-404
baseline. Neither substitutes for the final acceptance candidate. Earlier
compile-only port-51999 artifacts are historical checkpoints. A parser
overload typing failure is also retained with its failed build, followed by the
explicit Buffer guard and passing strict/build receipts. No checkpoint is
substituted for final-source acceptance. Native tests exercise
real Fastify routes, actual Next middleware/config, stream transport with modeled
sockets and real in-memory WebSocket upgrades. The retained identity suite
executes actual JWT/auth/tenant/resolver bodies. These source checks alone do
not create a database, start a service or prove the cross-service browser flow.

The separately assigned joint harness owns approved synthetic databases,
per-process test CA/DNS/network restrictions and the actual frozen consumer.
Its results must be recorded with exact central/consumer build identities before
claiming signup, mapping, local factor, logout/revocation or private-state clearing
works jointly. Real owned-device grants/console, production origins/ingress,
matching recoverable database/MFA backup, separately approved migrations,
credentials and deployment remain distinct gates. No FieldNode repository or
SDK/identity wire file is edited here. Existing dependencies are reused without
acquisition; the retained local redirect-library mismatch remains disclosed and
is not used by the native HTTPS gateway.

Rollback removes these Next mappings/middleware exceptions and the central
gateway registration, returning management to explicit unavailability. There is
no OperatorOS database migration, billing change or credential to reverse.
