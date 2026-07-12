# OutCall Runtime Source Boundary

This directory reserves the repository-defined child-module source boundary.
Phase 1 intentionally contains no launchable UI or provider simulation.

The next implementation phase should add the web/API/worker runtime here and
must first implement the SSO consume/session boundary documented in
`docs/outcall/SSO_INTEGRATION.md`. Activation requires all gates in
`docs/outcall/GO_LIVE_CHECKLIST.md`; until then the shared registry status stays
`planned`.
