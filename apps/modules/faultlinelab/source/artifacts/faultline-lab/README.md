# Faultline Lab

Diagnostic challenge platform for technical minds. Investigate realistic
incidents — networking, Windows / AD, servers, electronics, automotive — and
practice the same root-cause workflow used by professionals in the field.

A **Shotgun Ninjas Productions** release.

---

## Where Faultline Lab fits in the ecosystem

Shotgun Ninjas Productions builds operator tooling for technical work.
Faultline Lab is the **training and evaluation surface** for that ecosystem:
players sharpen the diagnostic and decision-making muscles that the rest of
the suite then puts to use in production work.

| Product                       | Role                                                        | Relationship to Faultline Lab                                                                |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **ShotgunNinjas.com**         | Central ecosystem hub                                       | Linked from every screen footer; entry point to all products.                                |
| **TechDeck.app**              | IT operations cockpit, scripts, automation, MSP tooling     | Featured cross-link on networking / Windows-AD / servers / electronics debriefs.             |
| **TorqueShed.pro**            | Automotive diagnostics, repair cases, parts, mechanic community | Featured cross-link on automotive debriefs.                                              |
| **TradeFlowKit.com**          | Business operations / revenue command center                | Surfaced via the ecosystem footer.                                                           |
| **PulseDesk.support**         | Healthcare operations coordination                          | Surfaced via the ecosystem footer.                                                           |
| **ShotgunNinjaVillage.com**   | Community, entertainment, games, merch, creator hub         | Surfaced via the ecosystem footer.                                                           |

### Cross-promo placement

- **`EcosystemFooter`** (full + compact variants) is mounted on Boot,
  Incident Board, Store, and Debrief screens. Subtle red accent dot only —
  the rest of the brand stays cyan / emerald / mono so Faultline Lab keeps
  its own identity.
- **`EcosystemCrossPromo`** appears on the Debrief screen and selects the
  most relevant 2 sibling products based on the case category. Placement is
  intentionally below the "What to play next" recommendations so the
  in-product upsell stays primary.

## Brand & UX consistency

- Background `#0a0e14`, accents cyan-400 / emerald-400, mono is JetBrains
  Mono. Subtle red accent (`bg-red-500/70` dot, `text-red-400/80` link)
  reserved for ecosystem references only.
- No emojis anywhere in product copy.
- Pricing language is consistent across the suite: free tools stay free
  forever; paid items show clear `$X.XX` or `$X.XX/mo` formatting via
  `formatPrice` in `src/data/catalog.ts`.
- Account / billing flow uses Clerk for auth and Stripe Checkout via the
  server's `/api/stripe/checkout-by-catalog` (catalog id only — never a
  client-supplied price id).
- Support / contact path: every footer links back to ShotgunNinjas.com,
  which is the central support entry point.
- OpenGraph metadata names Shotgun Ninjas Productions as the site owner so
  social previews are consistent across the ecosystem.
- Demo / unauthenticated visitors get the four free starter cases
  (`FREE_CASE_IDS`) and the same look as signed-in users — no degraded
  preview experience.

## Deployment

For taking Faultline Lab from dev to production (Clerk live keys, Stripe
webhook configuration, schema verification, and the pre-launch checklist) see
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Local development

This package lives in the `pnpm` monorepo. From the repo root:

```bash
pnpm --filter @workspace/faultline-lab run dev      # vite dev server
pnpm --filter @workspace/faultline-lab run build    # production build
pnpm --filter @workspace/faultline-lab run test     # vitest unit suite
pnpm run typecheck                                   # full repo typecheck
```

The accompanying API service is `@workspace/api-server`; it owns the Stripe
webhook handler, entitlement grants, and admin endpoints.

## Architecture notes

- Frontend: React 18 + Vite + Zustand + Framer Motion + Tailwind
- Auth: Clerk (`@clerk/clerk-react`)
- Payments: Stripe via `stripe-replit-sync` on the server
- Cases live in `src/data/cases/*.ts`, registered via `_authoring.ts`
- Premium tools (Wireshark, Telemetry, Chaos, Sandbox, Analytics) gated by
  `hasFeature()` in `src/lib/entitlements.ts`
- Free tier enforced by `FREE_CASE_IDS` in `src/lib/entitlements.ts`
