import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const campaignDir = path.resolve(scriptDir, '..');
const copyDir = path.join(campaignDir, 'copy');
const data = JSON.parse(await fs.readFile(path.join(campaignDir, 'campaign-data.json'), 'utf8'));

await fs.mkdir(copyDir, { recursive: true });

const checks = [];
const check = (platform, field, values, max) => {
  values.forEach((value, index) => checks.push({
    platform,
    field,
    index: index + 1,
    value,
    chars: [...value].length,
    max,
    valid: [...value].length <= max,
  }));
};

check('Google', 'headline', data.copy.google.headlines, 30);
check('Google', 'long_headline', data.copy.google.longHeadlines, 90);
check('Google', 'description', data.copy.google.descriptions, 90);
check('Google', 'business_name', [data.copy.google.businessName], 25);
check('Meta', 'primary_text_visible', data.copy.meta.primaryText, 125);
check('Meta', 'headline', data.copy.meta.headlines, 40);
check('Meta', 'description', data.copy.meta.descriptions, 30);
check('LinkedIn', 'intro_text', data.copy.linkedin.introText, 150);
check('LinkedIn', 'headline', data.copy.linkedin.headlines, 70);
check('LinkedIn', 'description', data.copy.linkedin.descriptions, 70);
check('TikTok', 'ad_text', data.copy.tiktok.adText, 100);
check('TikTok', 'display_name', [data.copy.tiktok.displayName], 40);

const failures = checks.filter((item) => !item.valid);

const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
const rowsToCsv = (headers, rows) => [
  headers.map(csvCell).join(','),
  ...rows.map((row) => row.map(csvCell).join(',')),
].join('\n') + '\n';

const googleCsv = rowsToCsv(
  ['asset_type', 'text', 'character_count', 'maximum', 'destination_url'],
  [
    ...data.copy.google.headlines.map((value) => ['headline', value, [...value].length, 30, data.campaign.landingPage]),
    ...data.copy.google.longHeadlines.map((value) => ['long_headline', value, [...value].length, 90, data.campaign.landingPage]),
    ...data.copy.google.descriptions.map((value) => ['description', value, [...value].length, 90, data.campaign.landingPage]),
    ['business_name', data.copy.google.businessName, [...data.copy.google.businessName].length, 25, data.campaign.landingPage],
  ],
);

const paidSocialRows = [];
for (const [platform, fields] of [
  ['meta', data.copy.meta],
  ['linkedin', data.copy.linkedin],
  ['tiktok', data.copy.tiktok],
]) {
  for (const [field, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      paidSocialRows.push([platform, field, entry, [...entry].length, data.campaign.landingPage]);
    }
  }
}
const paidSocialCsv = rowsToCsv(
  ['platform', 'asset_type', 'text', 'character_count', 'destination_url'],
  paidSocialRows,
);

const validationCsv = rowsToCsv(
  ['platform', 'field', 'variation', 'text', 'character_count', 'maximum', 'valid'],
  checks.map((item) => [item.platform, item.field, item.index, item.value, item.chars, item.max, item.valid]),
);

const organicMd = `# Organic social posts

## Facebook

${data.copy.organic.facebook}

## LinkedIn

${data.copy.organic.linkedin}

## Instagram

${data.copy.organic.instagram}

## TikTok caption

${data.copy.organic.tiktok}

## Comment replies

**What does OperatorOS cost?**  
OperatorOS itself is $0. TechDeck is $99/month. TradeFlowKit and PulseDesk are
$149/month. Every paid main track includes 5 operator seats and one selectable
companion application.

**Which track is right for me?**  
Use TradeFlowKit for service and revenue operations, PulseDesk for healthcare
operations coordination, or TechDeck for IT and MSP operations. The pricing
page shows the full stack builder: <https://operatoros.net/pricing>.

**Can I add more apps or people?**  
Yes. Additional companion applications are $29/month each, and additional
operator seats are $15/month each. Final pricing is confirmed at checkout.
`;

const platformMd = `# Paid advertising copy

All copy below was validated against the working limits recorded in
\`copy-validation.csv\`. Recheck platform requirements in the ad account before
upload because placement rules can change.

## Google responsive ads

### Headlines — 30 characters maximum

${data.copy.google.headlines.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

### Long headlines — 90 characters maximum

${data.copy.google.longHeadlines.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

### Descriptions — 90 characters maximum

${data.copy.google.descriptions.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

Business name: **${data.copy.google.businessName}**

## Meta — Facebook and Instagram

### Primary text

${data.copy.meta.primaryText.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

### Headlines

${data.copy.meta.headlines.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

### Descriptions

${data.copy.meta.descriptions.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

Recommended CTA: **Learn More** for awareness, then **Sign Up** only after the
release and checkout gates are approved.

## LinkedIn

### Introductory text

${data.copy.linkedin.introText.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

### Headlines

${data.copy.linkedin.headlines.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

### Descriptions

${data.copy.linkedin.descriptions.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

Recommended CTA: **Learn More**.

## TikTok

${data.copy.tiktok.adText.map((value, index) => `${index + 1}. ${value} (${[...value].length})`).join('\n')}

Display name: **${data.copy.tiktok.displayName}**
`;

