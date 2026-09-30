# OperatorOS OpenAI feature acceptance — 2026-09-30

Status: **LOCAL REAL-PROVIDER CHECKS PASSED / HOSTED CREDENTIAL RECOVERY REQUIRED**.

The owner authorized inspection of all 13 registered modules, secure creation
of a new OpenAI project key, and insertion into the ignored local env file.
The candidate branch is `codex/openai-module-enablement`, based on `737a9d0f`.
This record does not replace the published v65 source/database identity.
Source synchronization, publication and authenticated target acceptance remain
separate gates.

## Credential and configuration

- Created key `Codex-OpOS` in the OperatorOS project of Shotgun Ninjas Productions.
  The selected expiration was one year. No credential value is in this record.
- Saved server-only `OPENAI_API_KEY` to ignored `C:\Dev\OperatorOS\.env.local`
  through the encrypted setup helper. The helper printed no plaintext key.
- API development startup now loads the optional root `.env.local`. Existing
  process environment values take precedence, including stale shell values.
- `OPENAI_MODEL` now actually selects the shared text model; credential/model
  changes rebuild the cached adapter. Default: `gpt-4o-mini`.
- Documented `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`. The agent and
  deployment explanation currently use their existing `gpt-4o` selection.

Replit editor-runtime synthetic connectivity returned **HTTP 401,
`invalid_api_key`**. Its Secrets screen shows both project and linked-account
`OPENAI_API_KEY`, with a warning that the account value takes precedence. Secret
values stayed masked. This probe establishes the editor runtime's failure;
the separately published deployment's credential was not directly tested.

The hosted correction is to remove the conflicting account-secret link from
this project and replace its project-only key through Secrets, then check the
published secret configuration. Do not rotate a shared account key merely to
fix this app. Browser credential-entry policy requires the owner to enter,
confirm and submit the new value; no credential is sent to a coding agent.

## Module audit and real OpenAI evidence

All requests used synthetic content and a loopback disposable PostgreSQL 16
database, `operatoros_openai_disposable`, port 55470, root-verified at v65/65.
The key was real; fixtures and token credits were synthetic. Tests never used
either Replit database. No script or runner command was executed, no phone call
or message was sent, and no payment was collected.

| Registered module / platform | OpenAI-dependent active features | Current acceptance |
| --- | --- | --- |
| OperatorOS | Six AI tools; agent model/tool-call loop; deployment explanation | Six tools persist successful tenant logs. Agent makes a real `gpt-4o` tool call using an isolated synthetic handler. Actual runner execution stays disabled; deployment explanation route was inspected but not exercised. |
| BrandForge OS (`brandforgeos`) | Copy variants, strategy, campaign ideas | All three generation routes return validated real-provider output and persist it. |
| StudyForge AI | Deck, quiz, study plan, complete study set, older flashcard session | All five paths pass. Complete set records effective mode `ai`; legacy cards exactly match the real provider response. Source grounding remains enforced. |
| Deploy Ops / Ninja Launch Kit | Eight launch artifacts; complete product launch kit | Both paths pass with real-provider provenance, complete structure and persisted drafts; no publication or message delivery. |
| Script Ops / NinjaMation | Basic and product script generation | Both routes pass. Scripts are persisted inert drafts requiring review; execution is unavailable. |
| TechDeck | IT operations guidance; optional Resolution Intelligence embeddings | Guidance passes as documentation only. Real `text-embedding-3-small` adapter returns 512 dimensions. Semantic indexing/tenant consent/vector provisioning stay disabled and are not accepted by this adapter check. |
| TorqueShed / Torque Assist | Evidence-ranked diagnostic assistance | Provider schema passes; full request workflow persists output and settles exactly one token debit against explicitly synthetic local credit. Real credit purchase/payment acceptance is separate. |
| CallCommand AI | Receptionist turn, transcript analysis, outbound transcript summary, recording transcription; Realtime SIP | First four provider paths pass, including synthetic audio transcription. Telephone routing, recording callback ingestion and signed Realtime SIP acceptance remain open. |
| TradeFlowKit | No direct OpenAI dependency found in active module runtime | Core module does not require this key. Shared OperatorOS assistance is separate. |
| PulseDesk | No direct OpenAI dependency found in active module runtime | Core clinical coordination does not require this key; no PHI sent to OpenAI. |
| FaultlineLab | No direct OpenAI dependency found in active module runtime | Existing deterministic challenge workflows do not require this key. |
| SnapProofOS | No direct OpenAI dependency found in active module runtime | Evidence/proof workflows do not require this key. |
| Operator Pool Hall | No direct OpenAI dependency found in active module runtime | Game and practice workflows do not require this key. |
| OutCall | No direct OpenAI dependency found in active module runtime | Its telephony/provider dependencies are separate from the OpenAI-powered CallCommand paths. |

The audit covers active `apps/api`, `apps/web` and the canonical module catalog.
Imported `apps/modules/*/source` trees remain read-only migration evidence.

## Fixes

