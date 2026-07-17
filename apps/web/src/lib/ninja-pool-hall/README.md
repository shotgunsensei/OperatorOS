# Ninja Pool Hall native engine slice

`physics.ts` and `types.ts` are exact promoted copies from the quarantined
Ninja Pool Hall snapshot at commit `62439c4018ec551ce2891800351200c8ab2cb9e7`:

`apps/modules/ninja-pool-hall/source/artifacts/pool/src/lib/`

The first shared-runtime slice intentionally promotes only the pure,
deterministic free-shoot engine. Do not import runtime code from the source
snapshot. Multiplayer networking, Wouter routes, the bot, competitive rules,
PWA/service-worker behavior, local browser identity, and the standalone server
remain quarantined until separately reviewed.

Keep physics tuning synchronized with source provenance and run deterministic
scenario tests before changing constants.
