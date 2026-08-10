# Phase 27 — PulseDesk Complete Healthcare Operations Report

> Generated from the pinned PulseDesk source ledger and current executable parity output. Counts and item decisions are not maintained by hand.

## Outcome

Pinned source commit `937849471e489ed23db2a263d04160a388402740` compiles to **840** facets: **324 ACTIVE_NATIVE**, **516 ACTIVE_SHARED_EQUIVALENT**, **0 OWNER_WAIVED**, and **0 BLOCKED**.

The historical hand ledger contains **309** claims: 23 pages, 183 routes, 50 tables, 45 provider/config references, and 8 background processes. Regeneration found **48** claims whose stated source file is absent from the pinned tree; they are excluded rather than misreported as source capabilities. The corrected primary inventory is **261** records.

All **138** source-backed historical retirements were re-opened: **15** native and **123** shared-equivalent. 6 retired hand-ledger claims were among the absent-source records and are not counted green.

This is source/local evidence only. It does not claim an EHR, a compliance certification, live provider delivery, production migration, deployment, data cutover, or rollback rehearsal.

## Privacy and provider evidence

- OperatorOS remains the sole identity, tenant, role, entitlement, billing, secret, provider, scheduler, and audit authority.
- PulseDesk stores PHI-minimized operational requests only. Public intake rejects common clinical identifiers/terms; shared logs and connector events contain bounded metadata, hashes, provider state, and opaque IDs rather than bodies, credentials, or sender addresses.
- Per-tenant connectors cover SendGrid Inbound Parse, IMAP, Google Workspace, and Microsoft 365. Credentials are encrypted references; OAuth state is hashed and expiring; revocation is durable.
- Deterministic adapters exercise authenticated alias delivery, ingestion, duplicate message IDs, quarantine-before-ticket attachment scanning, ticket creation, polling, OAuth state/callback, retry, and dead-letter-compatible shared jobs. Live inbound delivery uses constant-time HMAC verification and fails closed until credentials, callbacks, provider configuration, and health are verified.
- Public and asset-specific issue intake is opaque-slug, tenant-routed, rate-limited, length-bounded, privacy-filtered, and returns a non-sensitive reference. The installable shell caches only GET navigation; it never caches POST bodies, and reconnect handling preserves the in-tab form without storing operational content.

## Restored operations

Dashboard/KPIs; departments/facilities and Directory clients/sites/requesters; tickets, categorization, urgency, assignment, internal notes, replies, attachments, time, SLA, history, search, exports; public/asset intake; equipment context; supply/facility/vendor coordination; knowledge, templates, notifications, analytics, admin; connector management; PWA/mobile/deep links.

## Executable evidence

- `apps/api/test/pulsedesk-literal-product.test.ts` — all four deterministic provider ingestions, authenticity rejection, duplicate IDs, quarantine-before-ticket attachment handling, OAuth state/callback, tenant isolation, privacy rejection, public intake, and at-rest redaction.
- `apps/api/test/pulsedesk-state5-workflow.test.ts` — tenant-scoped persisted operations journey and isolation.
- `apps/api/test/pulsedesk-literal-static.test.ts` — connector/privacy/public-intake/release/UI contract.
- `apps/api/test/pulsedesk-service-desk-domain.test.ts` — workflow transitions, SLA, validation, and PHI boundary.
- `apps/web/e2e/sso-v1.spec.ts` — compiled exact-host PulseDesk ticket, connector, anonymous intake, client, persistence, and host-only session journey.
- `scripts/phase20-product-truth.test.mjs` — reproducible source/parity states.

## Local verification results

- Root API, runner-gateway, and web typecheck: PASS.
- Full repository lint with zero warnings: PASS.
- API, runner-gateway, and Next production build: PASS; the dynamic PulseDesk public-intake artifact compiled.
- Focused release/static/domain/PostgreSQL suite: 11/11 PASS.
- Additive database release v36: 36-step plan PASS; apply and immediate reapply PASS.
- Compiled local HTTPS exact-host journey: 1/1 PASS in 14.1 seconds, including connector setup/test ingestion, anonymous intake, mobile viewport, service-worker artifact, restart persistence, SSO/session isolation, and exact record routes.
- Strict parity: zero PulseDesk issues. The root result remains intentionally red with 4,228 issues, all assigned to other modules.

