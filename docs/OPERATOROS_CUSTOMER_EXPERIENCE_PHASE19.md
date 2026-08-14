# OperatorOS customer experience implementation

Status: source/local Phase 19 experience-system candidate. This document is a
bounded working inventory and route-coverage record. It does not change the
deployment, provider, data-cutover, or State 5 gates in the authoritative
release documents.

## Product and implementation inventory

- Runtime: Next.js 15 App Router and React 18 in `apps/web`, Fastify 5 in
  `apps/api`, TypeScript 5.6, pnpm 10, PostgreSQL through the shared API.
- Authority: OperatorOS owns identity, host-only sessions, organizations,
  roles, billing, entitlements, registry, launch policy, and platform audit.
- Shared authenticated surfaces: `SaasLayout`, `TenantProvider`, `AuthProvider`,
  `MyAppsPage`, organization administration pages, workspace billing, account
  settings, and the platform-admin route.
- Shared module surface: every active module renders
  `OperatorOSEcosystemHeader` and then its approved workflow shell. Module
  navigation is registry-driven and launch uses the exact-host SSO v1 flow.
- Experience system: global CSS tokens and accessibility behavior plus shared
  `PageHeader`, `EmptyState`, `ErrorState`, and `FieldMessage` primitives.
- Existing component base: Lucide icons, React inline styles, centralized
  TypeScript tokens, and purpose-built module workspaces. There is no
  repository-defined lint script and no separate Tailwind build in `apps/web`.
- Customer state surfaces: shared loading, empty, error, toast, upgrade,
  billing, organization switch, module access, settings, and audit/activity
  patterns exist. Phase 19 standardizes the highest-frequency shell, catalog,
  billing, and account states without replacing module domain components.
- Analytics and evidence: server audit events, module-launch usage, activity
  feeds, request IDs, and production-host Playwright suites exist. No separate
  customer-product analytics SDK is active in the web app.

## Active module inventory

| Module | Plain-language purpose | Primary user | Main first action | Current source/local state |
| --- | --- | --- | --- | --- |
| TradeFlowKit | Customers, jobs, field work, and revenue flow | Owner, office staff, field team | Open work dashboard or create a customer/job | State 4; zero approved parity gaps; deployment/provider/cutover gates open |
| PulseDesk | Healthcare operations and service coordination | Healthcare coordinator, operations manager | Review service queue or open a request | State 4; deployment and privacy-reviewed cutover open |
| TechDeck | IT service and managed operations | MSP engineer, technician | Review tickets and managed systems | State 4; deployment/provider/cutover gates open |
| TorqueShed | Vehicle diagnostics, repair records, and community | Mechanic, vehicle owner | Start or reopen a diagnostic session | State 4; deployed provider/data gates open |
| FaultlineLab | Troubleshooting and root-cause challenges | Technician, learner | Choose a challenge and start an attempt | State 4; deployed acceptance/cutover open |
| Ninja Pool Hall | Practice and local pool gameplay | Player | Start Free Shoot or local match | State 4; deployed acceptance open |
| BrandForgeOS | Brand kits and campaign workflow | Owner, marketer | Open or create a brand kit | State 4; deployment/cutover open |
| SnapProofOS | Evidence capture, review, and reports | Field team, reviewer | Create or open an evidence case | State 4; deployment/cutover open |
| StudyForge AI | Source-grounded study and training | Learner, trainer | Choose a subject or source | State 4; deployment/cutover open |
| Ninja Launch Kit | Launch planning and readiness | Owner, project lead | Open a launch workspace | State 4; deployment/cutover open |
| CallCommand AI | Consent-bound call intake and follow-up | Office staff, manager | Review calls or configure a channel | State 4; deployment/provider/cutover open |
| Ninjamation | Reviewed PC automation scripts | IT administrator, power user | Open the script library or draft a script | State 4; deployment/cutover open; no browser/server execution |
| OutCall | Verified-self scheduled safety calls | Individual user | Complete safety setup and verify own number | State 4; deployment and controlled provider acceptance open |

## Route coverage

