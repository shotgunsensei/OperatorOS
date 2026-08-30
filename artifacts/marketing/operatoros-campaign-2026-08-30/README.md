# OperatorOS campaign kit

## Campaign concept

**One Command Layer. Three Operating Tracks.**

OperatorOS is positioned as the free command layer above three main paid
operating tracks. The business chooses the track that matches its work:

1. **Service and revenue operations** — TradeFlowKit — **$149/month**
2. **Healthcare operations** — PulseDesk — **$149/month**
3. **IT and MSP operations** — TechDeck — **$99/month**

Every paid main track includes 5 operator seats and one selectable companion
application. Additional companion applications are $29/month. Additional
seats are $15/month each. OperatorOS is $0, and TorqueShed, FaultlineLab, and
Operator Pool Hall are free with any account.

## Launch status

These assets are **approval-ready and not published**. They do not authorize
ad spend, posting, campaign activation, billing changes, deployment, or a
production release. Before activating paid media, confirm that the current
OperatorOS release gate is approved and that pricing, Stripe products, legal
policies, tax/refund language, privacy/retention language, support readiness,
and healthcare-adjacent boundaries have owner/adviser approval.

## Package contents

- `static/` — exported PNG advertisements in platform-ready aspect ratios.
- `static/editable/` — editable SVG source for every text-forward static ad.
- `video/` — captioned 15-second MP4/WebM motion ads, posters, captions, and
  optional voiceover scripts.
- `copy/` — post copy, paid-ad upload copy, UTM links, audience guidance, and
  an A/B testing plan.
- `source/` — approved/generated visual source material used by the campaign.
- `scripts/` — deterministic renderers and validators.
- `manifest.json` — generated dimensions, file sizes, and SHA-256 hashes.

## Primary call to action

**Build Your Stack** — <https://operatoros.net/pricing>

## Recommended first test

Run one controlled message test per track rather than blending all audiences
inside one ad set:

- Service-business owners and operations leads → TradeFlowKit creative.
- Healthcare operations managers and department coordinators → PulseDesk
  creative. Keep every claim operational and PHI-minimizing; do not imply EHR,
  medical-device, clinical-decision, HIPAA certification, or patient-chart
  functionality.
- MSP owners, IT managers, senior technicians, and internal IT teams →
  TechDeck creative.

Use the overview campaign for retargeting and brand awareness after each track
has enough impressions to establish a baseline.

## Regeneration

From the repository root, use the bundled Codex workspace Node runtime and
packages:

```powershell
$env:NODE_PATH='C:\Users\John Xodus\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\John Xodus\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'artifacts\marketing\operatoros-campaign-2026-08-30\scripts\render-static.mjs'
& 'C:\Users\John Xodus\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'artifacts\marketing\operatoros-campaign-2026-08-30\scripts\render-copy.mjs'
```

The video renderer also requires an FFmpeg build with H.264 and AAC encoders.
The generated package records the exact renderer path and version in
`manifest.json`; the binary is not copied into the campaign package.