const utmRows = [
  ['facebook', 'paid_social', 'overview_square'],
  ['facebook', 'paid_social', 'track_tradeflowkit'],
  ['facebook', 'paid_social', 'track_pulsedesk'],
  ['facebook', 'paid_social', 'track_techdeck'],
  ['instagram', 'paid_social', 'overview_feed'],
  ['instagram', 'paid_social', 'overview_story'],
  ['instagram', 'paid_social', 'tracks_video_vertical'],
  ['linkedin', 'paid_social', 'overview_landscape'],
  ['linkedin', 'paid_social', 'tracks_video_landscape'],
  ['google', 'display', 'rda_clean_landscape'],
  ['google', 'display', 'rda_clean_square'],
  ['google', 'search', 'rsa_three_tracks'],
  ['tiktok', 'paid_social', 'tracks_video_vertical'],
].map(([source, medium, content]) => {
  const url = new URL(data.campaign.landingPage);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', data.campaign.slug);
  url.searchParams.set('utm_content', content);
  return [source, medium, data.campaign.slug, content, url.toString()];
});

const uploadGuideMd = `# Platform upload guide

## Approval boundary

The material is ready for owner review. Do not activate paid spend until the
current production release, checkout, pricing, legal, privacy, support, and
measurement gates are approved. This package does not publish anything.

## Asset map

### Facebook and Instagram

- Feed square: \`operatoros-overview-square-1200x1200.png\`
- Instagram 4:5 feed: \`operatoros-overview-feed-1080x1350.png\`
- Stories/Reels: \`operatoros-overview-story-1080x1920.png\`
- Track-specific square/story assets: use one product per ad set.
- Video: \`operatoros-three-tracks-vertical-1080x1920.mp4\` for Reels/Stories;
  use the square version for feed placements.

### LinkedIn

- Single-image landscape: \`operatoros-overview-landscape-1200x628.png\`
- Single-image square: \`operatoros-overview-square-1200x1200.png\`
- Video: landscape MP4 for desktop/mobile; square MP4 for feed testing.

### Google Ads

- Responsive-display landscape: \`google-rda-clean-landscape-1200x628.png\`
- Responsive-display square: \`google-rda-clean-square-1200x1200.png\`
- Responsive-display vertical: \`google-rda-clean-vertical-900x1600.png\`
- Square logo: \`operatoros-logo-square-1200x1200.png\`
- Use \`google-responsive-copy.csv\` for the asset text. The clean images
  intentionally contain minimal text because Google assembles responsive
  layouts from separate image, logo, headline, and description assets.

### TikTok

- Primary: vertical 9:16 MP4 with captions and audio.
- Keep important copy inside the center safe area; the rendered vertical ad
  already reserves space for native UI overlays.
- Use the short captions in \`paid-social-copy.csv\`.

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
`;

const videoScriptsMd = `# Video scripts

## 15-second captioned cut — rendered

| Time | On-screen copy | Visual |
|---:|---|---|
| 0.0–2.2 | Your business does not need another pile of apps. | Three operational paths emerge from the dark. |
| 2.2–4.1 | It needs one command layer. | OperatorOS command core. |
| 4.1–6.3 | Service & Revenue · TradeFlowKit · $149/mo | Revenue workflow track. |
| 6.3–8.5 | Healthcare Operations · PulseDesk · $149/mo | Clinical operations track. |
| 8.5–10.7 | IT & MSP Operations · TechDeck · $99/mo | Technical operations track. |
| 10.7–13.0 | OperatorOS $0 · 5 seats + 1 companion app included | Pricing summary. |
| 13.0–15.0 | Build Your Stack · operatoros.net/pricing | Logo and CTA. |

The rendered videos include captions and an original synthetic audio bed. No
voiceover is required for comprehension.

## Optional voiceover — direct

“Your business does not need another pile of apps. It needs one command layer.
Choose TradeFlowKit for service revenue, PulseDesk for healthcare operations,
or TechDeck for IT and MSP work. Build your stack at OperatorOS dot net.”

## Optional voiceover — pricing-led

“OperatorOS starts at zero dollars. Choose TechDeck at ninety-nine a month, or
TradeFlowKit or PulseDesk at one forty-nine. Every paid track includes five
seats and one companion app. Build your stack at OperatorOS dot net.”

## 30-second founder-camera outline

1. Hook: “Most businesses do not need more apps. They need their tools to act
   like one operation.”
2. Concept: “OperatorOS is the command layer for sign-in, organization access,
   billing, module launch, entitlements, and audit history.”
3. Tracks: name TradeFlowKit, PulseDesk, and TechDeck with their audiences and
   current monthly prices.
4. Inclusions: five seats and one selectable companion application.
5. CTA: “Choose the track built for your work at operatoros.net/pricing.”

Record in a quiet environment, frame vertically, keep the first sentence under
two seconds, and add the provided captions. Do not claim production readiness,
HIPAA certification, guaranteed savings, guaranteed revenue, or provider
availability that has not been separately accepted.
`;

await Promise.all([
  fs.writeFile(path.join(copyDir, 'google-responsive-copy.csv'), googleCsv, 'utf8'),
  fs.writeFile(path.join(copyDir, 'paid-social-copy.csv'), paidSocialCsv, 'utf8'),
  fs.writeFile(path.join(copyDir, 'copy-validation.csv'), validationCsv, 'utf8'),
  fs.writeFile(path.join(copyDir, 'organic-social-posts.md'), organicMd, 'utf8'),
  fs.writeFile(path.join(copyDir, 'paid-ad-copy.md'), platformMd, 'utf8'),
  fs.writeFile(path.join(copyDir, 'platform-upload-guide.md'), uploadGuideMd, 'utf8'),
  fs.writeFile(path.join(copyDir, 'video-scripts.md'), videoScriptsMd, 'utf8'),
  fs.writeFile(path.join(copyDir, 'utm-links.csv'), rowsToCsv(
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'url'],
    utmRows,
  ), 'utf8'),
]);

console.log(JSON.stringify({ checked: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
