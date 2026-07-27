# TechDeck Phase 5 verification

Evidence date: 2026-07-18

This is source/local state 4 evidence. It does not claim a deployed state 5.
All PostgreSQL activity used disposable PostgreSQL 16 databases in the
`operatoros-phase5-postgres` Docker container. No public deployment, provider
traffic, standalone-data apply, or production mutation occurred.

## Results

| Gate | Result |
| --- | --- |
| Provenance | PASS; clean `C:\Dev\Tech-Deck` `main` at `8125f8d89d8d39d60a50c8061a26133a0c917792`; 265 common files byte-identical, 36 adapted, 122 recovered-source-only |
| Focused TechDeck regression | PASS 16/16, including configuration/network/lifecycle, document workflow, isolation, role denial, importer, release contract, and deep links |
| New Phase 5 tests | PASS 5/5 |
| Dry-run fixture | PASS; fingerprint `356117c32885d1761fa3c0a1674d185d9d63b6dad910cfaac2bbdb09674fd374`, 8 mappings, 12/12 references resolved, 0 missing |
| Database release | PASS repeatedly on PostgreSQL 16; 18 ordered additive steps, including `techdeck_tables`, applied without drift |
| Workspace typecheck | PASS for API, runner gateway, and web |
| Production build | PASS for SDK, API, runner gateway, and Next 14.2.35; 20 static page entries |
| Production core preflight | PASS with isolated non-production configuration |
| Compiled runtime | PASS; release applied, Fastify/shared-worker readiness reached on 5001, Next reached ready on 5000 |
| Anonymous production-host smoke | PASS; API readiness and web root returned 200; eight TechDeck deep links returned exact-host PKCE redirects; workspace API returned 401 |
| Production-host SSO browser gate | PASS 2/2 in 1.7 minutes after assigning the twelve-module scenario a bounded 180-second budget; all enabled module launches, TechDeck deep-link return, refresh, Back, sibling silent SSO, local logout, and global revocation passed |
| Document/reference authorization hardening | PASS 1/1 on a clean database; role escalation, restricted document/detail/attachment/link access, and foreign configuration references fail closed |
| Full API regression | PASS; final clean-database run reported 702 total, 696 passed, 0 failed, 6 HTTP-only skips in 616,919 ms. Earlier stale TechDeck-navigation and pnpm-policy assertions were corrected and passed in focused/final reruns. |
| Lint/format | NOT DEFINED; this repository has no supported lint or formatting script |

The first production-host SSO attempt reached the final part of the
twelve-module loop but exceeded the prior global 60-second test timeout. It
had no application assertion failure. The scenario now has an explicit
180-second bound and the fresh 2/2 rerun passed.

One attempted final aggregate omitted the explicit test-only session key
needed by files that import authentication before shared setup; that run was
stopped and rejected as evidence. A second correctly configured run was also
stopped after manual review found the record-level authorization edge fixed by
the focused regression above. Only the final new-database aggregate recorded
in the table is authoritative.

## Remaining state-5 gates

- Review and human-authorized deployment of the cumulative revision.
- Public 48/48 read-only verification on the exact deployed commit.
- Authenticated deployed TechDeck create/update/reload/deep-link/logout and
  second-tenant denial evidence.
- Approved production attachment/provider decisions.
- Frozen standalone export, reviewed dry run, authorized apply,
  reconciliation, write freeze, and rollback rehearsal.
