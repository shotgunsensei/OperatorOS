# OutCall Canonical Current Source Boundary

The historical standalone OutCall repository could not be recovered after the
documented Phase 37 searches. On 2026-08-26, the owner explicitly authorized a
reconstruction when source code was unavailable. This boundary therefore
records an owner-authorized reconstruction; it does not claim byte-for-byte or
literal parity with an unknown historical tree.

The canonical current implementation lives in the shared OperatorOS runtime:

- `apps/api/src/lib/outcall-db-init.ts`
- `apps/api/src/lib/outcall.ts`
- `apps/api/src/lib/outcall-provider.ts`
- `apps/api/src/routes/outcall-routes.ts`
- `apps/web/src/components/module-shells/OutCallShell.tsx`
- `apps/web/src/components/module-shells/OutCallWorkspace.tsx`
- `apps/web/src/components/module-shells/OutCallRoute.contract.ts`

That implementation uses the OperatorOS exact-host SSO and tenant/module-bound
session. It must not add child-owned identity, shared-secret authentication, or
a second billing authority. The shared registry intentionally remains
`planned`, the deployment registry remains disabled, and provider activation
requires every gate in `docs/outcall/GO_LIVE_CHECKLIST.md`. Source
reconstruction closes the parity provenance stop; it does not waive provider,
deployment, or go-live acceptance.
