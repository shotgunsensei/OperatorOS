# Ninja Pool Hall Phase 10B parity matrix

Assessment date: 2026-07-22

Candidate status: source/local state 4 verification complete. This document
does not claim consolidation state 5 or production readiness.

## Provenance and audit boundary

The clean standalone checkout at `C:\Dev\Shotgun-ninja-pool-hall` and the
quarantined snapshot both resolve to commit
`62439c4018ec551ce2891800351200c8ab2cb9e7`. The snapshot manifest records 222
tracked files, 145 retained files, 1,817,463 bytes, excluded generated/private
artifacts, and zero high-confidence secret findings. The standalone repository
was inspected read-only. Its server, migrations, dependency installation, and
runtime were not activated.

The audit covered package/deployment metadata; `/`, `/practice`, `/local`,
`/host`, `/join`, and `/settings`; canvas gameplay/HUD/power; deterministic
physics; WPA-lite rules and optional call-shot/three-foul variants; CPU aiming;
procedural audio/haptics; browser settings/client identity; WebSocket transport
and in-memory room relay; PWA/install assets; and physics/rules tests. There is
no database-backed profile, preference, progression, result, achievement,
leaderboard, monetization, or historical game model.

## Capability disposition

| Source capability | Pinned source reality | Phase 10B disposition | Evidence required |
| --- | --- | --- | --- |
| Identity/session | “No login”; browser-generated client ID for room reconnect | Exclude client identity. OperatorOS exact-host session and tenant/module guards are sole authority | SSO, unauthorized, foreign-tenant/user, logout tests |
| Free Shoot | Complete deterministic local rack | Retain `/practice` and bounded tenant/user practice summaries | Physics, persistence, recovery and browser tests |
| CPU 8-ball | Complete rules-driven game using basic ghost-ball bot | Promote `/cpu`; persist server-applied logical rule trail and result | Rules vectors, API workflow, real browser shots |
| Local two-player | Complete pass-and-play game on one device | Promote `/local`; signed-in player plus bounded guest display name | API/browser lifecycle and reload result tests |
| Online host/join | In-memory unauthenticated relay; browser host simulates; local client ID owns reconnect slot | Exclude and visibly disable under ADR-0020 | Static no-WebSocket/no-room checks |
| Physics | Deterministic fixed-step simulation with aim, spin, rails and pockets | Exact promoted copy; continuous coordinates/frames remain in browser | Exact hash, determinism and performance tests |
| Rules | Break, group assignment, fouls, ball-in-hand, 8-ball, call-shot, three-foul, pending choices | Exact web copy plus server logical projection over bounded shot facts | Deterministic rule and parity tests |
| Bot | Basic ghost-ball shot selection with bounded human-like jitter | Exact promoted copy; results remain unverified local evidence | Playable browser smoke and no ranking claim |
| Profiles | None | OperatorOS tenant/user display profile; not a second identity | Profile version, viewer and isolation tests |
| Preferences | `localStorage` aim, speed, sound, vibration, call-shot and three-foul | Persist in OperatorOS profile; match snapshots rules so they cannot drift mid-game | Validation, optimistic conflict and reload tests |
| Session lifecycle | Browser component state; online room state is volatile | One active structured match, explicit complete/abandon/recovery, start rate limit, shot cap, bounded history | DB lifecycle/concurrency/restart tests |
| Results | Browser-only winner | Server derives winner/result from promoted rules; event facts remain client-reported | Tamper, turn, version, idempotency and result tests |
| Progression | None | Real completed/win/loss/hot-seat counts derived from saved matches; no invented XP | Aggregate/reload tests and explicit trust label |
| Achievements | None | Not implemented; no placeholder badges | UI/static scan |
| Leaderboards | None | Not implemented. No unverified leaderboard | UI/API/static scan |
| Monetization | “No coins”; no billing | Remains free with an OperatorOS account; no child checkout | Commercial-boundary tests |
| Settings assets/audio | Procedural audio, browser vibration, no required game asset download | Promote procedural feedback; canvas has no fragile remote asset dependency | Build/browser and disabled-feedback tests |
| PWA/install | Standalone manifest/service worker/install banner | Exclude from host-routed module; OperatorOS owns deployment shell | Build/route checks |
| Standalone Express/CORS/health | Separate permissive CORS server plus `/ws/pool` | Exclude. Shared Fastify/Next health, logging, auth, CORS and release contract apply | Runtime readiness and quarantine checks |
| Source data migration | No durable source records | Dry-run only; exact engine hash and zero-row reconciliation | Repeatable dry-run test/CLI |

## Trust classification

- `browser-local deterministic`: continuous positions, velocities, animation,
  aim, bot selection, procedural audio, and haptics.
- `client-reported_server_rules`: bounded pocket/contact/rail facts are supplied
  by the browser; OperatorOS applies rules, versions, turns, groups, choices,
  winner, result, and persistence.
- `server-authoritative`: identity, tenant/user ownership, access, profile,
  match lifecycle, idempotency, timestamps, rate/retention bounds, stored rule
  projection, and personal aggregates.
- `not supported`: verified competition, public ranking, anti-cheat proof,
  rewards, wagering, online room/matchmaking, and remote opponent identity.

## Completion boundary

State 4 requires exact source promotion for the approved modes, clean
PostgreSQL release, profile/match workflows, restart persistence, tenant/user
non-enumeration, viewer denial, deterministic rules/import reconciliation,
production build/start, health/readiness, deep-link refresh, SSO return/logout,
and local production-host browser gameplay. State 5 additionally requires the
exact cumulative revision deployed, deployed SSO/return/logout/health/browser
acceptance, and authorized no-data reconciliation/cutover evidence. Until that
deployed gate passes, Ninja Pool Hall remains not production-ready.
