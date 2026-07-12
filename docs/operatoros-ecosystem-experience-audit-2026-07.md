# OperatorOS Ecosystem Experience Audit

Date: 2026-07-11

## Executive verdict

OperatorOS has the difficult platform foundations already: centralized identity, tenant-scoped entitlements, one-time SSO handoffs, registry-driven modules, auditable billing events, and honest locked/planned states. The main product risk is not missing capability; it is that the capability is presented through several visual eras and two different commercial stories.

This pass aligns the highest-traffic surfaces around one outcome-led narrative: OperatorOS is the free command layer, a core product starts the paid stack, included apps add immediate value, and companion modules expand the ecosystem.

## What is strong

- SSO authority is correctly centralized. Child modules consume a short-lived, audience-bound, one-time token instead of owning login or trusting client-side state.
- Tenant and entitlement checks happen server-side at issue and consume time. This is a strong foundation for selling multiple modules without creating access drift.
- The module registry gives the ecosystem one vocabulary for status, URL, tenant requirements, entitlement key, and launch behavior.
- Public module cards use real imagery, named audiences, outcomes, and honest states instead of generic placeholders.
- Pricing already supports a useful stack model: free command layer, core products, included apps, one free companion, extra modules, and extra seats.
- Module launch errors are translated into user-safe messages, and unavailable modules do not pretend to launch.
- Reduced-motion handling, semantic headings, route-aware navigation, and clear server-authority documentation are solid accessibility and maintainability signals.

## What was weakening the experience

- The public brand, sign-in experience, authenticated shell, and upgrade modal looked like different products.
- The homepage led with implementation language such as Stripe, tenant scope, entitlement rails, and SSO handoffs before explaining the user outcome.
- The modules page repeated a large introduction before showing any modules, pushing the useful content below the first viewport.
- The pricing hero used a cropped wordmark image rather than showing the connected ecosystem the buyer was configuring.
- The authenticated launcher grouped modules accurately but did not tell a new tenant what to do next.
- Upgrade failures were logged to the console without giving the buyer actionable feedback.
- Several structural marketing tests had stale expectations and no longer described the product that was actually shipping.

## Improvements implemented

- Rebuilt sign-in as a responsive, branded ecosystem entry with the real OperatorOS mark and command-nexus media.
- Added clear SSO value framing: identity, tenant context, roles, and module access follow the user automatically.
- Rewrote the homepage hero around a plain outcome and made the free entry point explicit.
- Simplified the modules page to one heading and brought core products into the first viewport.
- Replaced the pricing wordmark crop with the ecosystem command-nexus visual.
- Added an activation path to the authenticated launcher: team space, active stack, first workflow.
- Added a context-aware next action that routes toward team selection, core-product activation, first launch, or ecosystem expansion.
- Replaced the authenticated shell's placeholder “O” tile with the official OperatorOS mark.
- Improved the upgrade dialog's visual hierarchy, Escape behavior, dialog semantics, resource context, and error feedback.
- Updated stale structural tests to match the current navigation, font loading, middleware contract, and revised marketing language.

## Important remaining risks

### 1. Pricing model convergence

The public pricing flow sells core products plus modules and seats, while the legacy upgrade modal still reasons about Starter, Pro, and Elite plans. Styling is now aligned, but the commercial model is not. This should be resolved before scaling acquisition because two purchase vocabularies increase hesitation, support load, and entitlement mistakes.

Recommended direction: make the stack configurator the canonical purchase model everywhere, then map any retained tiers to internal billing metadata rather than exposing both models to customers.

### 2. Child-module experience contract

The technical SSO contract is strong, but the experience contract should become equally explicit. Every linked module should share:

- an OperatorOS-origin indicator;
- active tenant and role context;
- a consistent “Back to OperatorOS” path;
- loading, expired handoff, access revoked, and tenant mismatch states;
- the same module name, logo, status, and entitlement language as the registry;
- a consistent re-authentication path that preserves the intended destination.

### 3. Proof of value after launch

The ecosystem can sell more effectively when it reports outcomes instead of only access. Add a weekly “value receipt” showing launches, automated handoffs, time saved, completed work, team adoption, and unused entitlements. This creates a natural retention and expansion loop without aggressive paywalls.

### 4. Module maturity parity

Some modules are full products while others are shells or early workflows. Keep the current honest status model, but add a common maturity rubric: Preview, Beta, Production, and Planned. Pair each with a clear expectation and feedback path.

## Growth opportunities

- Invite loop: prompt an owner to invite the first teammate immediately after the first successful module launch.
- Workflow-based cross-sell: recommend the next module from actual actions, not generic popularity.
- Companion preview: let a tenant try one guided companion workflow before selecting its included module.
- Annual value framing: show annual savings only after the user has configured a meaningful stack.
- Expansion guardrails: explain what an extra module connects to and the outcome it adds before showing its price.
- Ecosystem health score: combine activation, team adoption, SSO success, and connected workflows into one understandable progress measure.

## Audit evidence and limits

Captured surfaces: homepage, module catalog, pricing, and sign-in at a 1280×720 desktop viewport. The authenticated activation path and upgrade modal were reviewed from source and type-checked because no seeded authenticated tenant was available in this local session. Screenshot review can identify visible hierarchy, spacing, cropping, and copy issues; it does not prove full WCAG compliance, screen-reader behavior, or production SSO success across deployed subdomains.
