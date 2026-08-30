# Platform upload guide

## Approval boundary

The material is ready for owner review. Do not activate paid spend until the
current production release, checkout, pricing, legal, privacy, support, and
measurement gates are approved. This package does not publish anything.

## Asset map

### Facebook and Instagram

- Feed square: `operatoros-overview-square-1200x1200.png`
- Instagram 4:5 feed: `operatoros-overview-feed-1080x1350.png`
- Stories/Reels: `operatoros-overview-story-1080x1920.png`
- Track-specific square/story assets: use one product per ad set.
- Video: `operatoros-three-tracks-vertical-1080x1920.mp4` for Reels/Stories;
  use the square version for feed placements.

### LinkedIn

- Single-image landscape: `operatoros-overview-landscape-1200x628.png`
- Single-image square: `operatoros-overview-square-1200x1200.png`
- Video: landscape MP4 for desktop/mobile; square MP4 for feed testing.

### Google Ads

- Responsive-display landscape: `google-rda-clean-landscape-1200x628.png`
- Responsive-display square: `google-rda-clean-square-1200x1200.png`
- Responsive-display vertical: `google-rda-clean-vertical-900x1600.png`
- Square logo: `operatoros-logo-square-1200x1200.png`
- Use `google-responsive-copy.csv` for the asset text. The clean images
  intentionally contain minimal text because Google assembles responsive
  layouts from separate image, logo, headline, and description assets.

### TikTok

- Primary: vertical 9:16 MP4 with captions and audio.
- Keep important copy inside the center safe area; the rendered vertical ad
  already reserves space for native UI overlays.
- Use the short captions in `paid-social-copy.csv`.

## Campaign structure

1. **Ad set A — Service and revenue:** TradeFlowKit-specific creative.
2. **Ad set B — Healthcare operations:** PulseDesk-specific creative. Do not
   use medical outcome, patient-chart, HIPAA-certification, EHR, or clinical
   decision claims.
3. **Ad set C — IT and MSP:** TechDeck-specific creative.
4. **Retargeting — Platform overview:** the three-track overview and pricing
   creative for visitors who have already seen a track-specific ad.

## First A/B tests

Hold audience and landing page constant; change one creative variable at a
time.

| Test | Version A | Version B | Primary readout |
|---|---|---|---|
| Positioning | One command layer | Pick your business track | Landing-page view rate |
| Price framing | OperatorOS starts at $0 | Paid tracks start at $99 | Qualified click-through rate |
| Specificity | Three-track overview | One product/one audience | Pricing-page engagement |
| Format | Static square | 15-second motion ad | Cost per qualified visit |

Do not call a winner before each version has enough impressions and conversion
volume for a stable comparison. Record CTR, landing-page views, pricing-page
engagement, checkout starts, completed checkouts, and cost per completed
checkout separately.

## Measurement notes

- Keep checkout completion as the commercial conversion only after Stripe and
  production acceptance are approved.
- Before that gate, use pricing-page views or a clearly labeled waitlist/contact
  action rather than pretending a sale completed.
- Do not place secrets, private tenant data, customer screenshots, or provider
  credentials in tracking parameters or creatives.
