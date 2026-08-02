# OperatorOS Phase 18 human completion guide

Prepared: 2026-08-02
Scope: OperatorOS plus all thirteen active modules
Goal: finish the production, provider, and rollback gates that require the
owner, Replit, production PostgreSQL, DNS/TLS, or live provider accounts.

## What is already complete

Do not repeat local restoration work unless the final merge changes runtime
code. The current candidate has passed:

- 45/45 active registry, release, provider, preflight, and Replit contracts;
- database release v33/33 plan, clean apply, and idempotent reapply;
- 914 passed, 0 failed, and 6 intentional HTTP-only skips across 920 API tests;
- API, runner, and web typechecks plus the Next 15.5.22 production build;
- strict compiled supervisor health/readiness with database v33/33, SSO, and
  the shared worker configured;
- 12/12 local canonical-host browser scenarios across all thirteen modules;
- 2/2 compiled first-screen scenarios, including the deterministic OutCall
  verified-self/profile/trigger/schedule workflow and denial.

These results prove the source/local state-4 ecosystem. They do not prove that
the final commit is deployed, providers are live, production data is backed up,
or rollback works.

## Hard stop rules

Stop the release immediately if any of these conditions occurs:

- the deployed Git commit differs from the reviewed `origin/main` commit;
- `/readyz` is not HTTP 200 with database release v33/33;
- the 48-check public verifier is not 48/48;
- any production-safe browser scenario fails;
- a secret, OTP, phone number, database URL, cookie, or provider signature is
  exposed in a log, screenshot, issue, document, or Git diff;
- a tenant can see or mutate another tenant's data;
- a module launches without its entitlement;
- Stripe, Twilio, Resend, or OpenAI is in the wrong account or mode;
- a provider callback is unsigned, points at a retired host, or cannot reject a
  replay/tampered request;
- the backup has no readable table-of-contents and SHA-256 checksum;
- the rollback owner, rollback commit, or restored-database switch is unknown.

Do not run child migrations, `drizzle-kit push`, ad hoc SQL directories, or the
local `e2e/sso-v1.spec.ts` against production. The local test registers users
and performs direct database setup. Use only the production-safe deployed 3/3
gate described below.

## Release worksheet

Record values in a protected operations record, never in this repository.

| Evidence | Required value |
| --- | --- |
| Release owner | Name and UTC start time |
| Reviewed Git commit | Full 40-character `origin/main` SHA |
| Replit deployment/build | Deployment ID and build ID |
| Deployment time | UTC timestamp |
| Database | Provider, PostgreSQL version, and release before/after |
| Provider backup | Snapshot ID and UTC timestamp |
| Logical backup | Encrypted location, bytes, SHA-256, and TOC result |
| Stripe | Account ID, mode, webhook endpoint ID, safe Price IDs |
| Resend | Account/domain and delivered message ID |
| Twilio | Account SID suffix, Verify service SID, owned-line suffix |
| OpenAI | Project/account and successful request ID |
| Browser acceptance | 3/3 result and UTC timestamp |
| OutCall acceptance | Safe provider IDs and each PASS/FAIL result |
| Rollback | Last-known-good commit and restored-database target |

## Step 1 - Freeze the exact candidate

Run from `C:\Dev\OperatorOS` in PowerShell:

```powershell
git fetch --prune origin
git switch main
git pull --ff-only origin main
$candidate = (git rev-parse HEAD).Trim()
if ($candidate -ne (git rev-parse origin/main).Trim()) {
  throw 'Local main does not match origin/main'
}
git status --short

$env:CI = 'true'
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
$env:INTERNAL_API_URL = 'http://localhost:5001'
corepack pnpm build:production
corepack pnpm db:plan
```

Require a clean worktree, release version 33, 33 ordered non-destructive steps,
and final step `outcall_product_operations`. The deployment must later expose
the same `$candidate` through health and readiness.

## Step 2 - Resolve the remaining account decisions

Complete these owner decisions before entering live values:

1. **Stripe mode:** `.replit` currently documents `STRIPE_MODE=test`. Keep it
   only for a sandbox launch. A revenue-live promotion requires explicit owner
   approval, reviewed live keys/prices, a low-risk live transaction and refund,
   and a source/config change that makes production mode intentionally `live`.
