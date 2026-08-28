---
name: Replit internal service ports
description: Why OperatorOS internal processes must bind to loopback while only the supervised gateway binds publicly.
---

OperatorOS internal API, runner, and production Next processes must bind to `127.0.0.1`. Only the supervised gateway on the configured public port may bind to `0.0.0.0`.

**Why:** When internal services bound to `0.0.0.0`, Replit repeatedly rediscovered ports 5001 and 5002 and regenerated public port mappings. The deployment-scope gate then correctly stopped publishing because those services bypass the supervised gateway.

**How to apply:** Preserve the loopback host setting in development workflows and the unified production launcher. If internal port mappings reappear in `.replit`, verify the services did not regress to public binding before merely deleting the mappings.