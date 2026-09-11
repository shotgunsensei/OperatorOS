CallCommand tenants previously had to work through six technical setup stages and select their number again after billing. This adds a persisted three-step journey: describe the business, choose a priced number, and enable/test the prepared receptionist. New businesses receive an actionable follow-up workflow; existing configuration and advanced controls remain available.

Number billing now validates the displayed Stripe price, persists/replays checkout operations, handles current invoice metadata, settles actual paid subscription quantities, preserves paid service during failed upgrades, and rejects stale/unrelated billing events. Activation verifies the exact line; Realtime starts the initial greeting under existing consent rules; routing repair detects provider overrides and preserves scheduled releases.

Database release v61 appends `callcommand_guided_setup` after the unchanged first 60 steps. Production requires the backed-up supported apply and independent verification before publication. No live call, phone purchase, Stripe catalog mutation, or complete usage invoicing is represented as verified.

Validation in the isolated release checkout: 209 focused API/billing/release checks, 52 unit checks, 6 release-identity checks, and 3 guided browser cases pass. Fixture cleanup and the existing advanced-routing journey also pass the 182-test CallCommand/tier sequence, an 18-test setup/tier sequence, and the complete CallCommand SSO/persistence browser test. Frozen install, production build/typechecks, clean v61 apply, and Phase 39 hardening pass. The full exact-commit CI gate is required before merge; unrelated interface work remains outside the PR.

The investigation and current release gate document remaining live-provider, usage-billing, offline setup continuation, and Autoscale acceptance work. Owner authorization covers commit, PR to main, Replit pull, and publication of this candidate.

The release updates vulnerable Next.js, sharp, xmldom, qs, js-yaml, decode-uri-component, and affected uuid resolutions. The dependency audit reports zero unresolved advisories and zero critical findings. The two existing patched high advisory records remain disclosed; no exception was widened. Android and iOS device/deep-link checks passed for the dependency repair; the latest test-only revision is being checked again.

