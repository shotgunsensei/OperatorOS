# Phase 51 — Creative, Automation, and Game Route Migration

Status: source/local route migration complete; deployment and live-provider acceptance remain external gates
Branch: `codex/phases-41-52-revenue-routes`

## Registry coverage and authority

The runtime registry, exact-host middleware, compatibility route map, Phase 31–40 product restorations, and current shells were reviewed before implementation. The remaining active polished modules are BrandForgeOS, StudyForge AI, Ninja Launch Kit, Ninjamation, and Ninja Pool Hall. Together with TradeFlowKit, TorqueShed, and the Phase 50 batch, these account for every active polished child module. OutCall remains explicitly planned/production-disabled and is already covered by the Phase 50 route migration; it is not silently counted as active. No external-only active polished module or unassigned active shell was found.

OperatorOS remains the only authority for identity, credentials, sessions, tenants, membership, platform roles, billing, subscriptions, entitlements, launch policy, and platform audit. Route migration must not create a child login, checkout, or authority path.

## Owner-readable route maps

### BrandForgeOS

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See creative operations | `/` | Persisted brand, campaign, content, launch, and usage posture | `/dashboard`, `/home` |
| Manage brands and audiences | `/brands`, `/personas` | Brand kits, design/voice rules, audience evidence, record deep links | `/brands/:id`, `/personas/:id` |
| Manage offers and campaigns | `/offers`, `/campaigns` | Offers, campaign briefs, production, approval-aware workflows | `/offers/:id`, `/campaigns/:id` |
| Produce content and assets | `/content`, `/assets`, `/ai-workflows` | Copy studio, generated content, asset references, provider-honest generation | `/copy-studio`, `/generations/:id` |
| Plan and approve work | `/calendar`, `/approvals` | Content calendar, recommendations, review state | `/calendar-items/:id` |
| Review performance | `/analytics`, `/reports` | Real campaign/product analytics, reports, exports | `/reports/:id`, `/exports/:id` |
| Manage strategy/templates | `/strategy`, `/templates` | Guided workflows and template marketplace | `/workflows/:id`, `/templates/:id` |
| Configure integrations | `/integrations` | Provider configuration/readiness without fake success | — |
| Control module behavior | `/settings` | Onboarding, plan/usage/security/legal guidance under OperatorOS authority | `/activity`, `/admin`, `/onboarding`, `/pricing`, `/legal`, `/privacy`, `/terms`, `/login` |

### StudyForge AI

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See learning posture | `/` | Persisted sets, sessions, quizzes, countdowns, and streaks | `/app`, `/dashboard` |
| Manage sources and notes | `/sources`, `/notes` | Private notes/documents, subjects/courses, source records | `/subjects`, `/courses`, `/sources/:id` |
| Manage study sets | `/sets` | Folders, complete set creation and durable set records | `/folders`, `/sets/new`, `/sets/:id` |
| Practice flashcards | `/flashcards` | Decks/cards, review workflow, spaced-repetition progress | `/decks`, `/decks/:id`, `/cards/:id` |
| Take quizzes/tests | `/quizzes` | Review/publish, server-authoritative attempts and results | `/quizzes/:id` |
| Run learning sessions | `/sessions` | Study plans, flashcard sessions, completion and countdowns | `/plans`, `/exams`, `/plans/:id` |
| Review progress | `/progress` | Analytics, activity, recall, scores, portable authorized exports | `/analytics`, `/exports` |
| Use source-grounded generation | `/studio` | Human-reviewed AI drafting with provider truth | — |
| Control module behavior | `/settings` | Preferences, plan/usage and administration under OperatorOS authority | `/account`, `/admin`, `/pricing` |

### Ninja Launch Kit

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See launch posture | `/dashboard` | Persisted kit/project and execution readiness | `/home` |
| Manage projects and kits | `/projects`, `/kits` | Complete kit records, project setup, record details | `/projects/:id`, `/kits/:id` |
| Select templates | `/templates` | Durable launch templates and source-compatible selection | — |
| Define brand/visual brief | `/brief` | Goals, audience, voice, palette, brief and brand settings | `/brand`, `/visual-brief` |
| Generate deliverables | `/deliverables` | Generated package artifacts and provider-honest state | `/generate`, `/artifacts` |
| Review and export | `/review`, `/exports` | Approval, readiness, release proof, downloads | `/readiness`, `/launches`, `/plan` |
| Control module behavior | `/settings` | OperatorOS access, product settings, and safe provider configuration | `/account`, `/admin` |

### Ninjamation

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See automation posture | `/dashboard` | Persisted approved-script, review, sync, generation and usage status | — |
| Browse script library | `/library` | Search, filters, favorites, immutable approved versions | `/scripts` |
| Review script record | `/scripts/:id` | Source, checksums, version, lifecycle and download evidence | `/editor` |
| Manage sources/sync | `/sources`, `/sync` | GitHub synchronization and durable sync records | `/sync-runs/:id` |
| Generate reviewed drafts | `/generate` | AI draft creation with provider-disabled honesty | `/generations`, `/generations/:id` |
| Review and approve | `/review` | Human approval/rejection/retirement workflow | — |
| Review runs/downloads | `/runs`, `/downloads` | Existing safe download audit and non-execution boundary | `/downloads/:id` |
| Review versions | `/versions` | Immutable script version history and checksums | — |
| Control module behavior | `/settings` | Usage/admin under OperatorOS billing and authority | `/account`, `/billing`, `/checkout/success`, `/checkout/cancel`, `/admin` |

