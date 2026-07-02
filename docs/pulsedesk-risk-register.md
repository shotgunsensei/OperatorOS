# PulseDesk Risk Register

Phase 12 imported PulseDesk and added an OperatorOS adapter/shell. Phase 13
converted the active PulseDesk login, registration, and billing entry points to
OperatorOS-managed behavior and hardened protected module APIs behind
OperatorOS SSO plus entitlement checks.

## High Risks

### Residual Local Auth Compatibility Code

The imported PulseDesk source still contains legacy auth route code for audit
and compatibility, but active production login/register behavior now returns
managed-by-OperatorOS responses:

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/auth/switch-org`
- `client/src/lib/auth.tsx`

Risk: future edits could accidentally re-enable local credential login or make
old sessions valid again.

Mitigation: keep `requireAuth` bound to `req.session.authSource ===
"operatoros"`, keep local `login()`/`register()` client helpers disabled, and
cover the managed-auth behavior with static and manual QA checks.
The active settings UI now points profile security and SSO administration back
to OperatorOS; the legacy auth settings component remains only as imported
source audit context.

### Residual Stripe Files Still Imported

The imported source still contains legacy Stripe support files for history and
future Phase 16 consolidation:

- `server/routes/billing.ts`
- `server/stripeClient.ts`
- `server/webhookHandlers.ts`
- `server/services/billingSync.ts`
- `shared/billingConfig.ts`
- `STRIPE_SETUP.md`

Risk: a future route mount or UI link could accidentally make PulseDesk a
second billing authority.

Mitigation: `server/routes/billing.ts` now returns OperatorOS-managed
compatibility responses and no longer creates Stripe checkout or portal
sessions. Phase 16 should archive or remove unused legacy billing files after
central OperatorOS billing is verified.

### Module-Local Master Admin Defaults

The imported source includes module-local master admin behavior tied to
`john@shotgunninjas.com`.

Risk: root admin authority could be applied inconsistently if PulseDesk-local
checks diverge from OperatorOS server-side root super-admin enforcement.

Mitigation: Phase 13 requires OperatorOS SSO before imported super-admin checks
run. A later deeper merge should replace the imported master-admin compatibility
file with shared OperatorOS platform admin helpers directly.

### Separate Org Model

PulseDesk has its own `orgs` and `memberships` tables, plus
OperatorOS snapshot fields.

Risk: tenant/org drift can allow confusing access state or cross-tenant data
exposure if queries use local org IDs without validating OperatorOS tenant
membership and entitlement state.

Mitigation: Phase 13 requires OperatorOS SSO and an active PulseDesk
entitlement snapshot before protected API route handlers run. Continue auditing
all data queries for explicit org/tenant filters.

## Medium Risks

### Full App Is Not Mounted Inside Next Yet

The OperatorOS Next.js shell presents PulseDesk as a launchable module, while
the full imported PulseDesk Vite app remains a child runtime behind SSO.

Risk: feature routes are present in the imported source but not fully exercised
inside the OperatorOS Next.js surface.

Mitigation: preserve the standalone runtime behind OperatorOS SSO until a
future phase intentionally embeds or rewrites deeper PulseDesk surfaces.

### Healthcare Data Sensitivity

PulseDesk is healthcare operations software.

Risk: workflow data may be sensitive even when it is not formally stored as PHI.

Mitigation: avoid logging tokens, secrets, patient data, or private operations
payloads. Keep tenant filters mandatory and audit admin/security actions.

### Legacy Docs Can Confuse Deployment

The imported source contains archived or legacy Stripe setup documentation.

Risk: operators may follow PulseDesk-local billing setup instead of OperatorOS
billing setup.

Mitigation: keep OperatorOS runbooks clear that PulseDesk-local billing is not
the active production path. Archive or rewrite obsolete billing docs in Phase
16.

## Manual QA Checklist

- PulseDesk source snapshot exists at `apps/modules/pulsedesk/source`.
- PulseDesk loads from `/app/apps/pulsedesk` after Command Center launch.
- PulseDesk resolves from `/modules/pulsedesk` local fallback.
- `pulsedesk.operatoros.net` resolves to the PulseDesk shell when host routing
  is enabled.
- Logged-out direct visit redirects to OperatorOS login.
- Missing entitlement is blocked before the shell opens.
- `john@shotgunninjas.com` root platform super-admin is allowed through
  server-side OperatorOS platform admin checks.
- Tenant admin sees module settings controls only for authorized tenant scope.
- Normal user sees clinical operations workflows without admin controls.
- Existing PulseDesk feature routes are still present in imported source.
- PulseDesk-local login/register is not linked from OperatorOS shell.
- `/login` shows an OperatorOS launch/relaunch page.
- PulseDesk-local checkout is not linked from OperatorOS shell.
- `/api/billing/checkout` returns managed-by-OperatorOS behavior if mounted.
- No real secrets are present in imported source.

## Recommended Priority

1. Finish any live SSO token verification that requires deployed OperatorOS
   infrastructure.
2. Keep auditing PulseDesk feature queries for tenant/org filter consistency.
3. Replace module-local admin compatibility code with direct OperatorOS helpers
   during the deeper source merge.
4. Phase 16: centralize remaining Stripe files and entitlement updates under
   OperatorOS billing.