- Shared AI adapter honored neither the selected model nor credential rotation.
  It now honors both without weakening deterministic provider isolation.
- Several prompts requested JSON without its exact validated structure. Added
  explicit contracts for BrandForge, StudyForge, launch artifacts, complete kits
  and CallCommand analysis.
- StudyForge complete-set questions could lose the words needed for source
  grounding. Its prompt now anchors questions and answers to source wording;
  a bounded retry includes validator feedback. Source validation is unchanged.
- Complete launch-kit validation accepted malformed nested artifact objects.
  It now validates nested ad/email/FAQ fields, array/text limits and email days,
  preserving day 0 launch emails and honest deterministic fallback.
- AI Tools provider labels now report OpenAI, Test provider or Unavailable.

Affected files: `.env.example`; `apps/api/package.json`;
`apps/api/src/lib/{ai-provider,callcommand-phase35,ninja-launch-kit-phase34,studyforge-phase33}.ts`;
`apps/api/src/routes/{brandforgeos-routes,ninja-launch-kit-routes,ninja-launch-kit-phase34-routes,studyforge-routes}.ts`;
`apps/api/test/{ai-provider-configuration,ninja-launch-kit-phase34-domain,studyforge-phase33-domain}.test.ts`;
`apps/web/src/components/pages/AiToolsPage.tsx` and the acceptance/status/parity docs.

## Verification

Environment: Windows, Node 24.16.0, pnpm 10.34.5; isolated PostgreSQL 16.

- Real OpenAI checks: **27 passed / 0 failed**, in three recorded batches
  (19 core, 5 complete/audio, 3 legacy/ledger/agent boundaries).
- Focused provider/base-module regression command: **16 passed / 0 failed /
  0 skipped**. Files: `ai-provider-configuration`,
  `provider-isolation-production-artifact`, `brandforgeos-db`, `studyforge-db`,
  `ninja-launch-kit-db`, `callcommand-phase35-domain`.
- Extended regression command: **46 passed / 0 failed / 0 skipped**. Files:
  `studyforge-phase33-domain`, `studyforge-phase33-db`,
  `ninja-launch-kit-phase34-domain`, `ninja-launch-kit-phase34-db`,
  `ninjamation-phase36-domain`, `ninjamation-phase36-db`,
  `torque-assist-domain`, `torque-assist-workflow`,
  `techdeck-resolution-semantic` (portable/non-vector mode).
- Both regression commands use `corepack pnpm --dir apps/api exec tsx --test
  --test-concurrency=1` with `APP_ENV=test`, `NODE_ENV=test`, synthetic
  `SESSION_SECRET`, disposable `DATABASE_URL`; extended semantic checks also
  require `PARITY_DATABASE_IS_DISPOSABLE=1`. No live key is loaded for tests.
- The first extended run correctly refused semantic cases because the required
  disposable marker was absent. Adding the marker reran all 46 successfully;
  no production check or validator was weakened.
- Fresh `corepack pnpm lint`: pass. This command exists in the current package
  despite the older AGENTS note saying no lint command exists.
- Fresh `corepack pnpm build:production`, with
  `INTERNAL_API_URL=http://localhost:5001`: pass, including workspace typechecks,
  API/runner builds and the Next production build.
- `git diff --check`: pass. No dependency/schema/auth/billing/SSO change.

These checks establish bounded local workflow/provider behavior. Model output
is stochastic; one accepted synthetic case is not a guarantee for every input.
Published SSO, other-role/tenant browser behavior and real-user acceptance must
be verified on the approved deployed candidate.

## Remaining setup and rollback

1. Owner completes Replit project-secret recovery; restart the affected runtime
   and rerun a synthetic provider check. Check publication secrets separately.
2. Review this source candidate before authorized synchronization/publication.
   Existing v65 schema needs no migration for these changes.
3. CallCommand Realtime additionally requires `OPENAI_PROJECT_ID`,
   `OPENAI_WEBHOOK_SECRET`, `CALLCOMMAND_SIP_ROUTE_SECRET`, an allowlisted
   `CALLCOMMAND_REALTIME_MODEL` and the existing Twilio/number/webhook setup.
   These are not supplied by creating a chat API key.
4. TechDeck semantic activation requires explicit owner/provider review,
   reviewed tenant excerpts/consent, `TECHDECK_EMBEDDINGS_ENABLED=1`, an explicit
   model/dimensions configuration and reviewed vector provisioning. Prior
   production disablement remains in effect.
5. Actual agent runner, deployment-advisor route, telephone transport/recording
   callback and real Torque Assist credit purchasing remain separate acceptance.

Rollback: revert the scoped source commit; restore the prior environment
configuration through its secret manager if needed. Revoke the new project key
through OpenAI if abandoning it. No database rollback is required.

Primary configuration references:
[OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs),
[embeddings](https://developers.openai.com/api/docs/guides/embeddings),
[audio](https://developers.openai.com/api/docs/guides/audio) and
[Node env-file loading](https://nodejs.org/docs/latest-v20.x/api/cli.html#--env-file-if-existsconfig).
