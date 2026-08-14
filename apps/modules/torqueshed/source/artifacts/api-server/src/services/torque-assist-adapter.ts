import { HttpError } from "../lib/http";

export type TorqueAssistPlan = {
  summary: string;
  facts: string[];
  assumptions: string[];
  hypotheses: Array<{
    rank: number;
    cause: string;
    confidence: number;
    supportingEvidence: string[];
    contradictingEvidence: string[];
  }>;
  followUpQuestions: string[];
  diagnosticPlan: Array<{
    order: number;
    test: string;
    purpose: string;
    expectedResults: string[];
    safety: string;
  }>;
  safetyNotes: string[];
};

export type TorqueAssistAdapterResult = {
  plan: TorqueAssistPlan;
  providerResponseId: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface TorqueAssistAdapter {
  analyze(context: Record<string, unknown>): Promise<TorqueAssistAdapterResult>;
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "facts",
    "assumptions",
    "hypotheses",
    "followUpQuestions",
    "diagnosticPlan",
    "safetyNotes",
  ],
  properties: {
    summary: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "cause", "confidence", "supportingEvidence", "contradictingEvidence"],
        properties: {
          rank: { type: "integer" },
          cause: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          supportingEvidence: { type: "array", items: { type: "string" } },
          contradictingEvidence: { type: "array", items: { type: "string" } },
        },
      },
    },
    followUpQuestions: { type: "array", items: { type: "string" } },
    diagnosticPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "test", "purpose", "expectedResults", "safety"],
        properties: {
          order: { type: "integer" },
          test: { type: "string" },
          purpose: { type: "string" },
          expectedResults: { type: "array", items: { type: "string" } },
          safety: { type: "string" },
        },
      },
    },
    safetyNotes: { type: "array", items: { type: "string" } },
  },
} as const;

function outputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

class OpenAiTorqueAssistAdapter implements TorqueAssistAdapter {
  async analyze(context: Record<string, unknown>): Promise<TorqueAssistAdapterResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new HttpError(503, "ai_not_configured", "Torque Assist is not configured.");
    }
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions:
          "You are Torque Assist, an evidence-led automotive diagnostic assistant. Use only the supplied vehicle and diagnostic context. Clearly separate known facts, assumptions, and hypotheses. Ask targeted follow-up questions when evidence is incomplete. Rank hypotheses and propose confirmation tests before parts replacement. Never present a safety-critical guess as confirmed. Include explicit safety notes for lifting, fuel, high voltage, rotating components, heat, pressure, airbags, and road tests when relevant.",
        input: JSON.stringify(context),
        text: {
          format: {
            type: "json_schema",
            name: "torque_assist_plan",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      throw new HttpError(502, "ai_provider_error", "Torque Assist could not complete the analysis.");
    }
    const payload = (await response.json()) as Record<string, unknown> & {
      id?: unknown;
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    };
    const text = outputText(payload);
    if (!text) throw new HttpError(502, "ai_invalid_response", "Torque Assist returned no diagnostic plan.");
    let plan: TorqueAssistPlan;
    try {
      plan = JSON.parse(text) as TorqueAssistPlan;
    } catch {
      throw new HttpError(502, "ai_invalid_response", "Torque Assist returned an invalid diagnostic plan.");
    }
    return {
      plan,
      providerResponseId: typeof payload.id === "string" ? payload.id : null,
      model,
      inputTokens: typeof payload.usage?.input_tokens === "number" ? payload.usage.input_tokens : null,
      outputTokens: typeof payload.usage?.output_tokens === "number" ? payload.usage.output_tokens : null,
    };
  }
}

class TestTorqueAssistAdapter implements TorqueAssistAdapter {
  async analyze(context: Record<string, unknown>): Promise<TorqueAssistAdapterResult> {
    const codes = Array.isArray(context.troubleCodes)
      ? context.troubleCodes.map((item) => (item as { code?: string }).code).filter(Boolean)
      : [];
    return {
      providerResponseId: "test-response",
      model: "torque-assist-test-adapter",
      inputTokens: 100,
      outputTokens: 100,
      plan: {
        summary: `Build a confirmation-first test plan for ${codes.join(", ") || "the reported concern"}.`,
        facts: ["Vehicle and diagnostic context were supplied by the user."],
        assumptions: ["The supplied observations are accurate and current."],
        hypotheses: [
          {
            rank: 1,
            cause: "Fault in the subsystem identified by the supplied evidence",
            confidence: 0.55,
            supportingEvidence: codes.length ? [`Stored code ${codes[0]}`] : ["Reported symptoms"],
            contradictingEvidence: ["No confirmation test has been completed yet."],
          },
        ],
        followUpQuestions: ["Under exactly what operating conditions does the concern occur?"],
        diagnosticPlan: [
          {
            order: 1,
            test: "Verify the concern and capture baseline measurements",
            purpose: "Confirm the symptom before disturbing components.",
            expectedResults: ["Concern reproduced", "Concern not reproduced"],
            safety: "Follow the service manual and use appropriate PPE and vehicle support.",
          },
        ],
        safetyNotes: ["Do not replace parts until the fault is confirmed by testing."],
      },
    };
  }
}

export function torqueAssistAdapter(): TorqueAssistAdapter {
  if (process.env.TORQUE_ASSIST_ADAPTER === "test") {
    if (process.env.NODE_ENV === "production") {
      throw new HttpError(503, "ai_not_configured", "The test AI adapter is disabled in production.");
    }
    return new TestTorqueAssistAdapter();
  }
  return new OpenAiTorqueAssistAdapter();
}
