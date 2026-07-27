# OperatorOS initial SLO and alert runbook

Effective date: 2026-07-27

These are internal release objectives, not contractual customer SLAs. The
target deployment must retain request ID, user ID, tenant ID, module ID, route
template, status, and duration fields without logging raw URLs or sensitive
payloads.

## Service objectives

| Signal | Objective | Measurement |
| --- | --- | --- |
| Public availability | 99.9% monthly for `/healthz`; readiness is excluded while intentionally draining | External HTTPS probe by canonical host |
| Ready availability | 99.5% monthly during scheduled serving windows | `/readyz` and component fields |
| Server error rate | Less than 1% 5xx over 5 minutes, excluding intentional provider-disabled 503 codes before launch | Structured completion logs |
| Core read latency | p95 under 300 ms and p99 under 750 ms | Authenticated route-template duration |
| Core write latency | p95 under 500 ms and p99 under 1,500 ms, excluding provider latency | Mutating route-template duration |
| Login latency | p95 under 1,000 ms; bcrypt work is intentional | `/v1/auth/login` duration |
| Launcher latency | p95 under 300 ms | `/v1/me/modules` duration |
| Database | Zero connection acquisition timeouts; pool use below 80% for 10 minutes | Pool/platform metrics |
| Jobs | Oldest ready job under 5 minutes; dead-letter growth is zero during steady state | Shared worker health/database metric |
| SSO | Exchange failure/replay anomaly below 1% excluding deliberate negative tests | SSO audit event counters |
| Backup | RPO 24 hours, restore rehearsal at least quarterly, RTO 4 hours | Backup provider plus rehearsal record |

## Alerts

- Page: `/healthz` unavailable for 2 minutes on two probes.
- Page: `/readyz` fails database/auth/SSO/module registry for 2 minutes outside
  a declared deployment drain.
- Page: suspected cross-tenant denial anomaly, webhook signature acceptance
  anomaly, audit-write failure on privileged mutation, or session revocation
  failure.
- Page: 5xx above 5% for 5 minutes, database acquisition timeout, pool
  saturation above 90%, worker stopped, or dead-letter growth above 10.
- Ticket: p95 objective breach for 15 minutes, provider degradation, backup
  missed by 2 hours, or dependency audit produces a new moderate issue.

Every alert must attach environment, canonical host, request/correlation IDs,
route template, module, sanitized error code, deployment commit, and first/last
seen time. It must not attach cookies, tokens, query strings, phone/VIN values,
PHI, prompts, uploaded content, provider signatures, or credential material.

## Burn and release policy

A full monthly error budget is 43.2 minutes at 99.9%. Consuming 25% in six
hours or 50% in three days freezes non-remediation releases. Any confirmed
tenant escape, auth bypass, false billing entitlement, or secret disclosure
freezes release regardless of availability budget and invokes the incident
rollback runbook.
