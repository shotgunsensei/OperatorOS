import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { storage } from "../storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

async function requireProSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await storage.getUser(req.user.id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const VALID_PRO_TIERS = new Set(["pro", "enterprise"]);
    if (!user.subscriptionTier || !VALID_PRO_TIERS.has(user.subscriptionTier)) {
      res.status(403).json({ error: "Pro or Enterprise subscription required" });
      return;
    }

    if (user.stripeSubscriptionId) {
      try {
        const subscription = await storage.getSubscription(user.stripeSubscriptionId);
        const isActive = subscription?.status === "active" || subscription?.status === "trialing";
        if (!isActive) {
          res.status(403).json({ error: "Active Pro subscription required" });
          return;
        }
      } catch {
        logger.warn({ userId: user.id }, "Could not verify Stripe subscription status (stripe schema may not exist), allowing based on tier");
      }
    }

    const now = Date.now();
    const userLimit = rateLimitMap.get(user.id);
    if (userLimit && now < userLimit.resetAt) {
      if (userLimit.count >= RATE_LIMIT_MAX) {
        res.status(429).json({ error: "Rate limit exceeded. You can generate up to 10 scripts per hour." });
        return;
      }
      userLimit.count++;
    } else {
      rateLimitMap.set(user.id, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }

    next();
  } catch (err) {
    logger.error({ error: err }, "Pro subscription check failed");
    res.status(500).json({ error: "Authorization check failed" });
  }
}

const FORMAT_MAP: Record<string, { extension: string; language: string; systemHint: string }> = {
  powershell: {
    extension: ".ps1",
    language: "PowerShell",
    systemHint: "Write a PowerShell script. Use proper PowerShell conventions, cmdlets, and error handling with try/catch blocks.",
  },
  python: {
    extension: ".py",
    language: "Python",
    systemHint: "Write a Python script. Use proper Python conventions, type hints where appropriate, and include error handling.",
  },
  batch: {
    extension: ".bat",
    language: "Batch",
    systemHint: "Write a Windows Batch (.bat) script. Use proper batch file conventions and error handling with ERRORLEVEL checks.",
  },
  bash: {
    extension: ".sh",
    language: "Bash",
    systemHint: "Write a Bash shell script. Start with #!/bin/bash, use proper bash conventions, and include error handling with set -e.",
  },
};

router.post("/scripts/generate", requireProSubscription, async (req, res) => {
  try {
    const { prompt, format } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      res.status(400).json({ error: "Please provide a description of at least 10 characters" });
      return;
    }

    if (!format || !FORMAT_MAP[format]) {
      res.status(400).json({ error: `Invalid format. Supported: ${Object.keys(FORMAT_MAP).join(", ")}` });
      return;
    }

    const formatInfo = FORMAT_MAP[format];
    const trimmedPrompt = prompt.trim().slice(0, 2000);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `You are an expert PC automation script writer. ${formatInfo.systemHint}

Rules:
- Output ONLY the script code, no markdown fences, no explanations before or after
- Include helpful comments within the script explaining what each section does
- Make the script practical, robust, and ready to run
- Handle common edge cases and errors gracefully
- Use clear variable names and organized structure`,
        },
        {
          role: "user",
          content: `Write a ${formatInfo.language} automation script that does the following:\n\n${trimmedPrompt}`,
        },
      ],
    });

    const scriptContent = completion.choices[0]?.message?.content;
    if (!scriptContent) {
      res.status(500).json({ error: "Failed to generate script. Please try again." });
      return;
    }

    const cleanedContent = scriptContent
      .replace(/^```[\w]*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();

    const scriptName = trimmedPrompt.length > 60
      ? trimmedPrompt.slice(0, 57) + "..."
      : trimmedPrompt;
    const fileName = `ai_generated_${Date.now()}${formatInfo.extension}`;

    const script = await storage.createScript({
      name: scriptName,
      description: `AI-generated ${formatInfo.language} script: ${trimmedPrompt}`,
      content: cleanedContent,
      fileName,
      format: formatInfo.language,
      category: "ai-generated",
      source: "ai_generated",
    });

    logger.info({ scriptId: script.id, format: formatInfo.language }, "AI script generated and saved");

    res.json({
      script: {
        id: script.id,
        name: script.name,
        description: script.description,
        content: cleanedContent,
        fileName: script.fileName,
        format: script.format,
        category: script.category,
        source: script.source,
        downloadCount: script.downloadCount ?? 0,
        createdAt: script.createdAt?.toISOString?.() ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ error: err }, "Failed to generate script");
    res.status(500).json({ error: "Failed to generate script. Please try again." });
  }
});

export default router;
