import type { KitInput, KitContent } from "./generator";
import type { BrandProfile } from "@workspace/db";
import type { PlanId } from "./features";

export interface VisualBrief {
  id: string;
  title: string;
  category: "image" | "brand";
  dimensions: string | null;
  tools: string[];
  brief: string;
  locked: boolean;
}

export interface VisualPromoKit {
  briefs: VisualBrief[];
  brandColors: string[];
  fontPairings: { heading: string; body: string; vibe: string }[];
  whiteLabel: boolean;
  currentPlan: PlanId;
  generatedAt: string;
}

const FREE_UNLOCKED = new Set(["facebook-ad"]);

function pick<T>(arr: T[], idx: number, fallback: T): T {
  return arr[idx % Math.max(arr.length, 1)] ?? fallback;
}

function inferIndustryPalette(businessType: string): { primary: string; accent: string; neutral: string; vibe: string } {
  const t = businessType.toLowerCase();
  if (/auto|mechanic|repair|garage/.test(t))
    return { primary: "#0F172A", accent: "#F97316", neutral: "#E2E8F0", vibe: "rugged industrial — steel + safety orange" };
  if (/health|fitness|gym|coach|wellness/.test(t))
    return { primary: "#0E7C66", accent: "#FACC15", neutral: "#F8FAFC", vibe: "energetic + clean — fresh greens with sunny accents" };
  if (/cyber|tech|it|msp|software|saas/.test(t))
    return { primary: "#0B1220", accent: "#22D3EE", neutral: "#94A3B8", vibe: "high-tech, secure — deep navy with electric cyan" };
  if (/food|restaurant|cafe|bakery|coffee/.test(t))
    return { primary: "#7C2D12", accent: "#FBBF24", neutral: "#FEF3C7", vibe: "appetizing + warm — terracotta with golden highlights" };
  if (/beauty|salon|barber|spa|nail/.test(t))
    return { primary: "#1F2937", accent: "#EC4899", neutral: "#FAF5FF", vibe: "elevated + chic — charcoal with rose accents" };
  if (/real ?estate|realtor|home|property/.test(t))
    return { primary: "#0C4A6E", accent: "#D4A574", neutral: "#F1F5F9", vibe: "trusted + premium — deep teal with warm gold" };
  if (/clean|home service|lawn|pool|pressure|roofing|handy/.test(t))
    return { primary: "#1E40AF", accent: "#22C55E", neutral: "#F0FDF4", vibe: "trustworthy + active — strong blue with fresh green" };
  if (/event|community|nonprofit|church/.test(t))
    return { primary: "#581C87", accent: "#F59E0B", neutral: "#FAF5FF", vibe: "celebratory + inclusive — royal purple with warm amber" };
  if (/music|art|creative|podcast|video|photo/.test(t))
    return { primary: "#18181B", accent: "#A855F7", neutral: "#F4F4F5", vibe: "bold + creative — near-black canvas with electric purple" };
  if (/digital|course|education|coach|consult/.test(t))
    return { primary: "#1E3A8A", accent: "#10B981", neutral: "#F8FAFC", vibe: "modern + authoritative — indigo with success green" };
  return { primary: "#111827", accent: "#DC2626", neutral: "#F3F4F6", vibe: "bold contrast — graphite with signature red" };
}

function brandPaletteFor(input: KitInput, brand?: BrandProfile | null) {
  if (brand) {
    return {
      primary: brand.primaryColor,
      accent: brand.accentColor,
      neutral: "#F8FAFC",
      vibe: `Custom brand palette for ${brand.name}`,
    };
  }
  return inferIndustryPalette(input.businessType);
}

function brandLabel(input: KitInput, brand?: BrandProfile | null): string {
  return brand?.logoText || brand?.name || `Your ${input.businessType} brand`;
}

function whiteLabelFooter(plan: PlanId): string {
  if (plan !== "agency") return "";
  return [
    "",
    "—",
    "WHITE-LABEL DELIVERY NOTES (Agency tier):",
    "• This brief contains no NinjaLaunchKit attribution — safe to deliver under your agency's brand.",
    "• Replace 'Your brand' / placeholder names with the client's brand kit before handoff.",
    "• Include this brief verbatim in your client deliverables folder.",
    "",
  ].join("\n");
}

function fmt(label: string, value: string): string {
  return `${label}\n${value}`;
}