| Route or surface | Module | Primary user and workflow | UX/copy/responsive/accessibility status | Phase 19 change | Remaining bounded issue |
| --- | --- | --- | --- | --- | --- |
| `/` | OperatorOS public | New customer understands the platform | Existing marketing system; outside authenticated-primary slice | Palette inherits zoom/focus foundation | Full visual regression not captured in current tool environment |
| `/pricing` | OperatorOS public | Customer compares product stack | Existing catalog-backed pricing | Global accessibility foundation | Live checkout/provider acceptance remains gated |
| `/login` | OperatorOS auth | User securely signs in | Existing centralized auth | Zoom and visible focus retained globally | Authenticated browser capture not available in this run |
| `/app` Home | OperatorOS | Any user chooses a tool | Updated | Goal-led heading, organization language, setup progress, specific open actions, responsive header | Cross-tool attention feed requires an approved server aggregate; not fabricated |
| `/app?page=apps` | OperatorOS | User finds a relevant tool | Updated | Page hierarchy, labeled search, accessible pressed filters, safe errors, useful empty state, exact CTAs | Purchase acceptance remains provider-gated |
| `/app?page=ai-tools` | OperatorOS | User uses available AI utilities | Shared shell updated; page unchanged | Clear location and navigation | Deeper AI copy audit remains bounded follow-up |
| `/app?page=billing` | OperatorOS | Account holder manages workspace capacity | Updated | Distinguishes workspace plan from module access, safe recovery, specific reduce/cancel actions, useful empty history | Stripe portal/checkout live acceptance remains gated |
| `/app?page=settings` | OperatorOS | User manages profile and security | Updated | Programmatic labels, autocomplete, headings, recovery messages, explicit destructive action | Browser focus-order proof remains open |
| `/app?page=command-center` | Organization admin | Admin reviews organization activity | Shared shell updated; existing data-rich page retained | Plain navigation label and current location | No ordinary-member access by design |
| `/app?page=tenant-users` | Organization admin | Admin manages team members | Shared shell updated | “Team members” language and clear organization grouping | Detailed table/mobile audit remains bounded follow-up |
| `/app?page=tenant-modules` | Organization admin | Admin manages tool access | Updated | Clear tool-access label, honest empty/error states, and routes from catalog/home | Live entitlement changes require existing server authority |
| `/app?page=tenant-billing` | Organization admin | Admin manages module billing/add-ons | Shared shell updated | Distinct “Billing and add-ons” label | Live provider acceptance remains gated |
| `/app?page=tenant-settings` | Organization admin | Admin updates organization settings | Shared shell updated | Removes tenant jargon from global navigation | Detailed form-state pass remains bounded follow-up |
| `/app/platform` | Platform super-admin | Admin operates platform authority | Shared shell updated; authorization unchanged | Plain “Platform administration” label | Advanced view remains intentionally technical |
| `/{module host}/` and approved deep links | All 13 active modules | Profession-specific primary workflows | Existing State 4 workflows; shared header updated | Organization/user context, account/billing/help labels, 44px mobile actions, horizontal mobile reflow; TradeFlowKit, TorqueShed, PulseDesk, and TechDeck now expose plain first actions | Per-workflow browser screenshots and deployed acceptance remain open |
| `/public/tradeflowkit/...` | TradeFlowKit | Customer views approved public document | Existing bounded token route | Global zoom/focus foundation | Provider/public deployed smoke remains open |

## Phase 19 design decisions

1. Preserve the dark operations identity while replacing near-black,
   low-contrast surfaces with neutral slate surfaces and a reserved blue action
   color.
2. Organize navigation by customer goals: Workspace, Organization, Platform,
   and Account. Repository and tenancy implementation terms stay in technical
   contracts, not ordinary navigation.
3. Keep advanced platform and module details available; do not expose raw API,
   Stripe environment, or exception terminology in ordinary recovery copy.
4. Preserve exact-host SSO, host-only cookies, tenant checks, entitlement
   decisions, billing ownership, module registry, and all existing domain APIs.
5. Do not fabricate a cross-module attention dashboard without an approved,
   tenant-scoped server aggregate. The current Home surface shows real access,
   setup, and recent-launch state only.

## Validation boundary

Source/static and build evidence must be recorded in
`docs/IMPLEMENTATION_STATUS.md` after fresh commands complete. This environment
does not expose the Product Design in-app Browser plugin, and direct Playwright
capture requires a user-selected browser under the design workflow. Therefore
Phase 19 does not claim screenshot-based visual audit, keyboard-browser proof,
deployed acceptance, or WCAG conformance from source inspection alone.
