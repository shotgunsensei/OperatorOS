import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, usageRecordsTable } from "@workspace/db";
import { GenerateAiCopyBody, GenerateAiStrategyBody, GenerateCampaignIdeasBody } from "@workspace/api-zod";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

async function checkAndTrackUsage(tenantId: number, userId: string | undefined, action: string): Promise<string | null> {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) return "Tenant not found";
  if (tenant.aiCreditsUsed >= tenant.aiCreditsLimit) {
    return "AI credit limit reached. Please upgrade your plan.";
  }
  await db.insert(usageRecordsTable).values({ tenantId, userId, credits: 1, action });
  await db.update(tenantsTable).set({
    aiCreditsUsed: tenant.aiCreditsUsed + 1,
  }).where(eq(tenantsTable.id, tenantId));
  return null;
}

router.post("/tenants/:tenantId/ai/generate-copy", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const parsed = GenerateAiCopyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  
  const limitError = await checkAndTrackUsage(tenantId, req.user?.id, "generate-copy");
  if (limitError) { res.status(429).json({ error: limitError }); return; }
  
  const { copyType, prompt, tone, channel, audience, length } = parsed.data;
  
  const systemPrompt = `You are a professional marketing copywriter. Generate 3 variants of ${copyType} copy.
${tone ? `Tone: ${tone}` : ""}
${channel ? `Channel: ${channel}` : ""}
${audience ? `Target audience: ${audience}` : ""}
${length ? `Length: ${length}` : ""}

Return a JSON array with exactly 3 objects, each having "title" and "content" fields. Return ONLY valid JSON, no markdown.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });
    
    const content = response.choices[0]?.message?.content || "[]";
    let variants;
    try {
      variants = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      variants = [{ title: "Generated Copy", content }];
    }
    
    res.json({ variants });
  } catch (error: any) {
    req.log.error({ error }, "AI copy generation failed");
    res.status(500).json({ error: "Failed to generate copy" });
  }
});

router.post("/tenants/:tenantId/ai/generate-strategy", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const parsed = GenerateAiStrategyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  
  const limitError = await checkAndTrackUsage(tenantId, req.user?.id, "generate-strategy");
  if (limitError) { res.status(429).json({ error: limitError }); return; }
  
  const { strategyType, context } = parsed.data;
  
  const systemPrompt = `You are a marketing strategist. Generate a ${strategyType} strategy.
Return a JSON object with "title" (string), "content" (detailed strategy text), and "suggestions" (array of 5 actionable next steps). Return ONLY valid JSON, no markdown.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context || `Generate a ${strategyType} strategy for a small business.` },
      ],
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      result = { title: strategyType, content, suggestions: [] };
    }
    
    res.json(result);
  } catch (error: any) {
    req.log.error({ error }, "AI strategy generation failed");
    res.status(500).json({ error: "Failed to generate strategy" });
  }
});

router.post("/tenants/:tenantId/ai/generate-campaign-ideas", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const parsed = GenerateCampaignIdeasBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  
  const limitError = await checkAndTrackUsage(tenantId, req.user?.id, "generate-campaign-ideas");
  if (limitError) { res.status(429).json({ error: limitError }); return; }
  
  const { objective, audience, budget } = parsed.data;
  
  const systemPrompt = `You are a marketing campaign strategist. Generate 3 campaign ideas.
${objective ? `Objective: ${objective}` : ""}
${audience ? `Target audience: ${audience}` : ""}
${budget ? `Budget: ${budget}` : ""}

Return a JSON object with "ideas" array. Each idea has: "name", "objective", "channels" (array), "description", "estimatedBudget". Return ONLY valid JSON, no markdown.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate creative campaign ideas based on the criteria above." },
      ],
    });
    
    const content = response.choices[0]?.message?.content || '{"ideas":[]}';
    let result;
    try {
      result = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      result = { ideas: [] };
    }
    
    res.json(result);
  } catch (error: any) {
    req.log.error({ error }, "AI campaign ideas generation failed");
    res.status(500).json({ error: "Failed to generate campaign ideas" });
  }
});

export default router;