2. **Legacy add-on prices:** reconfirm
   `STRIPE_PRICE_ADDON_NINJA_LAUNCH_KIT` and
   `STRIPE_PRICE_ADDON_STUDYFORGE_AI`. The prior handoff reported old live-mode
   IDs that fail under the sandbox key. Replace them with correct same-mode
   $49/month prices, or remove them so checkout fails closed.
3. **OutCall commercial price:** create and set
   `STRIPE_PRICE_ADDON_OUTCALL` only when OutCall is intentionally purchasable.
   Entitled accounts can launch the module without pretending checkout is ready.
4. **OpenAI quota:** fund the intended OpenAI project/account and rerun the AI
   profile. A present key that returns `insufficient_quota` is not AI-ready.
5. **Twilio authority:** use the intended production account and owned numbers.
   The Replit connector may support CallCommand, but signed webhooks and OutCall
   require the primary `TWILIO_AUTH_TOKEN` in the deployment secret manager.

## Step 3 - Configure Replit Publishing

Enter secrets only in **Publishing -> Edit Commands and Secrets**. Development
workspace values do not prove that the published deployment received them.

### Core required values

- `DATABASE_URL`
- `SESSION_SECRET` (high entropy, 24+ characters)
- `SSO_CODE_ENCRYPTION_SECRET` (independent, high entropy, 32+ characters)
- `APP_ENV=production`
- `NODE_ENV=production`
- `OPERATOROS_BASE_URL=https://operatoros.net`
- `OPERATOROS_APPS_URL=https://app.operatoros.net/`
- `INTERNAL_API_URL=http://localhost:5001`
- `OPERATOROS_DATABASE_RELEASE_MODE=apply`
- `TRUST_PROXY=true`
- `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL=john@shotgunninjas.com`
- all thirteen canonical module URL values from
  `config/production-environment.contract.json`

Leave `APP_URL`, `COOKIE_DOMAIN`, `NEXT_PUBLIC_API_URL`,
`OPERATOROS_DATABASE_RELEASE_APPLIED`, `OUTCALL_TEST_ADAPTER`, and
`CALLCOMMAND_TEST_ADAPTER` unset. Leave `ALLOW_LEGACY_SSO_ROLLBACK` and
`ALLOW_UNSAFE_COMMANDS` unset or false. Never set a parent-domain session
cookie.

### Revenue and email

- Stripe secret key, webhook signing secret, intentional `STRIPE_MODE`, five
  shared plan/seat Price IDs, and each intentionally sellable add-on Price ID;
- `RESEND_API_KEY` and the verified Shotgun Ninjas sender variable used by the
  deployment;
- verify that `shotgunninjas.com` remains verified in the selected Resend
  account.

### CallCommand

- a bound Replit Twilio connector or `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`;
- `TWILIO_PUBLIC_BASE_URL=https://callcommand-ai.operatoros.net`.

### OutCall

- `OUTCALL_PUBLIC_URL=https://outcall.operatoros.net`
- independent versioned `OUTCALL_FIELD_ENCRYPTION_KEY` and
  `OUTCALL_LOOKUP_HMAC_KEY` (32+ characters each; never reuse session/SSO keys)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- optional outbound API-key pair `TWILIO_API_KEY_SID` and
  `TWILIO_API_KEY_SECRET`
- `TWILIO_VERIFY_SERVICE_SID`
- `TWILIO_PHONE_NUMBER` (approved owned E.164 line)
- `TWILIO_ALLOWED_COUNTRIES=US,CA` or the narrower approved controlled set
- `OUTCALL_LIVE_PROVIDER` absent/disabled until the controlled provider gate;
  set exactly `enabled` only for that accepted activation step

Configure the Twilio inbound SMS callback exactly as:

`https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/sms`

OperatorOS generates the voice status and gather callbacks for each controlled
call. Do not replace them with a generic or standalone-domain callback.

### AI

- `OPENAI_API_KEY`
- reviewed model/project variables already documented by the repository

## Step 4 - Run production preflight

Run profiles separately first so failures have one owner:

```powershell
corepack pnpm preflight:production -- --core
corepack pnpm preflight:production -- --revenue-ready
corepack pnpm preflight:production -- --email-ready
corepack pnpm preflight:production -- --callcommand-ready
corepack pnpm preflight:production -- --ai-ready
```

Before OutCall activation, the first five profiles must pass. After the
controlled Twilio configuration is reviewed and
`OUTCALL_LIVE_PROVIDER=enabled` is deliberately set, run:

```powershell
corepack pnpm preflight:production -- --outcall-ready
corepack pnpm preflight:production -- --all
```

Require PASS for `core`, `revenue`, `email`, `callcommand`, `outcall`, and
`ai`. The preflight prints variable names but must not print values.

## Step 5 - Back up production before release v33

1. Capture a provider-managed encrypted snapshot and confirm its ID/status.
2. From a trusted operator workstation with `DATABASE_URL` supplied by the
   secret manager, create the encrypted logical archive:

   ```powershell
   pg_dump --format=custom --no-owner --no-acl --file operatoros.dump $env:DATABASE_URL
   pg_restore --list operatoros.dump
   Get-FileHash -Algorithm SHA256 -LiteralPath operatoros.dump
   ```

3. Record UTC time, commit, PostgreSQL version, byte size, duration, protected
   location, SHA-256, and readable TOC result.
4. Prefer a restore rehearsal into a new isolated database with all providers
   disabled. Do not restore over production in place.

## Step 6 - Deploy the exact merged commit

In the OperatorOS Replit autoscale deployment:

1. select the reviewed `$candidate` from `origin/main`;
2. confirm the checked-in build command performs a frozen pnpm install and
   `pnpm build:production`;
3. confirm the run command is `node scripts/start-unified-runtime.mjs`;
4. start the deployment and watch the ordered v33 release;
5. require the log message `Fastify ready; starting Next` before public Next
   starts;
6. record Replit deployment ID, build ID, Git commit, and UTC timestamp.

The supervisor owns the production v33 apply. Do not separately run an ad hoc
production `db:apply` while the deployment is starting.

## Step 7 - Prove public identity and all 17 hosts

Set the commit pin and run the read-only verifier:

```powershell
$env:OPERATOROS_EXPECTED_RELEASE_COMMIT = $candidate
corepack pnpm verify:production
```

Require 48/48. `/api/health` and `/readyz` must expose the same exact commit,
build identity, valid timestamps, and database release v33/33.

Confirm valid TLS and expected host behavior for:

- `operatoros.net`, `app.operatoros.net`, `auth.operatoros.net`,
  `api.operatoros.net`;
- `tradeflowkit`, `torqueshed`, `techdeck`, `pulsedesk`, `faultlinelab`,
  `ninja-pool-hall`, `brandforgeos`, `snapproofos`, `studyforge-ai`,
  `ninjalaunchkit`, `callcommand-ai`, `ninjamation`, and `outcall` under
  `.operatoros.net`.

The Replit alias is not an SSO callback, CORS origin, or return target.

## Step 8 - Run the production-safe authenticated 3/3 gate

Provision two synthetic accounts in the intended production tenant system:

- one active tenant entitled to all thirteen modules;
- one active tenant deliberately denied both TechDeck and OutCall.

Load the six values below from a protected secret manager into the current
PowerShell process. Do not record them in shell history or screenshots.

```powershell
$env:E2E_PHASE17_EMAIL = '<entitled acceptance user>'
$env:E2E_PHASE17_PASSWORD = '<secret>'
$env:E2E_PHASE17_TENANT_ID = '<entitled tenant UUID>'
$env:E2E_PHASE17_DENIED_EMAIL = '<denied acceptance user>'
$env:E2E_PHASE17_DENIED_PASSWORD = '<secret>'
$env:E2E_PHASE17_DENIED_TENANT_ID = '<tenant UUID denied TechDeck and OutCall>'
Remove-Item Env:E2E_PRODUCTION_HOSTS -ErrorAction SilentlyContinue
corepack pnpm --dir apps/web test:e2e:phase17-deployed
```

The script name is historical; its current contract requires thirteen enabled
modules and active OutCall denial. Require 3/3:

