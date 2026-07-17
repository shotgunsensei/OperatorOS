# OutCall Runtime Source Boundary

This directory reserves the repository-defined child-module source boundary.
Phase 1 intentionally contains no launchable UI or provider simulation.

The next implementation phase should add reviewed product workflows through
the shared OperatorOS web/API runtime. It must use the existing exact-host SSO
v1 callback and tenant/module-bound session documented in
`docs/outcall/SSO_INTEGRATION.md`; it must not add a separate child consume or
shared-secret authority. Activation requires all gates in
`docs/outcall/GO_LIVE_CHECKLIST.md`; until then the shared registry status
stays `planned`.
