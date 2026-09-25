# OperatorOS — Choose your lane

This campaign introduces the three audience paths and sends each business owner
to the most relevant application. The material is prepared, not posted. Confirm
the new landing pages are published before using their destination links.

## Included

- **12 PNG graphics:** an overview plus TradeFlowKit, TechDeck, and PulseDesk,
  each in square (1080 × 1080), portrait (1080 × 1350), and landscape
  (1200 × 630) formats.
- **12 finished captions:** Facebook, LinkedIn, and X versions for each theme.
  X versions are 180–230 characters including the full destination URL.
- **social-posts.csv:** captions, suggested image, destination, and alt text.
- **source-art:** three original ImageGen photographs. People are illustrative;
  they are not actual customers, staff, endorsements, or testimonials.
- **generation-prompts.md:** the exact photography briefs.
- **manifest.json:** dimensions and file sizes for the delivered exports.
- **Editable generator:** `scripts/build-audience-campaign.mjs` in the repository.

## Message and destination

| Audience | Application | Main message | Destination |
| --- | --- | --- | --- |
| Overview | OperatorOS | You run the business. Choose your lane. | https://operatoros.net/ |
| Trade Companies | TradeFlowKit | Less chasing. More paid work. | https://operatoros.net/for/trades |
| MSPs | TechDeck | Clear tickets. Confident handoffs. | https://operatoros.net/for/msps |
| Healthcare / Legal-office operations | PulseDesk | Keep the office moving. | https://operatoros.net/for/healthcare-legal |

Use a focused audience graphic with its matching page. The overview belongs on
the general company feed or in an introduction to the platform. The filenames
describe dimensions, not a guarantee about any platform's current crop or ad rules;
review the final crop and alt text in the publishing tool.

## Suggested first sequence

1. Introduce the three choices with the overview.
2. Share the TradeFlowKit post and its focused page.
3. Share the TechDeck post and its focused page.
4. Share the PulseDesk operations post and its focused page.

Space these across a week after publication. Review comments and actual link
visits before repeating or paying to promote anything. The Facebook and LinkedIn
links include campaign tags; these tags do not themselves install analytics or
prove tracking is configured. No advertising spend or scheduled posts were created.

## Claim boundaries

PulseDesk is purpose-built for healthcare operations. Legal-office material refers
only to facilities, supplies, equipment, vendors, and internal requests. It does
not advertise clinical records, legal cases, court deadlines, trust accounting,
or compliance certification.

The campaign does not claim that Microsoft 365, Google, QuickBooks Online,
Facebook, LinkedIn, or X are already connected inside OperatorOS. Provider
configuration and acceptance remain separate. Shared customer identity is available
for linked records in TradeFlowKit, BrandForge OS, and SnapProofOS within the same
organization and subject to application access; it is not universal synchronization
of every module record or historical document.

## Rebuild

From the repository root, run `node scripts/build-audience-campaign.mjs` after the
frozen workspace install. The script reads the three source PNGs, uses the existing
unchanged OperatorOS mark, and writes the exports and manifest. To reproduce the
bold typography, set `CAMPAIGN_FONT_DIR` to an installed open-licensed font folder
containing `LiberationSans-Regular.ttf` and `LiberationSans-Bold.ttf`. The generated
PNG files already include their text; recipients do not need a font installation.

The website uses optimized WebP photography and its own selectable, accessible
text. The four landscape PNGs also supply the website's social previews.
