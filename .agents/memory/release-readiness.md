---
name: Release readiness versus schema parity
description: Distinguish development/production parity from satisfaction of the application release contract.
---

Run the complete application release verifier as well as the Publish schema diff. An empty diff is not sufficient evidence of readiness.

**Why:** Both databases lacked newly required AI budget storage, producing an empty diff while production startup correctly rejected the schema. Development startup had also failed before schema initialization because a declared dependency was not installed.

**How to apply:** Restore frozen-lockfile dependencies, verify the actual development schema against the current release contract, and reconcile approved missing development objects before reviewing Publish's additive production migration. Keep production verification read-only; do not bypass readiness or add production startup DDL.