### Ninja Pool Hall

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| Enter the hall/profile | `/`, `/profile` | Player profile, progression, history summary and table/rule preferences | — |
| Practice | `/practice` | Free-shoot rack and persisted practice summary | — |
| Play a local match | `/local` | Two-player hot-seat match and persisted result | — |
| Play the CPU | `/cpu` | Complete deterministic house match and persisted result | — |
| Find or create online play | `/online`, `/host`, `/join` | Authenticated rooms, invite/join, reconnect-safe state | — |
| Play an online room | `/rooms/:id` | Adaptive full-screen game route with account context and guarded exit | — |
| Review match history/stats | `/history`, `/stats`, `/matches/:id` | Durable results, progression, and saved match detail | — |
| Review rules/settings | `/rules`, `/settings` | Game rules and player/table preferences | `/profile` |

## Implementation and evidence ledger

| Module | Route implementation | Focused verification | Checkpoint |
| --- | --- | --- | --- |
| BrandForgeOS | Distinct shared-shell route owner; focused brand/campaign/content/calendar/approval/analytics/integration loading | 11 exact-host routes, history/reload, three axe surfaces, responsive evidence | Complete |
| StudyForge AI | Distinct shared-shell route owner; source/set/study/session/progress/studio views mount only their relevant complete panels | 9 exact-host routes, history/reload, three axe surfaces, responsive evidence | Complete |
| Ninja Launch Kit | Distinct shared-shell route owner; authenticated product starts at `/dashboard` because `/` is the deliberate public acquisition surface | 8 exact-host routes, history/reload, three axe surfaces, responsive evidence | Complete |
| Ninjamation | Distinct shared-shell route owner; `/library` remains the authenticated launch entry and `/dashboard` is the owned overview route | 8 exact-host routes, history/reload, three axe surfaces, responsive evidence | Complete |
| Ninja Pool Hall | Shared authenticated shell on lobby/profile routes; practice, CPU, local, and room play use the adaptive game layout with guarded online-room exit | 8 exact-host routes, history/reload, three axe surfaces, responsive evidence plus deterministic physics/rules/recovery tests | Complete |

## Cross-module results

- Every active polished registry module is assigned to the Phase 49, Phase 50, or Phase 51 route program. No active polished module was silently omitted.
- The five Phase 51 products use one semantic application-shell contract while retaining distinct visual themes and product language.
- Ordinary route navigation remains in the current tab. The global `My Apps` and profile actions remain visible through the shared shell, including the compact game presentation.
- Route changes use normal URLs, preserve back/forward and reload behavior, and retain deliberate compatibility aliases. Public acquisition roots for Ninja Launch Kit and Ninjamation are not overwritten by authenticated product dashboards.
- Focused rendering prevents the former whole-product fan-out: each route mounts/loads only the relevant product area. Provider-backed operations remain honest when configuration is unavailable.
- Ninja Pool Hall retains deterministic practice/CPU/local behavior, authoritative online state, reconnect reconciliation, and guarded active-room exit. The route migration does not introduce a second game engine or client-authoritative online state.

## Verification evidence

Environment: Windows PowerShell, `APP_ENV=test`, isolated disposable PostgreSQL at `127.0.0.1:55441/operatoros_phase45_clean`, exact-host TLS proxy, production API and Next.js builds. No production data, live provider, live charge, deployment, or public-host mutation was used.

| Command | Result |
| --- | --- |
| `corepack pnpm typecheck` | Passed for all four workspace projects before the browser gate |
| `corepack pnpm --dir apps/web typecheck` | Passed after the final Ninjamation route correction |
| `corepack pnpm --dir apps/api exec tsx --test test/phase51-route-applications.test.ts test/core-module-deep-link-routing.test.ts` | 6 passed, 0 failed |
| Focused Phase 31/33/34/36 and Ninja Pool Hall domain/static/physics/rules/recovery suite plus the Phase 51 route contracts | 55 passed, 0 failed, 0 skipped |
| `node scripts/phase51-creative-routes-browser.mjs` | Production API build passed; production Next.js build passed; 5 exact-host browser tests passed in 1.8 minutes |

The browser gate covered all 44 declared canonical routes, back/forward/reload behavior, one-tab navigation, 15 automated axe scans with zero violations, desktop/tablet/mobile overflow checks, and console/HTTP 5xx rejection. Desktop and mobile screenshots for each module are stored in `docs/phase-51/evidence/`.

## Remaining external gates

- Re-run the same exact-host suite against the deployed production hosts after an authorized deployment.
- Exercise any configured live AI/sync providers with approved non-production provider credentials. Deterministic or provider-disabled behavior is not represented as live-provider success.
- Online multi-user game acceptance on the target deployment remains a deployment gate; local deterministic rule, physics, recovery, and authenticated route behavior are proven here.
