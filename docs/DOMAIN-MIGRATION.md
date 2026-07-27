# OperatorOS Domain Consolidation Status

Status: canonical domains already attached in Replit as of 2026-07-13. There
is no pending DNS migration in this repository.

OperatorOS now treats these addresses as the canonical attached hostnames. The
four platform hosts and thirteen enabled module hosts are active application
and SSO surfaces:

- Platform: `operatoros.net`, `app.operatoros.net`, `auth.operatoros.net`, and
  `api.operatoros.net`
- Core: `tradeflowkit.operatoros.net`, `techdeck.operatoros.net`, and
  `pulsedesk.operatoros.net`
- Free: `torqueshed.operatoros.net`, `faultlinelab.operatoros.net`, and
  `ninja-pool-hall.operatoros.net`
- Enabled add-ons: `brandforgeos.operatoros.net`, `snapproofos.operatoros.net`,
  `studyforge-ai.operatoros.net`, `ninjalaunchkit.operatoros.net`,
  `callcommand-ai.operatoros.net`, and `ninjamation.operatoros.net`
- Bounded active add-on: `outcall.operatoros.net`

OutCall is an active SSO client and launchable only through OperatorOS
entitlement. Its live Twilio provider path remains disabled until the signed
provider workflow and deployed acceptance gates pass.

The Replit default alias `operator-os.replit.app` may reach the deployment, but
it is not a canonical OperatorOS application origin, registered SSO callback,
logout URI, CORS origin, or absolute auth return target.

## Source-of-truth rules

- Runtime URLs and exact SSO callbacks come from
  `config/operatoros-module-registry.json` and the shared module registry.
- Public ecosystem metadata contains canonical OperatorOS subdomains only.
- Pre-consolidation product domains may appear in historical import notes or
  source snapshots, but never as an active launcher, callback, logout URI,
  CORS origin, or billing return URL.
- Every browser module call uses its current host's same-origin `/api/*`
  surface. Credentialed sibling-origin mutations are rejected.

## Remaining release work

The infrastructure task is application release verification, not DNS change:

1. Publish the unified Next/Fastify source release to the existing Replit
   deployment.
2. Confirm the proxy preserves the original public host and HTTPS scheme.
3. Verify `/healthz`, `/readyz`, exact `/sso` callbacks, deep links, local and
   global logout, and no-store/no-referrer headers on every canonical host.
4. Run the isolated-PostgreSQL and authenticated browser matrix in
   `docs/auth/VALIDATION_MATRIX.md`.

Do not reintroduce old standalone domains into active registry or UI data as a
shortcut during rollout. Any externally managed legacy-domain redirect is a
separate marketing/operations concern and is not part of OperatorOS auth.
