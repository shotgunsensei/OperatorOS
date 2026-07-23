# Ninja Pool Hall Phase 10B threat model

## Protected assets

- OperatorOS identity, session, tenant membership, module entitlement, role,
  and logout/revocation state.
- Tenant/user player profile and preferences.
- Match ownership, lifecycle, logical rules projection, events, results, and
  personal aggregates.
- Runtime availability and safe structured logs.

## Trust boundaries and controls

| Threat | Control |
| --- | --- |
| Browser supplies tenant/user, winner, score, group, turn, or game state | Strict allowlists reject authority and arbitrary state. Tenant/user come only from the validated module session; winner/turn/groups are derived by server rules. |
| Cross-tenant or same-tenant cross-user enumeration | Every match/profile query includes trusted tenant and user. Foreign and nonexistent match IDs return the same 404. |
| UI-only role checks | Read/write Fastify guards enforce entitlement and viewer restrictions before handlers. |
| Replay or duplicate shot/start | Tenant/user start key and tenant/match action key are unique; exact retries return the committed record. Optimistic version predicates prevent stale mutation. |
| Impossible or oversized shot facts | Ball IDs, uniqueness, first contact, rails, pocket, seat, sequence, and string lengths are bounded. Previously pocketed object balls cannot be reported again. |
| Client claims verified physical result | Stored/UI evidence is always `client_reported_server_rules`; no leaderboard, reward, wagering, verified skill, or anti-cheat claim consumes it. |
| Room impersonation or slot takeover | Standalone WebSocket room and browser client ID are not mounted or bundled into active UI. |
| Match/rule drift after preference edit | A match snapshots its rule preferences at start; later profile edits affect only future matches. |
| Refresh invents physical state | Continuous coordinates are never accepted as canonical persistence. Active records reload into an explicit recovery/end flow. |
| Unbounded storage or API abuse | One active match, 20 starts/hour, 500 shots/match, 100 retained match summaries, 100 list maximum, bounded event JSON. |
| Sensitive log leakage | Routes log through shared request correlation; no cookie/token, arbitrary game state, or PII payload is added to activity metadata. |
| Account/tenant deletion leaves records or partial audit | Events, matches, profiles, and practice rows are deleted in audited platform transactions; failure rolls all changes and audit back. |

## Residual risk

A modified browser can fabricate shot facts within the accepted bounds. That is
intentional for this local entertainment product and is why results are not
competitive. Secure online competition would require server-authoritative
simulation or independently attestable inputs, authenticated opponent scope,
durable room recovery, moderation/abuse controls, capacity limits, and a new
ADR/security review.
