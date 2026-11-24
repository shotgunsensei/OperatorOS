# OperatorOS repository map and generated evidence

Use this page to find the active code, release authority, and historical evidence. It is an index, not a release receipt.

## Where to work

| Area | Start here |
| --- | --- |
| Repository rules and onboarding | [AGENTS.md](../AGENTS.md), [README](../README.md) |
| Active web app and platform API | [apps/web](../apps/web), [apps/api](../apps/api) |
| Shared registry, SSO, and SDK | [packages](../packages), [SSO contract](auth/OPERATOROS_SSO_CONTRACT_V1.md) |
| Product status and module parity | [Implementation status](IMPLEMENTATION_STATUS.md), [module parity index](modules/MODULE_PARITY_INDEX.md) |
| Build, release and restore | [Current release gate](CURRENT_RELEASE_GATE.md), [workflows](../.github/workflows), [database backup and restore](DATABASE_BACKUP_RESTORE.md) |
| Architecture decisions | [Architecture decision index](adr/README.md) |
| Standalone module snapshots | [apps/modules](../apps/modules); historical source only, not for install, activation, or database migrations |

The root `pnpm-lock.yaml` is the deployment lockfile. Keep active fixtures, source ledgers, current documentation, and migration evidence in Git when code or release checks depend on them.

## Keep generated evidence out of ordinary source commits

- Use the producing tool's prescribed output path for screenshots, traces, reports, and generated parity data. Before committing, check `git status --short` and `git diff --cached --name-status`.
- Keep only a concise release receipt in Git when a large artifact can live in an approved evidence store. Record the exact commit and job, retrieval location, content digest, and applicable retention period. Short-lived CI artifacts are not a durable archive.
- Review output for private data before sharing. Database dumps, session material, and private traces do not belong in Git. Use the linked backup runbook for database recovery.
- An ignore rule affects untracked files only. It does not remove existing entries or rewrite history. Do not force-add generated output to get around a targeted ignore.

## Historical CallCommand investigation

The September investigation contains generated CI output under `output/callcommand-investigation/ci-*`. The historical [review finding](reviews/2026-09-12/ecosystem/FINDINGS.md) describes the footprint. Preserve the parent directory's documented harness and evidence references, and do not remove active test output destinations.

For a future archive, begin with the three September CI subtrees only. Pin the source commit, inventory the paths and Git blob IDs, and prove that an approved private recovery copy can be read back before proposing a forward-only removal. Archive marketing bundles and presentation outputs only after checking the owner's reuse and retention needs. Leave Git history intact.
