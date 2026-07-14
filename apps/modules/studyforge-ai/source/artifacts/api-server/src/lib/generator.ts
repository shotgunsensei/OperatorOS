// Deterministic local generation for StudyForge AI.
// Produces flashcards, MCQs, short-answer questions, key terms,
// summary, review sheet, and a study plan from raw notes.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those",
  "it", "its", "as", "by", "from", "than", "then", "so", "if", "because", "while",
  "which", "who", "whom", "whose", "what", "when", "where", "why", "how",
  "can", "could", "should", "would", "may", "might", "must", "will", "shall",
  "have", "has", "had", "do", "does", "did", "not", "no", "yes", "we", "you",
  "they", "he", "she", "him", "her", "them", "us", "our", "your", "their",
  "i", "me", "my", "also", "more", "most", "such", "into", "about", "between",
  "through", "during", "before", "after", "above", "below", "up", "down", "out",
  "off", "over", "under", "again", "further", "once", "here", "there",
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function pick<T>(arr: T[], n: number, seed = 0): T[] {
  // Deterministic shuffle
  const a = [...arr];
  let s = seed + 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

function topKeywords(text: string, n: number): string[] {
  const counts = new Map<string, number>();
  for (const tok of tokenize(text)) {
    if (STOPWORDS.has(tok)) continue;
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function deriveDefinition(term: string, sentences: string[]): string {
  const lower = term.toLowerCase();
  const match = sentences.find((s) => s.toLowerCase().includes(lower));
  if (match) {
    let def = match;
    if (def.length > 220) def = def.slice(0, 217).trim() + "...";
    return def;
  }
  return `Important concept related to ${capitalize(term)} in this study material.`;
}

function detectTopics(sentences: string[], keywords: string[]): string[] {
  // Use top keywords as topic labels.
  return keywords.slice(0, Math.max(3, Math.min(6, sentences.length / 4))).map(capitalize);
}

function topicForSentence(sentence: string, topics: string[]): string {
  const lower = sentence.toLowerCase();
  for (const t of topics) {
    if (lower.includes(t.toLowerCase())) return t;
  }
  return topics[0] ?? "General";
}

export interface GeneratedMaterials {
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
    date: string;
    topic: string;
    focus: string;
    estimatedMinutes: number;
  }[];
  weakAreas: string[];
  qualityScore: number;
}

export interface GenerateOptions {
  notes: string;
  title: string;
  subject: string;
  difficulty: "easy" | "medium" | "hard" | string;
  examDate?: string | null;
  maxFlashcards?: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function generateMaterials(opts: GenerateOptions): GeneratedMaterials {
  const notes = opts.notes.trim();
  const sentences = splitSentences(notes);
  const keywords = topKeywords(notes, 24);
  const topics = detectTopics(sentences, keywords);

  // ---------- Summary ----------
  const summarySentences = sentences.slice(0, Math.min(4, sentences.length));
  const summary =
    summarySentences.length > 0
      ? summarySentences.join(" ")
      : `This study set covers ${opts.subject || opts.title}. Add more notes to generate a richer summary.`;

  // ---------- Key terms ----------
  const keyTermWords = keywords.slice(0, 12);
  const keyTerms = keyTermWords.map((w) => ({
    term: capitalize(w),
    definition: deriveDefinition(w, sentences),
  }));

  // ---------- Flashcards ----------
  const flashcardCap = opts.maxFlashcards ?? 60;
  const flashcards: { front: string; back: string }[] = [];
  for (const kt of keyTerms) {
    if (flashcards.length >= flashcardCap) break;
    flashcards.push({ front: `Define: ${kt.term}`, back: kt.definition });
  }
  // Add cloze-style cards from sentences.
  for (const sentence of sentences) {
    if (flashcards.length >= flashcardCap) break;
    const words = sentence.split(/\s+/);
    const targetIdx = words.findIndex((w) => {
      const t = w.toLowerCase().replace(/[^a-z'-]/g, "");
      return t.length > 4 && !STOPWORDS.has(t);
    });
    if (targetIdx === -1) continue;
    const target = words[targetIdx].replace(/[^A-Za-z'-]/g, "");
    if (!target) continue;
    const cloze = words.map((w, i) => (i === targetIdx ? "_____" : w)).join(" ");
    flashcards.push({ front: cloze, back: target });
  }
  // Q/A style fallback for very short notes
  if (flashcards.length === 0) {
    flashcards.push({
      front: `What is the main subject of this study set?`,
      back: opts.subject || opts.title,
    });
  }

  // ---------- MCQs ----------
  const mcqs: GeneratedMaterials["mcqs"] = [];
  const mcqCandidates = sentences.filter((s) => {
    const toks = tokenize(s);
    return toks.some((t) => !STOPWORDS.has(t) && t.length > 4);
  });
  let seed = 1;
  for (const sentence of mcqCandidates.slice(0, 12)) {
    const words = sentence.split(/\s+/);
    const idx = words.findIndex((w) => {
      const t = w.toLowerCase().replace(/[^a-z'-]/g, "");
      return t.length > 4 && !STOPWORDS.has(t);
    });
    if (idx === -1) continue;
    const correct = words[idx].replace(/[^A-Za-z'-]/g, "");
    if (!correct) continue;
    const distractorPool = keywords
      .map(capitalize)
      .filter((k) => k.toLowerCase() !== correct.toLowerCase());
    const distractors = pick(distractorPool, 3, seed++);
    while (distractors.length < 3) distractors.push("None of the above");
    const choices = pick([correct, ...distractors], 4, seed++);
    const correctIndex = choices.findIndex(
      (c) => c.toLowerCase() === correct.toLowerCase(),
    );
    const stem = words.map((w, i) => (i === idx ? "______" : w)).join(" ");
    mcqs.push({
      question: `Fill in the blank: ${stem}`,
      choices,
      correctIndex: correctIndex === -1 ? 0 : correctIndex,
      explanation: `From the notes: "${sentence}"`,
      topic: topicForSentence(sentence, topics),
    });
  }
  if (mcqs.length === 0) {
    mcqs.push({
      question: `Which subject does this study set focus on?`,
      choices: pick([opts.subject || "General", "History", "Mathematics", "Biology"], 4, 7),
      correctIndex: 0,
      explanation: `This study set is labeled as ${opts.subject || "General"}.`,
      topic: topics[0] ?? "General",
    });
  }

  // ---------- Short answers ----------
  const shortAnswers = sentences.slice(0, 8).map((s) => {
    const toks = tokenize(s).filter((t) => !STOPWORDS.has(t) && t.length > 4);
    const focus = capitalize(toks[0] ?? "this concept");
    return {
      question: `Explain in your own words: ${focus}.`,
      answer: s,
      topic: topicForSentence(s, topics),
    };
  });
  if (shortAnswers.length === 0) {
    shortAnswers.push({
      question: `Summarize the main idea of these notes.`,
      answer: summary,
      topic: topics[0] ?? "General",
    });
  }

  // ---------- Review sheet ----------
  const sectionsByTopic = new Map<string, string[]>();
  for (const t of topics) sectionsByTopic.set(t, []);
  for (const s of sentences) {
    const t = topicForSentence(s, topics);
    sectionsByTopic.get(t)?.push(s);
  }
  const sections = [...sectionsByTopic.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([heading, items]) => ({
      heading: capitalize(heading),
      bullets: items.slice(0, 6),
    }));
  if (sections.length === 0) {
    sections.push({
      heading: capitalize(opts.subject || "Overview"),
      bullets: sentences.slice(0, 6).length > 0 ? sentences.slice(0, 6) : [summary],
    });
  }
  const cramSection = keyTerms
    .slice(0, 8)
    .map((kt) => `${kt.term}: ${kt.definition}`);

  // ---------- Study plan ----------
  const today = new Date();
  let totalDays = 7;
  if (opts.examDate) {
    const exam = new Date(opts.examDate);
    const diff = Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    totalDays = Math.max(2, Math.min(21, diff));
  }
  const planTopics = topics.length > 0 ? topics : [opts.subject || "Overview"];
  const planMinutes =
    opts.difficulty === "hard" ? 50 : opts.difficulty === "easy" ? 20 : 35;
  const studyPlan = Array.from({ length: totalDays }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const topic = planTopics[i % planTopics.length];
    let focus = "Read notes and review key terms.";
    if (i === 0) focus = "Read all notes and skim flashcards.";
    else if (i === totalDays - 1) focus = "Final review: cram section + practice quiz.";
    else if (i % 3 === 0) focus = "Practice quiz and analyze weak areas.";
    else if (i % 2 === 0) focus = "Flashcard drill and short-answer practice.";
    return {
      day: i + 1,
      date: isoDate(date),
      topic: capitalize(topic),
      focus,
      estimatedMinutes: planMinutes,
    };
  });

  // ---------- Weak areas (initially empty until quiz attempts) ----------
  const weakAreas: string[] = [];

  // ---------- Quality score ----------
  const wordCount = tokenize(notes).length;
  const score = Math.max(
    10,
    Math.min(
      100,
      Math.round(
        (Math.min(wordCount, 600) / 600) * 50 +
          (Math.min(sentences.length, 30) / 30) * 25 +
          (Math.min(topics.length, 6) / 6) * 25,
      ),
    ),
  );

  return {
    summary,
    keyTerms,
    flashcards,
    mcqs,
    shortAnswers,
    reviewSheet: { sections, cramSection },
    studyPlan,
    weakAreas,
    qualityScore: score,
  };
}
