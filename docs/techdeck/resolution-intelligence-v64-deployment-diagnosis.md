# Resolution Intelligence v64 Replit deployment diagnosis

Initial diagnosis observed 2026-09-27 through the owner's open Chrome Replit
workspace. The diagnostic inspection below was read-only. The owner subsequently
authorized migration and republish; the backed-up root release has now completed
and production independently verifies v64/64. See the separate
[recovery evidence](../RELEASE_V64_EVIDENCE.md) for current publication status.

## Confirmed blocker

Failed Replit build `3c764b6a-6c35-494e-8d71-803f190e3679` completed Build and
Bundle but failed Promote. Next reached Ready; the supervisor reported
`Database release verification exited (1)` and kept public readiness closed.
The runtime excerpt does not expose the verifier's underlying error message.
The PostgreSQL SSL-mode message is a warning, not evidence of a TLS failure.

The production database lacks both `tdri_preserve_raw_export()` and
`tdri_raw_export_immutable`. The v64 initializer creates them, and the startup
verifier explicitly requires the enabled trigger. This is a confirmed release
blocker independent of the missing runtime diagnostic. It protects accepted raw
Resolution evidence from being rewritten. Do not remove the check or enable
startup migration authority to make the deployment pass.

Replit's publish log records 175 database migration statements at
`2026-09-27T20:27:15Z`, including the Resolution tables and indexes, then Autoscale
creation at `20:27:27Z`. Development contains the function and trigger while
production does not. The observed state is consistent with the publish schema
diff copying declarative objects without completing the ordered release's
function/trigger DDL. A generated schema diff is not proof of a complete release.

## Fresh evidence

Replit checkout: clean `aa3e2ea08d4e60f2a5342c3395d73ec2f4948f81`, the Phase 4
merge (PR #107). The existing Replit Linux shell ran:

```bash
git status --short && git rev-parse HEAD && corepack pnpm db:verify
```

The normal development database returned:
`[database-release] current v64/64 verified in 3884ms`.
No environment values or database URLs were printed or copied.

Production catalog inspection used Replit Database > Production Database >
My Data > SQL console with **Enable Editing off**. Only SELECT statements were
executed. Development was explicitly selected for the comparison.

| Catalog check | Production | Development |
| --- | --- | --- |
| Resolution table count | 27 | Covered by successful root verifier |
| Required trigger count | 0 | 1 |
| Required trigger function exists | false | true |
| Resolution constraints marked unvalidated | 0 | 0 |
| Resolution indexes marked invalid or unready | 0 | 0 |
| Search vector generation | ALWAYS | Covered by successful root verifier |
| Complete root `db:verify` | Not run against production; confirmed trigger gap blocks success | PASS, v64/64 |

These catalog aggregates do not independently certify every production column,
constraint definition, or index. A complete production verifier pass remains
required after the approved apply. No test suite was run against either Replit
database; these were operational read-only checks, not test fixtures.

Exact production-only discovery query:

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_name LIKE 'techdeck_resolution_%')
    AS resolution_tables,
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid=to_regclass('public.techdeck_resolution_raw_exports')
            AND tgname='tdri_raw_export_immutable'
            AND tgenabled='O' AND NOT tgisinternal)
    AS immutable_trigger_present,
  (SELECT is_generated FROM information_schema.columns
   WHERE table_schema='public'
     AND table_name='techdeck_resolution_search_documents'
     AND column_name='search_vector') AS search_vector_generated;
```

Exact comparison query, run once in each explicitly selected environment:

```sql
SELECT
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid=to_regclass('public.techdeck_resolution_raw_exports')
     AND tgname='tdri_raw_export_immutable' AND NOT tgisinternal)
    AS immutable_trigger_count,
  to_regprocedure('public.tdri_preserve_raw_export()') IS NOT NULL
    AS immutable_function_present,
  (SELECT count(*) FROM pg_constraint c
   JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='public' AND t.relname LIKE 'techdeck_resolution_%'
     AND NOT c.convalidated) AS unvalidated_constraints,
  (SELECT count(*) FROM pg_index i
   JOIN pg_class t ON t.oid=i.indrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='public' AND t.relname LIKE 'techdeck_resolution_%'
     AND (NOT i.indisvalid OR NOT i.indisready)) AS invalid_indexes;
```

## Recovery sequence (subsequently authorized and executed)

Follow the [backup/restore runbook](../DATABASE_BACKUP_RESTORE.md) and
[v64 preparation record](../RELEASE_V64_PREPARATION.md). Production backup,
release apply, and publication are separate human-authorized operations. The
owner subsequently authorized migration and republish for this recovery. The
sequence below records the prepared procedure; current results are in the
[recovery evidence](../RELEASE_V64_EVIDENCE.md).

1. Verify the approved source revision and read-only `corepack pnpm db:plan`.
2. Establish and verify a private full-platform production backup/recovery point,
   and pause production traffic for the release window. Record only aggregate
   reconciliation evidence in repository documentation.
3. Privately select the production connection for a one-shot process. Do not
   overwrite the workspace's normal development connection or log credentials.
   Run the supported root release, which holds its advisory lock and completes
   the missing function/trigger DDL within the Resolution transaction:

   ```bash
   OPERATOROS_DATABASE_RELEASE_MODE=apply corepack pnpm db:apply
   corepack pnpm db:verify
   ```

   The command-scoped apply flag must remain absent from the serving environment.
   A root apply replays all ordered idempotent steps; it is not a claim that only
   two catalog objects can change. Reconcile any backfill/count changes.
4. Require an independent v64/64 production pass and confirm the enabled trigger
   and its function. Development already verifies v64/64; recheck before publish.
5. After separate publication authorization, inspect the proposed schema diff,
   reject destructive changes, keep production-data overwrite off, publish the
   approved source, and verify commit/build identity, public health/readiness,
   exact-host SSO, and affected TechDeck workflows.

There is no proposed application-code patch or new release version. Phase 4
remains locally verified; this failed publish does not establish target-deployment
acceptance. Phase 5 semantic retrieval remains the next feature phase after the
deployment interruption is handled.
