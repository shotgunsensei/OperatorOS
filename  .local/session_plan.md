# Objective
Run a production-scope security scan across the full OperatorOS application and confirm exploitable vulnerabilities with concrete code evidence.

# Relevant information
- Monorepo with three production surfaces: `apps/api`, `apps/web`, `apps/runner-gateway`.
- The API control plane in `apps/api/src/index.ts` and `apps/api/src/routes/os-routes.ts` contains workspace lifecycle, process, service, file, task, publish, and runner-stream routes.
- Multi-tenant SaaS surfaces generally use `authenticate`, `requireTenantMember`, `requireTenantAdmin`, or `requireSuperAdmin`.
- Production reachability matters; dev-only artifacts such as `apps/web/.next`, `apps/web/out`, Android build output, tests, and mock-only fallbacks are lower priority unless proven exposed.
- Deterministic scan outputs are available in notebook variables `sast` and `hounddog`.

# Tasks

### T001: Confirm workspace/control-plane auth gaps
- **Blocked By**: []
- **Details**:
  - Trace `apps/api/src/index.ts` and `apps/api/src/routes/os-routes.ts` for endpoints that operate on workspaces, tasks, exec, files, publish runs, streams, processes, services, or automations without auth.
  - Acceptance: confirm whether unauthenticated callers can read or mutate sensitive workspace resources or execute commands.

### T002: Review runner-gateway exposure assumptions
- **Blocked By**: []
- **Details**:
  - Inspect `apps/runner-gateway/src/*` to determine whether direct internet exposure would create an unauthenticated RCE surface, and whether the main API already exposes the same capability.
  - Acceptance: either confirm a production-relevant finding or document why it is internal-only under the threat model.

### T003: Review tenant/module/admin surfaces
- **Blocked By**: []
- **Details**:
  - Inspect `apps/api/src/routes/module-routes.ts`, `tenant-routes.ts`, `tenant-admin-routes.ts`, `platform-routes.ts`, and related auth helpers for broken access control, cross-tenant issues, or accidental use of the wrong role axis.
  - Acceptance: confirm or rule out exploitable authorization issues outside the workspace control plane.

### T004: Review billing/auth/AI surfaces
- **Blocked By**: []
- **Details**:
  - Inspect `billing-routes.ts`, `auth-routes.ts`, `ai-routes.ts`, and supporting libs for public abuse, unsafe token handling, webhook trust issues, or other production-relevant weaknesses.
  - Acceptance: confirm additional exploitable findings or rule them out with evidence.

### T005: Synthesize and report
- **Blocked By**: [T001, T002, T003, T004]
- **Details**:
  - Deduplicate findings, group new vulnerabilities under `.local/new_vulnerabilities/`, update any relevant existing vulnerabilities, refresh `threat_model.md` if needed, and call `report_scan_complete`.