function bullets(items: string[]): string {
  return items.map((i) => `• ${i}`).join("\n");
}

function buildFacebookAdBrief(input: KitInput, content: KitContent, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  const headline = content.adHeadlines?.[0] ?? content.heroHeadline;
  const offer = content.offerStack?.[0] ?? content.valueProposition;
  return [
    "FACEBOOK / META FEED AD IMAGE — CREATIVE BRIEF",
    "",
    fmt("FORMAT", "1200 x 628 px (1.91:1 landscape). Keep text under 20% of image area for best delivery."),
    "",
    fmt("OBJECTIVE", `Stop the scroll for ${input.targetCustomer} and drive ${input.desiredAction.toLowerCase()}.`),
    "",
    "COMPOSITION",
    bullets([
      `LEFT 55%: hero subject — a real ${input.businessType.toLowerCase()} moment (person, product, or result). No stock-photo handshakes.`,
      "RIGHT 45%: bold headline overlay on a solid color block (palette PRIMARY) with 24px padding.",
      "Add a thin 4px border in ACCENT color along the right edge for scroll-stopping contrast.",
    ]),
    "",
    fmt("HEADLINE OVERLAY (max 7 words)", `"${headline}"`),
    fmt("SUBLINE (1 line, smaller)", offer),
    fmt("CTA CHIP (bottom-right pill)", content.ctaButtons?.[0] ?? "Get Started"),
    fmt("BRAND MARK", `Small ${brandText} logo lockup in bottom-left corner, max 80px wide.`),
    "",
    "COLOR PALETTE (hex)",
    bullets([
      `PRIMARY: ${palette.primary} — used for the right block + headline background`,
      `ACCENT: ${palette.accent} — used for CTA chip + 4px edge border`,
      `NEUTRAL: ${palette.neutral} — headline text color on PRIMARY block`,
    ]),
    "",
    fmt("MOOD / STYLE", palette.vibe + ". Authentic, in-the-moment. Avoid heavy gradients and gloss."),
    fmt("DO NOT", "Do not use cliche stock photos, lens flares, comic-sans-style fonts, or low-contrast text on busy backgrounds."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "Canva: search 'Facebook Ad' template, set canvas 1200x628, paste this brief into the comments.",
      "Adobe Express: 'Social Post (Landscape)' — apply the hex codes above as brand colors.",
      "AI image prompt: \"Photorealistic editorial photo, " + input.businessType.toLowerCase() + " setting, " + input.targetCustomer.toLowerCase() + ", soft natural light, shallow depth of field, leave clear right-side negative space for text overlay, color palette dominated by " + palette.primary + " and " + palette.accent + ", 1200x628 aspect ratio\".",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildInstagramSquareBrief(input: KitInput, content: KitContent, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  const hook = pick(content.socialPosts ?? [], 0, content.heroHeadline).split("\n")[0];
  return [
    "INSTAGRAM SQUARE POST — CREATIVE BRIEF",
    "",
    fmt("FORMAT", "1080 x 1080 px (1:1)."),
    fmt("OBJECTIVE", `Earn the save/share from ${input.targetCustomer} by leading with a curiosity-gap hook.`),
    "",
    "COMPOSITION (3-zone vertical split)",
    bullets([
      "TOP 25%: short hook in oversized weight-900 type (max 6 words). Left-aligned, two lines max.",
      "MIDDLE 60%: photographic or illustrated focal — must reinforce the hook literally.",
      "BOTTOM 15%: minimal CTA strip + brand mark. No URL — that's in the bio.",
    ]),
    "",
    fmt("HEADLINE / HOOK", `"${(hook ?? content.heroHeadline).slice(0, 60)}"`),
    fmt("CTA TEXT", content.ctaButtons?.[1] ?? content.ctaButtons?.[0] ?? "DM us 'GO'"),
    fmt("BRAND MARK", `${brandText} wordmark, bottom-right, 60% opacity.`),
    "",
    "COLOR PALETTE",
    bullets([
      `Background: ${palette.neutral}`,
      `Headline type: ${palette.primary}`,
      `Hook underline + CTA strip: ${palette.accent}`,
    ]),
    "",
    fmt("STYLE NOTES", palette.vibe + ". Use a hand-drawn underline or highlight under one keyword for thumb-stopping rhythm."),
    fmt("DO NOT", "Do not center-align body text. Do not use more than two type weights. Do not put the logo bigger than the hook."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "Canva: 'Instagram Post (Square)' → apply the palette as a brand kit.",
      "Figma: frame 1080x1080, auto-layout the three zones at 25/60/15%.",
      "AI prompt: \"Editorial 1:1 image, " + input.businessType.toLowerCase() + ", clean negative space top and bottom for text overlay, soft daylight, " + palette.primary + " + " + palette.accent + " as accent colors\".",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildInstagramStoryBrief(input: KitInput, content: KitContent, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  return [
    "INSTAGRAM / TIKTOK STORY — CREATIVE BRIEF",
    "",
    fmt("FORMAT", "1080 x 1920 px (9:16). Keep all critical content inside the safe zone (250px top + 250px bottom margin)."),
    fmt("OBJECTIVE", `Tap-through to ${input.desiredAction.toLowerCase()} via the link sticker.`),
    "",
    "COMPOSITION (top-to-bottom)",
    bullets([
      "0-250px: SAFE ZONE (avatar/menu overlay) — leave empty.",
      "250-900px: full-bleed visual or product moment.",
      "900-1300px: oversized headline on a translucent slab in PRIMARY @ 88% opacity.",
      "1300-1670px: 3 quick value bullets, each prefixed with an emoji or icon (use ACCENT for icons).",
      "1670-1920px: SAFE ZONE — leave space for native sticker (link / poll / countdown).",
    ]),
    "",
    fmt("HEADLINE", `"${(content.adHeadlines?.[1] ?? content.heroHeadline).slice(0, 50)}"`),
    "BULLET LINES (≤4 words each)",
    bullets((content.offerStack ?? []).slice(0, 3).map((b) => b.replace(/\.$/, ""))),
    fmt("STICKER PROMPT", `Add native LINK sticker labeled "${content.ctaButtons?.[0] ?? "Tap to claim"}" centered at y=1750.`),
    fmt("BRAND MARK", `${brandText} logo bottom-left at y=1740, 64px tall.`),
    "",
    "COLOR PALETTE",
    bullets([
      `Background fill / slab: ${palette.primary}`,
      `Body text on slab: ${palette.neutral}`,
      `Bullet icons + sticker outline: ${palette.accent}`,
    ]),
    "",
    fmt("MOTION (optional)", "If exporting as MP4: 0-1s zoom in on visual, 1-2s slide-in headline from bottom, 2-4s bullets fade in 1-by-1, 4-6s pulse on link sticker."),
    fmt("DO NOT", "Do not place text in the top or bottom 250px. Do not autoplay loud audio."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "CapCut: 9:16 vertical, paste slabs as background layers.",
      "Canva: 'Your Story' template, lock 1080x1920.",
      "AI prompt: \"Vertical 9:16 cinematic shot, " + input.businessType.toLowerCase() + ", " + input.targetCustomer.toLowerCase() + ", subject centered in middle third, top and bottom thirds intentionally empty for UI overlays\".",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildWebsiteHeroBrief(input: KitInput, content: KitContent, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  return [
    "WEBSITE HERO IMAGE — CREATIVE BRIEF",
    "",
    fmt("FORMAT", "2880 x 1620 px master (16:9). Export 2x and 1x WebP. Mobile crop: center-safe 1080 x 1620 portrait."),
    fmt("OBJECTIVE", `In one glance, communicate "${content.valueProposition}" to ${input.targetCustomer}.`),
    "",
    "COMPOSITION",
    bullets([
      "LEFT 45%: solid PRIMARY color panel — landing-page headline lives here as live HTML, not in the image.",
      "RIGHT 55%: photographic focal — a real-world result/proof from the business (not a stock handshake).",
      "Subtle ACCENT-color geometric shape (circle or angled line) bridging the two halves at 30% opacity.",
    ]),
    "",
    fmt("FOCAL SUBJECT", `${input.targetCustomer} actively benefiting from the offer — show outcome, not the product packaging.`),
    fmt("LIGHTING", "Natural daylight, 4500K, soft shadow on subject's left side. No harsh studio strobes."),
    fmt("HEADLINE (overlaid via HTML, not baked in)", `"${content.heroHeadline}"`),
    fmt("SUBHEAD (overlaid via HTML)", content.subheadline),
    fmt("BRAND MARK", `${brandText} mark in top-left corner of the LEFT panel — 120px wide, NEUTRAL color.`),
    "",
    "COLOR PALETTE",
    bullets([
      `Left panel: ${palette.primary}`,
      `Bridge accent shape: ${palette.accent} @ 30% opacity`,
      `Headline text (overlay): ${palette.neutral}`,
    ]),
    "",
    fmt("PERFORMANCE NOTES", "Compress to <180KB WebP. Provide LQIP (low-quality image placeholder) blurhash. Set fetchpriority='high' on the <img>."),
    fmt("DO NOT", "Do not bake the headline text into the image — keep it live HTML for SEO + a11y."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "Figma: 2880x1620 frame, export at 1x + 2x WebP.",
      "Squoosh.app for compression.",
      "AI prompt: \"Editorial photograph, real " + input.businessType.toLowerCase() + " environment, " + input.targetCustomer.toLowerCase() + " visibly satisfied, dominant negative space on the left third for UI overlay, natural daylight, 16:9, color palette accents in " + palette.accent + "\".",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildFlyerBrief(input: KitInput, content: KitContent, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  return [
    "PRINT FLYER — CREATIVE BRIEF",
    "",
    fmt("FORMAT", "US Letter 8.5\" x 11\" (or A4 210x297mm). 300 DPI, CMYK, 0.125\" bleed, 0.25\" safe margin."),
    fmt("OBJECTIVE", `Hand-to-hand and door-drop conversion for ${input.targetCustomer}. Must be readable from 6 feet away.`),
    "",
    "LAYOUT (6-zone grid, top to bottom)",
    bullets([
      "1. MASTHEAD (top 20%): brand mark left, big headline right.",
      "2. HERO IMAGE (next 25%): full-bleed photo of the offer in action.",
      "3. OFFER BLOCK (next 15%): the price/offer in display weight on PRIMARY background.",
      "4. PROOF STRIP (next 10%): 3 micro-icons + one-line proof points (years in business, 5★ reviews, guarantee).",
      "5. WHAT YOU GET (next 20%): 3-5 bullet points from offer stack.",
      "6. FOOTER (bottom 10%): phone, address, QR code, CTA. Brand mark muted at 30% in background.",
    ]),
    "",
    fmt("MASTHEAD HEADLINE (display weight)", `"${content.heroHeadline}"`),
    fmt("OFFER BLOCK", content.offerStack?.[0] ?? content.valueProposition),
    "WHAT YOU GET (bullets)",
    bullets((content.offerStack ?? []).slice(0, 5)),
    fmt("FOOTER CTA", content.ctaButtons?.[0] ?? "Call today"),
    fmt("BRAND MARK", `${brandText} — 1.25" wide top-left.`),
    "",
    "COLOR PALETTE (CMYK-safe)",
    bullets([
      `PRIMARY background blocks: ${palette.primary}`,
      `Offer block + CTA: ${palette.accent}`,
      `Body type & background fill: ${palette.neutral}`,
    ]),
    "",
    fmt("TYPOGRAPHY", "Headline: condensed display sans, weight 900. Body: humanist sans, 11-12pt, 1.4 line height."),
    fmt("DO NOT", "Do not place critical content within 0.25\" of the trim. Do not use RGB colors. Do not use a single block of more than 3 lines of body type."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "Canva Print → 'US Letter Flyer' template, enable bleed, export as Print PDF (CMYK).",
      "Adobe Express: 'Flyer' preset, set color profile to U.S. Web Coated SWOP v2.",
      "Send to local printer (UPrinting, GotPrint, or VistaPrint) at 100lb gloss cover.",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildQrPosterBrief(input: KitInput, content: KitContent, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  return [
    "QR POSTER (TABLE TENT / WINDOW CLING) — CREATIVE BRIEF",
    "",
    fmt("FORMAT", "11\" x 17\" portrait master (also export 4\" x 6\" table tent + 24\" x 36\" window poster). 300 DPI."),
    fmt("OBJECTIVE", `Get a phone scan from ${input.targetCustomer} within 3 seconds of looking at the poster.`),
    "",
    "RULE OF THIRDS LAYOUT",
    bullets([
      "TOP THIRD: a 5-word, scroll-stopping promise.",
      "MIDDLE THIRD: the QR code, minimum 2.5\" square, on a NEUTRAL background with at least 0.4\" quiet zone.",
      "BOTTOM THIRD: 1-line benefit + brand mark + scan-prompt arrow pointing UP at the QR.",
    ]),
    "",
    fmt("TOP PROMISE", `"${content.heroHeadline.split(" ").slice(0, 5).join(" ")}"`),
    fmt("BOTTOM BENEFIT", content.subheadline.length > 70 ? content.subheadline.slice(0, 67) + "…" : content.subheadline),
    fmt("SCAN PROMPT MICROCOPY", `"${content.ctaButtons?.[0] ?? "Scan to claim"} — takes 10 seconds"`),
    fmt("BRAND MARK", `${brandText} bottom-center, 1\" tall, NEUTRAL color.`),
    "",
    "QR CODE SPEC",
    bullets([
      "Generate dynamic QR (so destination URL can change later) via qr-code-generator.com or Bitly.",
      "Add UTM tag: ?utm_source=qr&utm_medium=poster&utm_campaign=" + input.businessType.toLowerCase().replace(/\s+/g, "-"),
      "Color: PRIMARY on NEUTRAL — never invert (white-on-dark QRs scan inconsistently).",
      "Test scan from 3ft, 6ft, 10ft before printing in volume.",
    ]),
    "",
    "COLOR PALETTE",
    bullets([
      `Top third background: ${palette.primary}`,
      `Middle third (QR area): ${palette.neutral} (must be light to ensure scan reliability)`,
      `Bottom third accents (arrow, microcopy): ${palette.accent}`,
    ]),
    "",
    fmt("DO NOT", "Do not stylize the QR code blocks (no gradients, no logos in the center) — kills scan rate."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "Canva: 11x17 poster template + QR Code app.",
      "qr-code-generator.com → Dynamic QR (free 14-day, then upgrade for analytics).",
      "Order test prints at Staples / Office Depot before bulk printing.",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildLogoDirectionBrief(input: KitInput, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  return [
    "LOGO DIRECTION — CREATIVE BRIEF",
    "",
    fmt("OBJECTIVE", `A wordmark + icon system for "${brandText}" that signals trust to ${input.targetCustomer} in the ${input.businessType} space.`),
    "",
    "DELIVERABLES (5-piece logo system)",
    bullets([
      "1. PRIMARY LOCKUP — wordmark + icon, horizontal arrangement.",
      "2. STACKED LOCKUP — wordmark below icon, for square placements (avatars, app icons).",
      "3. ICON-ONLY MARK — works at 16x16 favicon size.",
      "4. WORDMARK-ONLY — for tight horizontal spaces.",
      "5. MONOCHROME VERSIONS — solid black + solid white for single-color print.",
    ]),
    "",
    fmt("BRAND PERSONALITY", palette.vibe),
    fmt("ICON DIRECTION", `A single, ownable shape derived from the ${input.businessType.toLowerCase()} world — avoid generic gears, swooshes, globes, or abstract shapes that could belong to any company.`),
    fmt("WORDMARK DIRECTION", "Custom-modified geometric sans (think Inter, Sohne, or Aktiv Grotesk) with one signature ligature or rounded terminal that becomes the brand's unique fingerprint."),
    "",
    "COLOR USAGE",
    bullets([
      `On light backgrounds: PRIMARY ${palette.primary} for wordmark, ACCENT ${palette.accent} for icon.`,
      `On dark backgrounds: NEUTRAL ${palette.neutral} for wordmark, ACCENT for icon.`,
      "Always test 1-color black + 1-color white versions for print fidelity.",
    ]),
    "",
    "FILE FORMATS REQUIRED",
    bullets([
      "Vector: .svg (web), .ai or .eps (print).",
      "Raster: .png with transparent bg at 512px / 1024px / 2048px.",
      "App icon: 1024x1024 .png on solid square (no transparency).",
    ]),
    "",
    fmt("DO NOT", "Do not include taglines inside the logo lockup. Do not use more than two colors. Do not rely on drop shadows or gradients — kills small-size legibility."),
    "",
    "TOOLS / PROMPTS",
    bullets([
      "Looka, Brandmark.io, or Tailor Brands for AI starting points.",
      "Hire a designer on Dribbble for a custom mark ($300-1500).",
      "AI prompt: \"Minimalist vector logo for a " + input.businessType.toLowerCase() + " brand named '" + brandText + "', ownable single-shape icon + custom geometric sans wordmark, two-color palette of " + palette.primary + " and " + palette.accent + ", flat design, no gradients\".",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildBrandColorsBrief(input: KitInput, palette: ReturnType<typeof brandPaletteFor>, brandText: string, plan: PlanId): string {
  return [
    `BRAND COLOR SUGGESTIONS — ${brandText.toUpperCase()}`,
    "",
    fmt("DESIGN RATIONALE", palette.vibe + " — chosen to differentiate from typical " + input.businessType.toLowerCase() + " competitors who default to safe, expected colors."),
    "",
    "CORE PALETTE (use these everywhere)",
    bullets([
      `PRIMARY  ${palette.primary}  — 60% of any composition (backgrounds, headlines, brand mark).`,
      `ACCENT   ${palette.accent}  — 10% of any composition (CTAs, highlights, key icons).`,
      `NEUTRAL  ${palette.neutral}  — 30% of any composition (body text background, breathing room).`,
    ]),
    "",
    "EXTENDED PALETTE (5 supporting tints/shades)",
    bullets([
      "PRIMARY-900 (darkest shade for text on light)",
      "PRIMARY-100 (lightest tint for cards/sections)",
      "ACCENT-700 (darker accent for hover states)",
      "ACCENT-100 (light accent wash for callouts)",
      "SUCCESS / WARNING / ERROR — pick semantic system colors that don't clash with ACCENT.",
    ]),
    "",
    "ACCESSIBILITY (must pass WCAG AA)",
    bullets([
      `Body text on NEUTRAL background: must use PRIMARY (${palette.primary}) — verify ≥ 4.5:1 contrast.`,
      `Button text on ACCENT background: pick black or white (${palette.accent} → check contrast at webaim.org).`,
      "Never use ACCENT for body text — reserve it for actions and emphasis.",
    ]),
    "",
    "USAGE RULES",
    bullets([
      "60-30-10 ratio: PRIMARY 60% / NEUTRAL 30% / ACCENT 10%.",
      "Never use more than 2 of the core palette together at full saturation in the same viewport.",
      "Photography overlays: tint with PRIMARY @ 70% opacity, never ACCENT (becomes dated fast).",
    ]),
    "",
    "TOOLS",
    bullets([
      "Coolors.co — paste hex codes to lock the palette and generate tints.",
      "Realtime Colors — preview the palette on a live website.",
      "WebAIM Contrast Checker — verify all combinations.",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

function buildFontStylesBrief(input: KitInput, brandText: string, plan: PlanId): string {
  const t = input.businessType.toLowerCase();
  const pairings: { heading: string; body: string; vibe: string }[] = [];
  if (/cyber|tech|it|msp|software|saas|digital/.test(t)) {
    pairings.push({ heading: "Space Grotesk (700)", body: "Inter (400/500)", vibe: "Modern + technical — sharp headlines with neutral body" });
    pairings.push({ heading: "JetBrains Mono (700)", body: "Inter (400)", vibe: "Engineering-credible — monospaced display + clean body" });
  } else if (/auto|mechanic|home service|roofing|handy|clean/.test(t)) {
    pairings.push({ heading: "Oswald (700)", body: "Source Sans 3 (400/600)", vibe: "Industrial + workmanlike — condensed display + readable body" });
    pairings.push({ heading: "Bebas Neue", body: "Open Sans (400/700)", vibe: "Bold + direct — billboard-style headers" });
  } else if (/health|fitness|gym/.test(t)) {
    pairings.push({ heading: "Archivo Black", body: "DM Sans (400/500)", vibe: "Strong + energetic — heavy headlines with friendly body" });
    pairings.push({ heading: "Anton", body: "Nunito (400/700)", vibe: "Athletic poster aesthetic + warm body type" });
  } else if (/beauty|salon|barber|spa|nail|real ?estate/.test(t)) {
    pairings.push({ heading: "Playfair Display (700)", body: "Inter (400)", vibe: "Elevated + editorial — high-contrast serif + clean sans" });
    pairings.push({ heading: "Cormorant Garamond (600)", body: "Lato (400)", vibe: "Boutique + refined — graceful serif pairing" });
  } else if (/food|restaurant|cafe|bakery|coffee|event|community/.test(t)) {
    pairings.push({ heading: "Fraunces (700)", body: "Inter (400)", vibe: "Crafted + warm — characterful serif + neutral body" });
    pairings.push({ heading: "DM Serif Display", body: "DM Sans (400/500)", vibe: "Friendly editorial — same family pairing" });
  } else if (/music|art|creative|podcast|video|photo/.test(t)) {
    pairings.push({ heading: "Druk (Wide Heavy)", body: "GT America (400/500)", vibe: "Creative authority — wide display + neutral body" });
    pairings.push({ heading: "Migra (Italic)", body: "Inter (400)", vibe: "Editorial-cool — italic display + utility body" });
  } else {
    pairings.push({ heading: "Inter (800)", body: "Inter (400/500)", vibe: "Safe + flexible — single-family pairing, ships fast" });
    pairings.push({ heading: "Manrope (800)", body: "Manrope (400/500)", vibe: "Modern + neutral — trustworthy default" });
  }
  return [
    `FONT STYLE SUGGESTIONS — ${brandText.toUpperCase()}`,
    "",
    fmt("OBJECTIVE", `Type system for ${brandText} that holds up from 12px body to 96px display, on web and print.`),
    "",
    "RECOMMENDED PAIRINGS (pick ONE)",
    pairings
      .map((p, i) => `${i + 1}. ${p.heading}  +  ${p.body}\n   → ${p.vibe}`)
      .join("\n\n"),
    "",
    "TYPE SCALE (modular, ratio 1.25)",
    bullets([
      "Display: 64px / 1.05 line height / -0.02em tracking — heroes only.",
      "H1: 48px / 1.1 / -0.015em",
      "H2: 36px / 1.15 / -0.01em",
      "H3: 24px / 1.25",
      "Body large: 18px / 1.55 — landing-page intros.",
      "Body: 16px / 1.6 — default.",
      "Caption: 13px / 1.4 — UI microcopy.",
    ]),
    "",
    "USAGE RULES",
    bullets([
      "Max 2 type families across the entire brand. 3 only if one is a monospace for stat callouts.",
      "Headlines tighten (negative tracking), body opens up (1.55+ line height).",
      "Reserve italics for emphasis only — never as a body style.",
      "All-caps OK for labels under 16px; never for headlines longer than 5 words.",
    ]),
    "",
    "WHERE TO GET THEM",
    bullets([
      "Google Fonts: free for web + commercial use.",
      "Adobe Fonts: included with any Creative Cloud subscription.",
      "Self-host via Fontsource for performance + GDPR safety.",
    ]),
    whiteLabelFooter(plan),
  ].join("\n");
}

export function generateVisualPromoKit(
  input: KitInput,
  content: KitContent,
  brand: BrandProfile | null,
  plan: PlanId,
  generatedAt: Date = new Date(),
): VisualPromoKit {
  const palette = brandPaletteFor(input, brand);
  const brandText = brandLabel(input, brand);

  const allBriefs: VisualBrief[] = [
    {
      id: "facebook-ad",
      title: "Facebook / Meta Ad Image",
      category: "image",
      dimensions: "1200 × 628",
      tools: ["Canva", "Adobe Express", "Midjourney", "Figma"],
      brief: buildFacebookAdBrief(input, content, palette, brandText, plan),
      locked: false,
    },
    {
      id: "instagram-square",
      title: "Instagram Square Post",
      category: "image",
      dimensions: "1080 × 1080",
      tools: ["Canva", "Figma", "Adobe Express"],
      brief: buildInstagramSquareBrief(input, content, palette, brandText, plan),
      locked: false,
    },
    {
      id: "instagram-story",
      title: "Instagram / TikTok Story",
      category: "image",
      dimensions: "1080 × 1920",
      tools: ["Canva", "CapCut", "Adobe Express"],
      brief: buildInstagramStoryBrief(input, content, palette, brandText, plan),
      locked: false,
    },
    {
      id: "website-hero",
      title: "Website Hero Image",
      category: "image",
      dimensions: "2880 × 1620",
      tools: ["Figma", "Photoshop", "Squoosh"],
      brief: buildWebsiteHeroBrief(input, content, palette, brandText, plan),
      locked: false,
    },
    {
      id: "flyer",
      title: "Print Flyer Design",
      category: "image",
      dimensions: "8.5\" × 11\" (300 DPI, CMYK)",
      tools: ["Canva Print", "Adobe Express", "InDesign"],
      brief: buildFlyerBrief(input, content, palette, brandText, plan),
      locked: false,
    },
    {
      id: "qr-poster",
      title: "QR Poster / Table Tent",
      category: "image",
      dimensions: "11\" × 17\" (300 DPI)",
      tools: ["Canva", "qr-code-generator.com", "Bitly"],
      brief: buildQrPosterBrief(input, content, palette, brandText, plan),
      locked: false,
    },
    {
      id: "logo-direction",
      title: "Logo Direction",
      category: "brand",
      dimensions: null,
      tools: ["Looka", "Brandmark.io", "Dribbble", "Figma"],
      brief: buildLogoDirectionBrief(input, palette, brandText, plan),
      locked: false,
    },
    {
      id: "brand-colors",
      title: "Brand Color Suggestions",
      category: "brand",
      dimensions: null,
      tools: ["Coolors.co", "Realtime Colors", "WebAIM"],
      brief: buildBrandColorsBrief(input, palette, brandText, plan),
      locked: false,
    },
    {
      id: "font-styles",
      title: "Font Style Suggestions",
      category: "brand",
      dimensions: null,
      tools: ["Google Fonts", "Adobe Fonts", "Fontsource"],
      brief: buildFontStylesBrief(input, brandText, plan),
      locked: false,
    },
  ];

  const briefs =
    plan === "free"
      ? allBriefs.map((b) => (FREE_UNLOCKED.has(b.id) ? b : { ...b, brief: "", locked: true }))
      : allBriefs;

  const t = input.businessType.toLowerCase();
  let fontPairings: { heading: string; body: string; vibe: string }[];
  if (/cyber|tech|it|msp|software|saas|digital/.test(t)) {
    fontPairings = [
      { heading: "Space Grotesk", body: "Inter", vibe: "Modern + technical" },
      { heading: "JetBrains Mono", body: "Inter", vibe: "Engineering credible" },
    ];
  } else if (/health|fitness|gym/.test(t)) {
    fontPairings = [{ heading: "Archivo Black", body: "DM Sans", vibe: "Strong + energetic" }];
  } else if (/beauty|salon|barber|spa|real ?estate/.test(t)) {
    fontPairings = [{ heading: "Playfair Display", body: "Inter", vibe: "Elevated + editorial" }];
  } else if (/food|restaurant|cafe|event|community/.test(t)) {
    fontPairings = [{ heading: "Fraunces", body: "Inter", vibe: "Crafted + warm" }];
  } else if (/music|creative|podcast|video|photo/.test(t)) {
    fontPairings = [{ heading: "Druk Wide", body: "GT America", vibe: "Creative authority" }];
  } else {
    fontPairings = [{ heading: "Inter (800)", body: "Inter (400)", vibe: "Safe + flexible" }];
  }

  return {
    briefs,
    brandColors: [palette.primary, palette.accent, palette.neutral],
    fontPairings,
    whiteLabel: plan === "agency",
    currentPlan: plan,
    generatedAt: generatedAt.toISOString(),
  };
}

export function exportVisualPromoAsText(title: string, kit: VisualPromoKit): string {
  const lines: string[] = [];
  lines.push(`VISUAL PROMO KIT — ${title.toUpperCase()}`);
  lines.push(`Plan: ${kit.currentPlan.toUpperCase()}${kit.whiteLabel ? "  (white-label ready)" : ""}`);
  lines.push(`Generated: ${kit.generatedAt}`);
  lines.push("");
  lines.push("BRAND PALETTE: " + kit.brandColors.join("  "));
  lines.push("");
  lines.push("=".repeat(70));
  lines.push("");
  for (const b of kit.briefs) {
    if (b.locked) continue;
    lines.push(b.title.toUpperCase() + (b.dimensions ? `  (${b.dimensions})` : ""));
    lines.push("-".repeat(70));
    lines.push(b.brief);
    lines.push("");
    lines.push("=".repeat(70));
    lines.push("");
  }
  return lines.join("\n");
}

export function exportVisualPromoAsMarkdown(title: string, kit: VisualPromoKit): string {
  const lines: string[] = [];
  lines.push(`# Visual Promo Kit — ${title}`);
  lines.push("");
  lines.push(`**Plan:** ${kit.currentPlan}${kit.whiteLabel ? " _(white-label ready)_" : ""}  `);
  lines.push(`**Generated:** ${kit.generatedAt}  `);
  lines.push(`**Brand palette:** ${kit.brandColors.map((c) => `\`${c}\``).join(" · ")}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const b of kit.briefs) {
    if (b.locked) continue;
    lines.push(`## ${b.title}${b.dimensions ? ` _(${b.dimensions})_` : ""}`);
    lines.push("");
    lines.push("```");
    lines.push(b.brief);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}
