# Domain Migration — Tech Deck (`techdeck.app` → `techdeck.operatoros.net`)

> **⚠️ Do not redirect the legacy domain early.** Do **not** add any redirect
> from `techdeck.app` to `techdeck.operatoros.net` until the new domain shows
> **Verified** in Replit *and* both DNS resolution and HTTPS have been
> confirmed working. Redirecting before the new subdomain is live will send
> real users to a broken or unsecured endpoint and can cause TLS errors,
> redirect loops, and lost traffic.

## Purpose

This document is the operator runbook for migrating an ecosystem module from a
standalone domain onto its canonical OperatorOS subdomain. Tech Deck is the
first migration target: it moves from the legacy `https://techdeck.app` to the
ecosystem URL `https://techdeck.operatoros.net`. The same ordered flow applies
to any future module that carries a `legacyUrl` in the ecosystem registry.

**This is a manual, infrastructure-level process.** None of the steps below are
performed by the codebase. There are no DNS changes, redirects, or
Cloudflare/Replit API calls committed in this repository — the app only renders
the target and legacy URLs from `ecosystem.registry.json` and provides
read-only domain-check scripts.

## Current model

- The module is currently served from its legacy domain (e.g.
  `https://techdeck.app`).
- **Replit remains the host** throughout and after the migration. We are not
  moving hosting; we are pointing a new OperatorOS subdomain at the
  Replit-hosted deployment.
- The ecosystem registry (`ecosystem.registry.json`, derived from the shared
  module catalog) already declares the canonical target
  (`ecosystemUrl: https://techdeck.operatoros.net`) and the `legacyUrl`
  (`https://techdeck.app`). The `/ecosystem` launcher page surfaces both.

## Target model

- The module is reachable at `https://<module>.operatoros.net` (for Tech Deck:
  `https://techdeck.operatoros.net`), served by the same Replit deployment.
- The legacy domain (`techdeck.app`) is kept as a **legacy alias** that
  redirects to the new subdomain — but only after verification (see warning
  above).
- `operatoros.net` and all `*.operatoros.net` platform components and module
  subdomains share one DNS zone managed at the DNS provider for
  `operatoros.net`.

## Manual Replit steps

1. Open the Replit project for the deployment that should serve the module.
2. Go to **Publishing → Domains** (the deployment's custom-domains panel).
3. Choose **Add domain / Link a domain** and enter the new subdomain:
   `techdeck.operatoros.net`.
4. Replit will display the DNS records required to verify and route the domain:
   - an **A** record (IP address) for the apex/subdomain target,
   - a **TXT** record used for ownership verification,
   - and/or a **CNAME** record, depending on what Replit shows for this
     deployment.
5. **Copy these exact records.** Do not guess or reuse records from another
   domain — use the precise values Replit shows for `techdeck.operatoros.net`.

## Manual DNS steps

1. Log in to the DNS provider that hosts the `operatoros.net` zone.
2. Add the records copied from Replit, scoped to the `techdeck` subdomain:
   - the **A** record on the `techdeck` host,
   - the **TXT** verification record on the host Replit specified,
   - and/or the **CNAME** record if Replit provided one instead of an A record.
3. Use the TTL the provider defaults to (a low TTL such as 300s is fine while
   migrating). Save the zone changes.
4. Return to Replit's **Publishing → Domains** panel and wait for the domain
   status to change to **Verified**. DNS propagation can take from a few
   minutes up to a few hours.

## Verification steps

Run these **before** touching the legacy domain.

1. Confirm the domain shows **Verified** in Replit's Domains panel.
2. Check DNS resolution and HTTPS with the read-only scripts in this repo:
   - macOS/Linux: `bash scripts/check-ecosystem-domains.sh`
   - Windows/PowerShell: `pwsh scripts/check-ecosystem-domains.ps1`
   Both print a `Domain | DNS Status | Resolved Target | HTTPS Status` table.
   Confirm `techdeck.operatoros.net` shows a resolved target and a healthy
   HTTPS status (2xx/3xx).
3. Manually load `https://techdeck.operatoros.net` in a browser and confirm the
   module loads over HTTPS with a valid certificate (no TLS warnings).

## Legacy redirect steps

Only after **all** verification steps pass:

1. Configure a redirect from the legacy domain `techdeck.app` to
   `https://techdeck.operatoros.net` (301/308 permanent redirect, performed at
   the legacy domain's host/DNS/proxy layer — outside this codebase).
2. Keep `techdeck.app` registered and pointed so the redirect keeps working;
   treat it as a **legacy alias**, not a domain to retire immediately. Existing
   bookmarks, links, and emails still reference it.
3. Re-run the domain-check scripts and confirm both `techdeck.app` (now
   redirecting) and `techdeck.operatoros.net` (canonical) behave as expected.

## Rollback notes

- If the new subdomain misbehaves after verification, **remove the legacy
  redirect first** so `techdeck.app` continues serving users directly.
- The new `techdeck.operatoros.net` records can be removed at the DNS provider
  and the domain unlinked in Replit's Domains panel; this reverts to the
  current model with no code changes required.
- Because Replit remains the host throughout, rollback never involves moving
  the deployment — only DNS records and the optional legacy redirect change.
- No repository changes are needed to roll back; the registry already lists
  both URLs and the app does not force any redirect.