## Item-level re-opened retirement ledger

| # | Prior disposition | Domain | Collection | Source outcome | Current state | Capability ID |
|---:|---|---|---|---|---|---|
| 1 | retired_product_boundary | provider_inbox_ingestion | pages | /email-settings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.ui_route.4578f5757e7808b8` |
| 2 | retired_security | identity | pages | /login | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.ui_route.e42493ed04f2c1ca` |
| 3 | retired_product_boundary | platform_legal | pages | /privacy | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.ui_route.0d0af7daa5ce122b` |
| 4 | retired_product_boundary | platform_legal | pages | /terms | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.ui_route.b9f889ffdfe1a7a3` |
| 5 | retired_security | platform_administration | apiRoutes | DELETE /api/admin/orgs/:id | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.9da0a6bccec55eca` |
| 6 | retired_security | platform_administration | apiRoutes | DELETE /api/admin/orgs/:orgId/members/:userId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.a923a673f7b68b26` |
| 7 | retired_security | platform_administration | apiRoutes | DELETE /api/admin/users/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.2b46faf408026dcd` |
| 8 | retired_security | history_preserving_retention | apiRoutes | DELETE /api/assets/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.bd3266527f638720` |
| 9 | retired_security | identity_tenant_authority | apiRoutes | DELETE /api/auth/delete-account | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.42efd1094f9a3c7d` |
| 10 | retired_security | identity_tenant_authority | apiRoutes | DELETE /api/auth/role-mappings/:id | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.8720487e5db4aad2` |
| 11 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | DELETE /api/connectors/:id | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.29f738fde491314f` |
| 12 | retired_security | history_preserving_retention | apiRoutes | DELETE /api/departments/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.5d613304ffeadcb4` |
| 13 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | DELETE /api/email/oauth-app-config/:provider | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.5a8a628bdd90e330` |
| 14 | retired_security | history_preserving_retention | apiRoutes | DELETE /api/facility-requests/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.f46383ce85cd2420` |
| 15 | retired_security | identity_tenant_authority | apiRoutes | DELETE /api/memberships/:userId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.036bf0f0d5c74885` |
| 16 | retired_security | history_preserving_retention | apiRoutes | DELETE /api/supply-requests/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.c4afb95a56bcac11` |
| 17 | retired_security | history_preserving_retention | apiRoutes | DELETE /api/tickets/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.535b0c94c78831e1` |
| 18 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/connectors | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.2033bd0d86fa1f0b` |
| 19 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/connectors/:id/events | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.a0f181609ee67bdf` |
| 20 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/connectors/events | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.e55bc1fec4c776d8` |
| 21 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/connectors/pollers | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.2d1fde6ee68bfc24` |
| 22 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/email/events | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.3ff82539f0969efc` |
| 23 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/email/failed | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.9436f03592070727` |
| 24 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/email/settings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.dfca5cf3e31c0ab9` |
| 25 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/admin/imap/status | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.d21d22b53fbf3c61` |
| 26 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/audit-log | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.7df818a2f4d76829` |
| 27 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/config | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.45d8905f0946f66c` |
| 28 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/m365/callback | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.8726b6cec6dd6555` |
| 29 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/m365/login | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.8f14d12dce2e6697` |
| 30 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/me | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.fc6831f893d1fa48` |
| 31 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/role-mappings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.de63db91db243b1b` |
| 32 | retired_security | identity_tenant_authority | apiRoutes | GET /api/auth/tenant/:slug | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.1216b33d2065cb5b` |
| 33 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.6bda9ca357628e92` |
| 34 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors/:id | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.825b72830c6e9255` |
| 35 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors/:id/events | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.50b201f9c38a5133` |
| 36 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors/:id/health | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.0df79485829b8863` |
| 37 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors/:id/oauth/start | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.514306da9c0d079a` |
| 38 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors/oauth/callback | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.6381688875243ff6` |
| 39 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/connectors/oauth/config-status | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.308ca81dc6ad3eb6` |
| 40 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/email/contacts | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.beecbd7c2741eaee` |
| 41 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/email/events | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.c26d00b8309692fb` |
| 42 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/email/imap/status | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.aaaea4a475c6a5cc` |
| 43 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/email/oauth-app-config | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.b486c9c33a2e13cf` |
| 44 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/email/outbound/status | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.3209c25ccd0ef9ff` |
| 45 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | GET /api/email/settings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.cdb599c9fff2561d` |
| 46 | retired_security | identity_tenant_authority | apiRoutes | GET /api/invite-codes | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.c662f3151e4be87d` |
| 47 | retired_security | identity_tenant_authority | apiRoutes | GET /api/members | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.d2a1d56400f6c225` |
| 48 | retired_security | identity_tenant_authority | apiRoutes | GET /api/memberships | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.fe01743fe6e58691` |
| 49 | retired_product_boundary | standalone_setup_checklist | apiRoutes | GET /api/onboarding | ACTIVE_NATIVE | `pulsedesk.api_endpoint.b4263f2885392152` |
| 50 | retired_security | identity_tenant_authority | apiRoutes | PATCH /api/auth/profile | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.26888341bdbe45c4` |
| 51 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | PATCH /api/connectors/:id | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.9fe4cc3db63a9e37` |
| 52 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | PATCH /api/email/imap | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.9f306d9d8a08c1a6` |
| 53 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | PATCH /api/email/oauth-app-config | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.9c500cf3400cdcb5` |
| 54 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | PATCH /api/email/settings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.afca032a49178071` |
| 55 | retired_security | identity_tenant_authority | apiRoutes | PATCH /api/memberships/:userId/role | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.980d68f33dce22c3` |
| 56 | retired_product_boundary | standalone_setup_checklist | apiRoutes | PATCH /api/onboarding/:id | ACTIVE_NATIVE | `pulsedesk.api_endpoint.abcdea36a3dc89c0` |
| 57 | retired_security | identity_tenant_authority | apiRoutes | PATCH /api/orgs/:id | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.6741c46c71c3a2ce` |
| 58 | retired_security | platform_administration | apiRoutes | POST /api/admin/audit/purge | ACTIVE_NATIVE | `pulsedesk.api_endpoint.cb4a795121ca3d6e` |
| 59 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/connectors/:id/disable | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.b14d9c7528c2db73` |
| 60 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/connectors/:id/enable | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.5221a6ee3236115e` |
| 61 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/connectors/:id/force-poll | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.02a064fc70f51d61` |
| 62 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/email/regenerate-alias/:orgId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.3279b493c0808b0a` |
| 63 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/email/replay/:eventId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.4b32fe5247ccfcdf` |
| 64 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/email/toggle/:orgId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.88728bbc13d36fe7` |
| 65 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/imap/disable/:orgId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.bc4deec9d63ae197` |
| 66 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/imap/force-poll/:orgId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.a327e85814230c71` |
| 67 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/admin/imap/reset/:orgId | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.da8e48d9937f9c4d` |
| 68 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/change-password | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.779d005388ef4472` |
| 69 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/config/test | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.1305e3bb7995b367` |
| 70 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/login | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.4144728847bcf097` |
| 71 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/logout | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.a90af5961c71bff8` |
| 72 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/register | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.b7c7fa784478a0a8` |
| 73 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/role-mappings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.26a41ec569c0650e` |
| 74 | retired_security | identity_tenant_authority | apiRoutes | POST /api/auth/switch-org | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.d945de8da006e70f` |
| 75 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/connectors | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.5df019ac672e2a4c` |
| 76 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/connectors/:id/disconnect | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.87b763ea8c92d474` |
| 77 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/connectors/:id/poll | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.4cb6f3bbf645da13` |
| 78 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/connectors/:id/test | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.664b451354f91d91` |
| 79 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/imap/configure | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.79f9d3a5c6f4c020` |
| 80 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/imap/reset | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.aa455a803d916ea4` |
| 81 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/imap/test | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.969937d55e56b2c5` |
| 82 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/inbound/:provider | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.7f2810c6321363e1` |
| 83 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/outbound/test | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.7f209a9e02c338c1` |
| 84 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/settings/initialize | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.66ac754a5bec27d9` |
| 85 | retired_product_boundary | provider_inbox_ingestion | apiRoutes | POST /api/email/test-inbound | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.fa6cbaf7d5d7c112` |
| 86 | retired_security | identity_tenant_authority | apiRoutes | POST /api/invite-codes | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.4c2126e52404d764` |
| 87 | retired_product_boundary | standalone_setup_checklist | apiRoutes | POST /api/onboarding | ACTIVE_NATIVE | `pulsedesk.api_endpoint.c7b05b070f65b74c` |
| 88 | retired_product_boundary | standalone_setup_checklist | apiRoutes | POST /api/onboarding/:id/complete | ACTIVE_NATIVE | `pulsedesk.api_endpoint.682af9cf88500960` |
| 89 | retired_product_boundary | standalone_setup_checklist | apiRoutes | POST /api/onboarding/:id/skip | ACTIVE_NATIVE | `pulsedesk.api_endpoint.cf6a662de248f944` |
| 90 | retired_product_boundary | standalone_setup_checklist | apiRoutes | POST /api/onboarding/reorder | ACTIVE_NATIVE | `pulsedesk.api_endpoint.3941e17123f0021b` |
| 91 | retired_security | identity_tenant_authority | apiRoutes | POST /api/orgs | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.ef85a66e91561c1d` |
| 92 | retired_security | identity_tenant_authority | apiRoutes | POST /api/orgs/join | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.a93a70321650e981` |
| 93 | retired_security | identity_tenant_authority | apiRoutes | PUT /api/auth/config | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.api_endpoint.19856ddc0280e97a` |
| 94 | retired_security | identity_tenant_authority | tables | auth_audit_log | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.3f86d55310592ff1` |
| 95 | retired_product_boundary | provider_inbox_ingestion | tables | connector_events | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.02f25936317890a6` |
| 96 | retired_product_boundary | vendor_contract_authority | tables | contracts | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.5149c4634a616493` |
| 97 | retired_product_boundary | technical_device_authority | tables | devices | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.b131e390242b4ec9` |
| 98 | retired_product_boundary | provider_inbox_ingestion | tables | email_contacts | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.0dd58581285bed5b` |
| 99 | retired_product_boundary | provider_inbox_ingestion | tables | email_settings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.0602580233edc3be` |
| 100 | retired_product_boundary | provider_inbox_ingestion | tables | inbound_email_log | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.53454ddc44f8ec85` |
| 101 | retired_security | identity_tenant_authority | tables | invite_codes | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.f4fee82345982f26` |
| 102 | retired_product_boundary | provider_inbox_ingestion | tables | mail_connectors | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.056291351f82087d` |
| 103 | retired_security | identity_tenant_authority | tables | memberships | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.0fad6fe18ae6ee7d` |
| 104 | retired_product_boundary | standalone_setup_checklist | tables | onboarding_items | ACTIVE_NATIVE | `pulsedesk.database_table.32c0619b5b616438` |
| 105 | retired_security | identity_tenant_authority | tables | operatoros_entitlement_snapshots | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.5c86c53488220317` |
| 106 | retired_security | identity_tenant_authority | tables | org_auth_config | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.fd9dd0e2f808137a` |
| 107 | retired_security | identity_tenant_authority | tables | org_role_mappings | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.ad9288ad3df5bf19` |
| 108 | retired_security | identity_tenant_authority | tables | orgs | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.617a44da96303dd3` |
| 109 | retired_product_boundary | provider_inbox_ingestion | tables | ticket_email_metadata | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.database_table.624450e41f1a328f` |
| 110 | retired_security | identity_tenant_authority | tables | users | ACTIVE_NATIVE | `pulsedesk.database_table.686c264add295cd2` |
| 111 | retired_security | child_identity_configuration | providers | DEV_M365_MOCK | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.b0488613788284ff` |
| 112 | retired_security | child_identity_configuration | providers | ENABLE_DEMO_SEEDS | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.31f6f344366b7cc4` |
| 113 | retired_security | child_identity_configuration | providers | ENABLE_LOCAL_REVIEWER | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.be9dc42cca6c3483` |
| 114 | retired_product_boundary | provider_connector | providers | GOOGLE_CLIENT_ID | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.6c4076990101ffc2` |
| 115 | retired_product_boundary | provider_connector | providers | GOOGLE_CLIENT_SECRET | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.6fbbe7d0b0839c26` |
| 116 | retired_product_boundary | provider_connector | providers | MAILGUN_API_KEY | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.6683c8523cf609f7` |
| 117 | retired_product_boundary | provider_connector | providers | MICROSOFT_CLIENT_ID | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.9071b7cbec63d0af` |
| 118 | retired_product_boundary | provider_connector | providers | MICROSOFT_CLIENT_SECRET | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.8420a73043340abf` |
| 119 | retired_security | child_identity_configuration | providers | MODULE_SSO_SECRET | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.42302ede2121509a` |
| 120 | retired_security | child_identity_configuration | providers | PULSEDESK_MASTER_ADMIN_EMAIL | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.415aaa47d2d87a88` |
| 121 | retired_product_boundary | provider_connector | providers | REPL_ID | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.6afd730f3e9029c1` |
| 122 | retired_product_boundary | provider_connector | providers | REPL_IDENTITY | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.1df76f78c3c864f2` |
| 123 | retired_product_boundary | provider_connector | providers | REPLIT_CONNECTORS_HOSTNAME | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.cd5ccb0c0f83eb8e` |
| 124 | retired_product_boundary | provider_connector | providers | REPLIT_DEPLOYMENT | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.c1a7a51421130b02` |
| 125 | retired_product_boundary | provider_connector | providers | SENDGRID_API_KEY | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.48d4011bd5393f88` |
| 126 | retired_product_boundary | provider_connector | providers | SENDGRID_FROM_EMAIL | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.fd8fa97364eb875c` |
| 127 | retired_product_boundary | provider_connector | providers | SENDGRID_FROM_NAME | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.72c194beb6f42ab6` |
| 128 | retired_product_boundary | provider_connector | providers | SENDGRID_INBOUND_BASIC_AUTH | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.4c7f748191fb0e16` |
| 129 | retired_product_boundary | provider_connector | providers | SENDGRID_INBOUND_IP_ALLOWLIST | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.858ae9ecd65546f3` |
| 130 | retired_product_boundary | provider_connector | providers | SENDGRID_WEBHOOK_VERIFICATION_KEY | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.0a4d2a39a168a5df` |
| 131 | retired_product_boundary | provider_connector | providers | TWILIO_ACCOUNT_SID | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.061051ae73d1075e` |
| 132 | retired_product_boundary | provider_connector | providers | TWILIO_AUTH_TOKEN | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.d8df33ed1acd3a1b` |
| 133 | retired_product_boundary | provider_connector | providers | TWILIO_PHONE_NUMBER | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.23513b7cdaea58b0` |
| 134 | retired_product_boundary | provider_connector | providers | WEB_REPL_RENEWAL | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.integration.7c00d81555fe93f1` |
| 135 | retired_product_boundary | provider_inbox_ingestion | backgroundProcesses | connector-poller | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.background_process.f7ca3befe057a768` |
| 136 | retired_product_boundary | provider_inbox_ingestion | backgroundProcesses | email-processor | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.background_process.3028760e798f0070` |
| 137 | retired_product_boundary | provider_inbox_ingestion | backgroundProcesses | imap-poller | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.background_process.8a5ec5852f9ef31d` |
| 138 | retired_security | identity_seed | backgroundProcesses | standalone-seeding | ACTIVE_SHARED_EQUIVALENT | `pulsedesk.background_process.2d9bf447c58faf23` |

## Deployment gates

- Back up the target database and apply additive release v36 through the supported release runner.
- Configure and verify real SendGrid/IMAP/Google/Microsoft provider applications, secrets, callbacks, tenant aliases, authenticity checks, and health before enabling live ingestion.
- Run compiled exact-host desktop/mobile/PWA, authenticated tenant/role, anonymous intake, restart persistence, provider delivery, data reconciliation, and rollback acceptance on the reviewed deployed commit.

