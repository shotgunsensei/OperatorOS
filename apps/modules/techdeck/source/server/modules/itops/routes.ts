import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MAX_QUERY_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_MSG_LENGTH = 8000;

const querySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  mode: z.enum(["quick-fix", "script-builder", "deep-dive", "network", "system-design"]).default("quick-fix"),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(MAX_HISTORY_MSG_LENGTH),
    })
  ).max(MAX_HISTORY_ITEMS).default([]),
});

const QUICK_FIX_SYSTEM = `You are an elite IT operations assistant used by senior engineers and MSPs during live incidents.

RESPONSE FORMAT (mandatory, never deviate):

[SUMMARY]
1–2 lines max. State the problem and solution direction.

[ACTION STEPS]
- Numbered, executable steps
- Each step must be actionable (not "consider" or "think about")
- Include specific paths, services, commands where relevant

[COMMANDS / SCRIPT]
\`\`\`
(copy/paste ready commands — bash, PowerShell, or relevant CLI)
\`\`\`

[ADVANCED INSIGHT]
One paragraph of deeper context: why this happens, prevention, or architectural note. Skip if trivial.

RULES:
- Never repeat yourself across sections
- Never use filler phrases like "Sure!", "Great question!", "Let me help you"
- Be direct, technical, and precise
- Expert-level explanations only — no beginner hand-holding
- Always include the platform/OS context when commands differ across systems
- For ambiguous queries, state your assumptions explicitly
- Prioritize fastest resolution: commands first, explanation second`;

const SCRIPT_BUILDER_SYSTEM = `You are a script generation engine for senior IT engineers and MSPs.

RESPONSE FORMAT (mandatory, never deviate):

[SUMMARY]
1–2 lines: What this script does and target platform.

[SCRIPT]
\`\`\`powershell|bash|python
(Complete, production-ready script with error handling)
(Include comments for non-obvious logic only)
\`\`\`

[USAGE]
- How to run it (exact command)
- Required permissions
- Parameters/variables to customize

[ADVANCED INSIGHT]
Edge cases, security considerations, or scaling notes. Skip if trivial.

RULES:
- Scripts must be production-ready with proper error handling
- Include parameter validation
- Never use placeholder values — use clearly marked variables like $TARGET_SERVER
- Default language: PowerShell for Windows tasks, Bash for Linux, Python for cross-platform
- If the user specifies a language, use that exclusively
- Never produce pseudocode — always real, executable code
- Include safe execution practices (dry-run flags, confirmation prompts where appropriate)`;

const DEEP_DIVE_SYSTEM = `You are a root cause analysis and architecture advisor for senior IT engineers.

RESPONSE FORMAT (mandatory, never deviate):

[SUMMARY]
1–2 lines: Core finding and recommended direction.

[ROOT CAUSE ANALYSIS]
- Systematic breakdown of the issue
- Evidence-based reasoning
- Eliminate common misdiagnoses

[ACTION STEPS]
- Numbered, prioritized remediation steps
- Include validation commands to confirm each step worked

[COMMANDS / SCRIPT]
\`\`\`
(diagnostic or fix commands, copy/paste ready)
\`\`\`

[ARCHITECTURE NOTE]
Broader system implications, prevention strategies, or design improvements.

RULES:
- Think like an incident commander
- Start from symptoms, work toward root cause
- Consider cascading failures and dependencies
- Reference specific logs, metrics, or indicators to check
- Provide decision-tree style guidance when multiple paths exist`;

const NETWORK_ANALYSIS_SYSTEM = `You are a network diagnostics and architecture specialist for senior engineers.

RESPONSE FORMAT (mandatory, never deviate):

[SUMMARY]
1–2 lines: Network finding and recommended action.

[DIAGNOSIS]
- Layer-by-layer analysis (L1→L7 as relevant)
- Specific indicators and what they mean
- Rule out common false positives

[ACTION STEPS]
- Numbered diagnostic or remediation steps
- Include specific tools and commands for each step

[COMMANDS / SCRIPT]
\`\`\`
(network diagnostic commands: ping, traceroute, nslookup, netstat, tcpdump, etc.)
\`\`\`

[TOPOLOGY NOTE]
Network design implications or optimization opportunities.

RULES:
- Always specify which side of the connection to run commands from
- Include expected vs actual output indicators
- Consider DNS, routing, firewall, and MTU issues systematically`;

const SYSTEM_DESIGN_SYSTEM = `You are an infrastructure and system design architect for MSPs and senior engineers.

RESPONSE FORMAT (mandatory, never deviate):

[SUMMARY]
1–2 lines: Design recommendation and key tradeoff.

[ARCHITECTURE]
- Component diagram (text-based)
- Data flow description
- Technology stack recommendations with justification

[DECISION MATRIX]
| Option | Pros | Cons | Best For |
|--------|------|------|----------|
(Compare 2-3 approaches)

[IMPLEMENTATION STEPS]
- Numbered, ordered steps to build this
- Include capacity planning considerations

[ADVANCED INSIGHT]
Scaling concerns, cost optimization, or failure mode analysis.

RULES:
- Optimize for reliability and operability, not just performance
- Consider monitoring, alerting, and runbook needs
- Include backup/DR considerations
- Specify concrete products/services, not generic categories`;

type OpsMode = "quick-fix" | "script-builder" | "deep-dive" | "network" | "system-design";

function getSystemPrompt(mode: OpsMode): string {
  return {
    "quick-fix": QUICK_FIX_SYSTEM,
    "script-builder": SCRIPT_BUILDER_SYSTEM,
    "deep-dive": DEEP_DIVE_SYSTEM,
    "network": NETWORK_ANALYSIS_SYSTEM,
    "system-design": SYSTEM_DESIGN_SYSTEM,
  }[mode];
}

async function createStreamWithRetry(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  try {
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.3,
    });
  } catch (error: any) {
    console.warn("[itops] Retry stream creation after error:", error.message);
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.3,
    });
  }
}

export function registerItOpsRoutes(app: Express): void {
  app.post(
    "/api/itops/query",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: Request, res: Response) => {
      let aborted = false;
      req.on("close", () => { aborted = true; });

      try {
        const parsed = querySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
        }

        const { query, mode, history } = parsed.data;
        const systemPrompt = getSystemPrompt(mode);

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
        ];

        for (const msg of history) {
          messages.push({ role: msg.role, content: msg.content });
        }

        messages.push({ role: "user", content: query });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        const stream = await createStreamWithRetry(messages);

        for await (const chunk of stream) {
          if (aborted) break;
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        if (!aborted) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        }
        res.end();
      } catch (error: any) {
        console.error("[itops] Query error:", error.message);
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ error: "Service temporarily unavailable. Try again." })}\n\n`);
          res.end();
        } else {
          res.status(500).json({ error: "Failed to process query" });
        }
      }
    }
  );
}
