import OpenAI from "openai";
import { logger } from "./logger";
import type { GeneratedMaterials, GenerateOptions } from "./generator";

function getClient(): OpenAI | null {
  const replitKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const replitBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (replitKey && replitBase) {
    return new OpenAI({ apiKey: replitKey, baseURL: replitBase });
  }
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) return new OpenAI({ apiKey: openaiKey });
  return null;
}

export function isAiAvailable(): boolean {
  return getClient() !== null;
}

const SYSTEM_PROMPT = `You are StudyForge, an expert study material generator. Given a student's raw notes, you produce structured study artifacts: a summary, key terms, flashcards, multiple-choice questions, short-answer questions, a review sheet, and a multi-day study plan.

Rules:
- Stay strictly within the topics covered in the notes; do not invent unrelated facts.
- Make flashcards atomic (one fact per card). Front is the prompt; back is the answer.
- MCQs must have exactly 4 plausible choices and one correct index (0-3).
- Each MCQ explanation references where the answer comes from in the notes.
- The review sheet has 2-4 sections, each with a heading and 3-6 bullet points, plus a "cramSection" of 4-8 essential facts.
- Study plan: spread topics across the requested number of days, 25-60 minutes per day.
- Output strictly valid JSON matching the requested schema. No prose outside JSON.`;

interface AiResponseShape {
  summary: string;
  keyTerms: { term: string; definition: string }[];
  flashcards: { front: string; back: string }[];
  mcqs: {
    question: string;
    choices: string[];
    correctIndex: number;
    explanation: string;
    topic: string;
  }[];
  shortAnswers: { question: string; answer: string; topic: string }[];
  reviewSheet: {
    sections: { heading: string; bullets: string[] }[];
    cramSection: string[];
  };
  studyPlan: {
    day: number;
    topic: string;
    focus: string;
    estimatedMinutes: number;
  }[];
}

function planDays(examDate?: string | null): number {
  if (!examDate) return 5;
  const exam = new Date(examDate + "T00:00:00");
  const now = new Date();
  const diff = Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(3, Math.min(14, diff));
}

function fillDates(
  plan: AiResponseShape["studyPlan"],
  startDate: Date,
): GeneratedMaterials["studyPlan"] {
  return plan.map((p, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return {
      day: p.day || i + 1,
      date: d.toISOString().slice(0, 10),
      topic: p.topic,
      focus: p.focus,
      estimatedMinutes: p.estimatedMinutes,
    };
  });
}

function clampQualityScore(words: number): number {
  return Math.max(40, Math.min(100, Math.round((Math.min(words, 800) / 800) * 100)));
}

export async function generateMaterialsAi(opts: GenerateOptions): Promise<GeneratedMaterials | null> {
  const client = getClient();
  if (!client) return null;

  const days = planDays(opts.examDate);
  const flashcardCap = opts.maxFlashcards ?? 30;

  const userPrompt = `Generate study materials for this set.
Title: ${opts.title}
Subject: ${opts.subject}
Difficulty: ${opts.difficulty}
Study plan length: ${days} days
Maximum flashcards: ${flashcardCap}
Generate 6-10 MCQs and 4-6 short-answer questions.

Notes:
"""
${opts.notes.slice(0, 8000)}
"""

Respond with a single JSON object with these exact keys: summary (string), keyTerms (array of {term, definition}), flashcards (array of {front, back}, max ${flashcardCap}), mcqs (array of {question, choices[4], correctIndex, explanation, topic}), shortAnswers (array of {question, answer, topic}), reviewSheet ({sections: [{heading, bullets[]}], cramSection: string[]}), studyPlan (array of ${days} {day, topic, focus, estimatedMinutes}).`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      logger.warn("AI generator returned empty content; falling back to deterministic");
      return null;
    }

    const parsed = JSON.parse(content) as AiResponseShape;

    if (
      !parsed.flashcards ||
      !Array.isArray(parsed.flashcards) ||
      parsed.flashcards.length === 0 ||
      !parsed.mcqs ||
      !Array.isArray(parsed.mcqs)
    ) {
      logger.warn("AI generator response missing required fields; falling back to deterministic");
      return null;
    }

    return {
      summary: parsed.summary || "",
      keyTerms: parsed.keyTerms ?? [],
      flashcards: parsed.flashcards.slice(0, flashcardCap),
      mcqs: parsed.mcqs.map((m) => ({
        ...m,
        correctIndex: Math.max(0, Math.min(3, m.correctIndex || 0)),
        choices: (m.choices ?? []).slice(0, 4),
      })),
      shortAnswers: parsed.shortAnswers ?? [],
      reviewSheet: parsed.reviewSheet ?? { sections: [], cramSection: [] },
      studyPlan: fillDates(parsed.studyPlan ?? [], new Date()),
      weakAreas: [],
      qualityScore: clampQualityScore(opts.notes.split(/\s+/).length),
    };
  } catch (err) {
    logger.error({ err }, "AI generator failed; falling back to deterministic");
    return null;
  }
}
