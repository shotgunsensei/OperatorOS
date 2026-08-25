# Operator Pool Hall native engine slice

`physics.ts`, `types.ts`, `rules.ts`, `bot.ts`, and `audio.ts` are exact
promoted copies from the quarantined
The stable `ninja-pool-hall` engine slice originated from the historical application snapshot at commit `62439c4018ec551ce2891800351200c8ab2cb9e7`:

`apps/modules/ninja-pool-hall/source/artifacts/pool/src/lib/`

Phase 10B uses the deterministic engine for Free Shoot, CPU 8-ball, and local
hot-seat play. Continuous physics, bot selection, audio, and haptics remain
browser-local. The API accepts bounded shot facts, applies the promoted rules
to a logical projection, and persists a `client_reported_server_rules` trail;
it does not claim authoritative physics, verified competition, or anti-cheat
proof.

Do not import runtime code from the source snapshot. Multiplayer networking,
online rooms, rankings, Wouter routes, PWA/service-worker behavior, local
browser identity, and the standalone server remain quarantined and disabled.

Keep all five promoted files synchronized with source provenance and run the
deterministic hash, rules, and gameplay tests before changing them.
