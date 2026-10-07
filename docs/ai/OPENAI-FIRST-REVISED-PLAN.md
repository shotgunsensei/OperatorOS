# OpenAI-first implementation decision — 2026-10-07

Status: bounded local implementation and offline verification complete on the
isolated local branch. Push, hosted CI, merge, publication, live provider calls and
production database changes remain gated. See [implementation evidence](IMPLEMENTATION-EVIDENCE.md).
The [local review of bfd9bf0d](LOCAL-REVIEW-2026-10-07.md) verifies legacy
compatibility, retry accounting, populated v65 upgrades and visible error states.

## Evidence and decisions

The full 1,193-line Library plan (`libfile_c60ec2c7f9a88191ab5345bdae09bb29`)
was read. Canonical and remote main are `5b50b2cadd815ba1c6de1af79deb04e8971af0b4`.
Read-only public health on October 7 reports serving commit `5b50b2ca`, build
`224589f065463d1b7a8db358`, reviewed lock fingerprint and database v65/65.
The October 6 acceptance for `0ea0f792db70936c95f60be41fbf457da3fdbf91`
is historical. Current health proves identity/liveness, not authenticated customer
acceptance, and this local slice has not been deployed.
Replit autoscale runs the existing Next/Fastify/PostgreSQL runtime. OperatorOS
owns auth, tenants, roles, entitlements, billing, module policy and audit.

`ai-provider.ts` already defines a shared completion interface, live Chat
Completions adapter and test-only deterministic provider. Shared adapters expose
configured/disabled/test states. Torque Assist has durable credit reservations,
idempotency, response validation and provider circuits. Existing action credits
are not provider-dollar budgets. `agent.ts` and the legacy script generator in
`index.ts` still call OpenAI directly; this slice does not claim a global cap.

Keep the existing runtime, monorepo, identity and storage. Add Responses behind
the existing interface; do not introduce a parallel package tree, managed agent
runtime, ten specialists, device automation, Vercel or Supabase migration.

## Selected customer outcome

A TechDeck member with write access requests IT operations guidance and receives
a structured, documentation-only answer requiring operator review. The existing
`TechDeckLiteralConsole` → `/v1/modules/techdeck/itops/query` → tenant/module/write
guards → shared provider → shared activity path is the integration point. No
commands or device actions execute. Existing tenant authority remains server-owned.
The console previously discarded the guidance response; this slice now renders
it, binds it to the tenant view and reuses the request key for safe replays.

## Revised stages

1. Inventory current authority, flows, providers, deployment and costs; preserve
   landing integration `5aedd03da26f54fe4bf54dcce698ee04eb7d21b5` on its existing
   branch/worktree (its SBOM is locally modified; leave it untouched).
2. Extend the shared completion contract with a stateless Responses adapter and
   measured input/output/cache usage. Use `store:false`, no tools and no retries.
3. Add an additive release step for tenant monetary policies and durable request
   reservations. Default disabled, no policy rows or positive budget seeds.
   Reserve before dispatch; settle measured cost; retain uncertain charges.
4. Exercise one TechDeck flow with synthetic offline fixtures, concurrency,
   tenant/role/entitlement denials, invalid output and unknown usage tests.
   Stages 1-4 are locally complete: 21 focused API/browser checks, production
   build/typechecks and disposable v66 migration/startup verification pass.
   The subsequent review passes 43 selected compatibility/API/browser checks
   and a real populated v65-to-v66 upgrade/reapply preserving complete snapshots.
   Shared telemetry retains safe usage counts without weakening secret filtering;
   completed and failed retries do not add usage or provider calls.
5. After approved spend/CI/deployment gates, validate configured model access,
   backup/apply, exact deployed release and non-admin customer acceptance. Then
   extend existing credit-controlled flows. Choose routing using domain evals,
   not model self-confidence or automatic frontier escalation.
6. Consider specialists/retrieval only for measured unmet requirements. A later
   TechDeck computer-use pilot needs a separately approved isolated sandbox and
   signed endpoint boundary; ADR-0014 remains in force.

## Costs and human gates

Incremental spend for this local slice: $0. No API, retrieval, image, message or
computer-use provider calls. Reuse installed local dependencies and disposable
loopback PostgreSQL. Current subscription invoices are not verified; the plan's
$145–180 total is not an inventory of John's actual bill.

| Item | Current evidence / decision |
| --- | --- |
| ChatGPT/Codex | Existing account; usage read reports 1% weekly consumed, no credits. Invoice unverified; no purchase or model change. |
| GitHub Actions | Delegated evidence says 2,000/2,000 included minutes exhausted; enforced $0 cap unverified. No push or hosted CI. |
| Replit/PostgreSQL | Existing production runtime; current invoice and usage ceiling unverified. Preserve deployment. |
| OpenAI API | Separate billed usage; project/model access and hard limits unverified. New workflow disabled with no tenant policy by default. |
| Stripe | Existing authoritative catalog/settlement. No paid transaction or catalog mutation. |
| Vercel/Supabase | Named in plan; not required by active architecture. No migration or subscription. |
| Retrieval | Free storage allowance does not imply free retrieval/model calls. No store/upload/call. |

The parent independently verified on 2026-10-07 that the plan confused Batch/Flex
with Standard. Reported Standard short-context input/output USD per million:
GPT-6 Luna 0.10/0.50, Sol 2/10, Astra 10/50, GPT-6.1 Sol 2/10.
These are dated reference facts, not production defaults or project entitlement.
Runtime config must supply approved rates, model and effective date explicitly.
Cache reads/writes need separate accounting; output already includes reasoning.
Missing usage remains unknown/reserved, never zero. Provider hard limits can
overshoot slightly; application reservations remain necessary. These application
budgets govern only the selected TechDeck flow. Legacy AI and voice calls remain
outside them. There is no global account spending-cap claim.

Sources: [pricing](https://developers.openai.com/api/docs/pricing),
[prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching),
[spend limits](https://developers.openai.com/api/docs/guides/spend-limits),
[ChatGPT sign-in eligibility](https://developers.openai.com/siwc/quickstart).
Hosted paid OperatorOS eligibility for ChatGPT-plan OAuth is unverified; no
assistant credentials or OAuth changes are authorized. Managed Agents is not
required and introduces a separate residency/retention decision.

Required human decisions: confirm GitHub enforced $0 Actions spending and how
to validate the exhausted quota before push; later approve a numeric per-call,
daily and monthly tenant budget, provider/model/rates and a synthetic live test;
then approve backup/apply/publication once exact local and CI evidence is ready.
Standing release authority does not authorize new spending.

Four inherited patched advisory exceptions remain disclosed and must pass their
existing integrity and installed-package regressions: GHSA-5p2g-fcmc-qvqq,
GHSA-w3rx-r6r6-pgpr, GHSA-86w9-cpqp-85rv, GHSA-vfj7-8cjw-p6xm.
