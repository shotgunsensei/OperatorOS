import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";
import { generateKit, type KitInput, type KitContent } from "./generator";

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are an expert direct-response copywriter who writes punchy, high-converting marketing copy for small businesses. You output strict JSON matching the requested schema. Never include markdown code fences, comments, or commentary — just the raw JSON object.`;

function buildUserPrompt(input: KitInput): string {
  return `Write a complete launch marketing kit for this business.

BUSINESS:
- Name: ${input.businessName}
- Type: ${input.businessType}
- Target customer: ${input.targetCustomer}
- Core offer: ${input.offer}
- Price: ${input.price || "(not specified)"}
- Location: ${input.location || "(online / not specified)"}
- Tone: ${input.tone}
- Pain point we solve: ${input.painPoint}
- Desired customer action: ${input.desiredAction}
- Promo deadline: ${input.promoDeadline || "(none)"}
- Website: ${input.websiteUrl || "(none)"}

Return a single JSON object with this exact shape (all string arrays should be non-empty):
{
  "heroHeadline": string,
  "subheadline": string,
  "valueProposition": string,
  "offerStack": string[6],
  "adHeadlines": string[5],
  "adDescriptions": string[5],
  "googleAds": Array<{ "headline": string, "description": string }> (length 3),
  "socialPosts": string[5],
  "smsPromos": string[3],
  "emailSequence": Array<{ "day": number, "subject": string, "body": string }> (length 5, days 0,1,3,5,7),
  "faq": Array<{ "question": string, "answer": string }> (length 6),
  "ctaButtons": string[5],
  "qrFlyerCopy": string,
  "launchChecklist": string[8]
}

Write in a ${input.tone} tone. Speak directly to ${input.targetCustomer}. Lead with their pain (${input.painPoint}) and end every piece pointing toward "${input.desiredAction}". Keep ad headlines under 30 chars where possible (Google ads). Email subjects must be under 60 chars.`;
}

function isValidKitContent(obj: unknown): obj is KitContent {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o["heroHeadline"] === "string" &&
    typeof o["subheadline"] === "string" &&
    typeof o["valueProposition"] === "string" &&
    Array.isArray(o["offerStack"]) &&
    Array.isArray(o["adHeadlines"]) &&
    Array.isArray(o["adDescriptions"]) &&
    Array.isArray(o["googleAds"]) &&
    Array.isArray(o["socialPosts"]) &&
    Array.isArray(o["smsPromos"]) &&
    Array.isArray(o["emailSequence"]) &&
    Array.isArray(o["faq"]) &&
    Array.isArray(o["ctaButtons"]) &&
    typeof o["qrFlyerCopy"] === "string" &&
    Array.isArray(o["launchChecklist"])
  );
}

/**
 * AI-refined kit generation via Replit AI Integrations (Anthropic).
 * Uses no API key from the user — billed to Replit credits.
 * Falls back to the deterministic template generator on any failure so kit
 * creation never blocks a paying user on a model hiccup.
 */
export async function generateKitWithAI(input: KitInput): Promise<{ content: KitContent; aiUsed: boolean }> {
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed: unknown = JSON.parse(cleaned);
    if (!isValidKitContent(parsed)) {
      throw new Error("AI response did not match expected schema");
    }
    return { content: parsed, aiUsed: true };
  } catch (err) {
    logger.warn({ err }, "AI generation failed; falling back to deterministic template");
    return { content: generateKit(input), aiUsed: false };
  }
}
