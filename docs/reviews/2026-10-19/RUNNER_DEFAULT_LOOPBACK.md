# Standalone runner default loopback

Verdict: bounded source hardening candidate; standalone network deployment is
not production accepted.

Base: `c55e580f8858ec3e3200a717af310a184285832b`.
Branch: `codex/operatoros-runner-loopback-oct19`. Existing dependencies were
reused through task-local junctions; no package acquisition or install occurred.

## Source boundary and compatibility

The standalone legacy runner has unauthenticated create/stop/exec/status/stream
routes. Its ordinary non-production runner mode defaults to local execution,
and its listener previously defaulted to all IPv4 interfaces. Running it without
an explicit host could therefore expose that authority beyond the intended
local process boundary. No live exposed runner was probed or demonstrated.

The listener fallback is now `127.0.0.1`. An explicit trimmed
`INTERNAL_SERVICE_HOST` still selects the operator's interface. Runner-mode
selection, local/docker/k8s implementations, command semantics and API routes
are unchanged. This is a private-default change, not new service authentication.
Intentional network exposure still needs an authenticated and isolated service
boundary; CORS and the command deny-list are not authorization.

Canonical production is unchanged: `.replit` runs the unified supervisor, which
starts private API/Next children, forces `INTERNAL_SERVICE_HOST=127.0.0.1`, and
requires disabled runner mode. It does not start this standalone gateway.
The API imports the provisioner directly. The `.replit` development command
already selects loopback explicitly.

Legacy Docker/Kubernetes files still have preexisting Veridian package/image
names, port 4001/GATEWAY_PORT and output-path mismatches with current code, which
reads PORT and defaults to 5002. They are not accepted deployment targets and
were not run, repaired or silently granted a wildcard listener by this patch.
Any restoration of those paths must reconcile private binding, service auth,
actual build artifacts, ports and execution policy together.

## Actual verification

Local Node 24.16.0, existing pinned pnpm 10.34.5. Tests start only the patched
candidate on ephemeral loopback ports with RUNNER_MODE=disabled. No workspace
is created, external Git URL contacted, host command executed or database loaded.

- `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/runner-gateway-loopback.test.ts test/replit-unified-runtime.test.ts test/phase39-production-hardening.test.ts`: nine focused checks pass. Two new real-process cases verify default bind and explicit localhost compatibility, health and exec 126 denial. The default fixture is reachable at 127.0.0.1 and refuses the same reserved port at 127.0.0.2, distinguishing an exclusive bind from wildcard diagnostics without a LAN probe. Existing production-disabled/development-local policy and unified readiness tests pass.
- `pnpm --dir apps/runner-gateway typecheck`: passed.
- `pnpm --dir apps/runner-gateway build`: passed, including SDK and runner compilation.
- `RUNNER_GATEWAY_TEST_COMPILED=1 pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/runner-gateway-loopback.test.ts`: two compiled-artifact runtime cases pass with the exclusive-bind assertion.
- `pnpm --dir apps/api exec tsc --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck test/runner-gateway-loopback.test.ts`: passed.
- `pnpm lint`: passed, zero warnings.
- `git diff --check`: passed.

Independent review checked index/provisioner/local provider, command/CORS
boundaries, canonical supervisor/dev callers and legacy infrastructure. Its
suggestion to distinguish wildcard diagnostic logging from actual exclusive
binding is retained as the second-loopback-address assertion. Full Node 20
exact-head CI remains a draft merge gate. The independent reviewer reran all
nine source checks and both compiled checks with zero failures/skips, and an
additional trimmed `::1` override fixture passed IPv6 health and disabled
exec controls. No repository edits, external calls or broad-bound baseline
process were used in that review. Production schema 67
versus historical live 65 confirmation, recoverable backup, write pause and
explicit migration approval remain separate and untouched.