1. one login launches every enabled module and global logout revokes siblings;
2. TechDeck local logout preserves the PulseDesk sibling session;
3. the denied tenant receives `MODULE_ACCESS_DENIED` for TechDeck and OutCall
   with no handoff URL.

Clear all six `E2E_PHASE17_*` variables after the run.

## Step 9 - Execute controlled provider acceptance

Use synthetic, owner-controlled data only. Record provider IDs in the protected
evidence record, not in Git.

### Resend

- send one invite to a controlled non-customer mailbox;
- confirm delivery and accept the invite through normal review;
- record the safe message ID and final PASS/FAIL.

### OpenAI

- after funding the intended project, run one bounded shared AI generation;
- require a real successful provider response and one usage event;
- confirm no prompt/customer secret appears in logs;
- record the request ID and PASS/FAIL.

### Stripe

- first repeat sandbox checkout/webhook/cancel/duplicate/tamper checks using
  same-mode Price IDs;
- for live cutover, obtain explicit owner approval for one low-risk transaction
  and refund;
- verify entitlement grant, seat math, tenant isolation, webhook signature,
  idempotency, cancellation, and refund reconciliation;
- immediately stop if any test/live mode mismatch occurs.

### CallCommand

- confirm the owned line and signed callback base;
- place only the approved controlled consent-first call;
- verify consent, suppression, callback signature/replay handling, disposition,
  and recording-off behavior.

### OutCall verified-self sequence

Set `OUTCALL_LIVE_PROVIDER=enabled` only when ready to run this exact sequence:

1. accept the non-emergency safety boundary;
2. send one Verify challenge to the owner's controlled `+1` number;
3. submit the OTP through the product; never record the OTP;
4. create one neutral profile and private exact-match trigger;
5. schedule one immediate verified-self call;
6. acknowledge by DTMF and confirm signed status/gather callbacks;
7. send one private trigger SMS to the owned OutCall number;
8. replay one captured provider callback and require duplicate-ignore behavior;
9. tamper with a callback signature and require rejection;
10. schedule then cancel one delayed request and confirm no call occurs;
11. download the private export and confirm masking/protected fields;
12. use a separate disposable acceptance identity to test password-confirmed
    `DELETE OUTCALL`, confirming central audit and billing usage remain.

OutCall must never call an arbitrary destination, record audio, impersonate a
person, claim emergency dispatch, expose a trigger phrase, or broaden beyond
the approved verified-self boundary. If any provider step fails, set
`OUTCALL_LIVE_PROVIDER` back to disabled/absent and keep the module visible but
provider actions fail-closed.

## Step 10 - Promotion decision and rollback proof

Promote only when all of these are true on one exact deployed commit:

- production preflight PASS for every marketed provider profile;
- provider snapshot and logical backup accepted;
- supervisor release v33/33 and readiness PASS;
- public verifier 48/48;
- production-safe authenticated browser 3/3;
- controlled Resend, OpenAI, Stripe, CallCommand, and OutCall scopes either PASS
  or are explicitly disabled and not marketed as live;
- rollback target and owner are recorded.

Application rollback: redeploy the last-known-good reviewed commit, pin
`OPERATOROS_EXPECTED_RELEASE_COMMIT` to it, and rerun the public verifier.

Database rollback: restore the accepted archive into a **new** database, run
the supported release/readiness checks with providers disabled, then switch
`DATABASE_URL`/traffic after review. Never overwrite the production database in
place. Release v33 is additive; an application rollback normally leaves its
tables in place unless a verified restore is required.

## Final sign-off

| Gate | Owner initials | UTC | Result/evidence reference |
| --- | --- | --- | --- |
| Exact merged commit/build |  |  |  |
| Core/provider preflight |  |  |  |
| Snapshot and logical backup |  |  |  |
| v33/33 supervisor readiness |  |  |  |
| Public verifier 48/48 |  |  |  |
| Deployed browser 3/3 |  |  |  |
| Resend |  |  |  |
| OpenAI |  |  |  |
| Stripe |  |  |  |
| CallCommand |  |  |  |
| OutCall |  |  |  |
| Rollback proof |  |  |  |

Final decision: **PROMOTE / HOLD / ROLLBACK**
Owner signature: ______________________________
UTC timestamp: ________________________________
