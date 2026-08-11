# TorqueShed API route map

All application routes are mounted below `/api` and require a valid opaque TorqueShed session unless noted. Browser sessions use the `HttpOnly` `torqueshed_session` cookie; native clients use the same opaque value as a bearer token. All product reads and writes apply the OperatorOS user and tenant projection.

## Public and identity

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Health probe; no session required |
| `GET` | `/sso?token=...` | Consume a one-time OperatorOS launch token and issue the browser session |
| `POST` | `/api/auth/operatoros` | Native OperatorOS token exchange, rate limited |
| `GET` | `/api/auth/me` | Current TorqueShed session and OperatorOS identity projection |
| `POST` | `/api/auth/logout` | Revoke the local session and return the OperatorOS `/app` URL |

## Garage and projects

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Tenant-scoped garage, diagnostics, community, listings, and token balance |
| `GET, POST` | `/api/vehicles` | List owned vehicles or create a private vehicle profile |
| `GET, PATCH` | `/api/vehicles/:vehicleId` | Vehicle dashboard or editable vehicle fields |
| `GET, POST` | `/api/vehicles/:vehicleId/records` | Maintenance, repair, modification, inspection, mileage, parts, labor, and cost history |
| `POST` | `/api/vehicles/:vehicleId/reminders` | Due-date or mileage service reminder |
| `GET, POST` | `/api/builds` | Owned project builds |
| `POST` | `/api/builds/:buildId/stages` | Build stages |
| `POST` | `/api/builds/:buildId/tasks` | Stage-aware build tasks |
| `GET, POST` | `/api/vendors` | User-owned parts and service vendors |
| `POST` | `/api/attachments` | Register validated photo/document metadata after storage upload |

## Diagnostics and Torque Assist

| Method | Route | Purpose |
| --- | --- | --- |
| `GET, POST` | `/api/diagnostics` | List or start owned diagnostic sessions |
| `GET, PATCH` | `/api/diagnostics/:sessionId` | Diagnostic timeline and final resolution fields |
| `POST` | `/api/diagnostics/:sessionId/codes` | Trouble codes and freeze-frame values |
| `POST` | `/api/diagnostics/:sessionId/entries` | Symptoms, conditions, inspections, tests, measurements, causes, repairs, and verification |
| `POST` | `/api/diagnostics/:sessionId/assist` | Idempotent, rate-limited Torque Assist analysis; requires `Idempotency-Key` |
| `GET, POST` | `/api/diagnostic-templates` | Private or tenant-shared reusable test plans |

Torque Assist reserves two ledger tokens while processing and inserts the debit only in the successful completion transaction. Reusing a completed idempotency key returns the original result without a second debit.

## Tokens and Stripe

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/token-balance` | Ledger-derived balance, reservations, usage history, and purchases |
| `GET` | `/api/billing/packages` | Configured token packages and checkout readiness |
| `POST` | `/api/billing/checkout` | Create a Stripe Checkout Session |
| `GET` | `/api/billing/purchases` | User purchase history |
| `POST` | `/api/billing/stripe/webhook` | Raw-body, signed Stripe webhook; no TorqueShed session required |

The webhook credits tokens only for paid Checkout sessions that match a pending TorqueShed purchase. `external_event_id` and checkout identifiers are unique, making credit and refund reversal processing idempotent.

## Community and marketplace

| Method | Route | Purpose |
| --- | --- | --- |
| `GET, POST` | `/api/posts` | Tenant community feed and build/project posts |
| `POST` | `/api/posts/:postId/comments` | Threaded comments |
| `PUT` | `/api/posts/:postId/reactions/:reaction` | Idempotent reactions |
| `POST` | `/api/posts/:postId/reports` | Moderation report |
| `PUT` | `/api/profiles/:userId/follow` | Same-tenant profile follow |
| `GET, POST` | `/api/listings` | Search/filter active listings or publish a listing |
| `PUT` | `/api/listings/:listingId/favorite` | Idempotent favorite |
| `POST` | `/api/listings/:listingId/messages` | Direct seller contact workflow |
| `POST` | `/api/listings/:listingId/reports` | Marketplace moderation report |
| `GET` | `/api/admin/audit` | Tenant audit stream for platform or tenant administrators |

TorqueShed does not claim escrow, shipping, tax calculation, transaction settlement, or payment protection for marketplace exchanges.
