/** Prompt 6's evidence labels and output sections are a shared, versioned contract. */
export const researchLabels = ['CONFIRMED FROM INTERNAL EVIDENCE', 'SUPPORTED INFERENCE', 'GENERAL TECHNICAL SUGGESTION', 'UNKNOWN'] as const;
export const researchSections = ['Likely Relevant Prior Incidents', 'Known Indicators', 'Most Supported Root Causes', 'Recommended Diagnostic Sequence', 'Proven Fixes From Prior Incidents', 'Things That Failed Previously', 'Warnings / Side Effects', 'Commands Worth Running', 'Escalation Conditions', 'Sources'] as const;
export type ResearchStatement = { text: string; classification: typeof researchLabels[number]; citations: string[]; evidenceQuotes: { sourceId: string; quote: string }[] };
export type ResearchFact = { section: string; text: string; pointer: string; provenFix: boolean; failed?: boolean; dangerous?: boolean };
export type ResearchSource = { id: string; kind: 'incident' | 'knowledge_base' | 'runbook'; recordId: string; title: string; version: number; revision: number | null; knownFix: boolean; facts: ResearchFact[] };
export type ResearchResult = { sections: { title: typeof researchSections[number]; statements: ResearchStatement[] }[]; sources: ResearchSource[]; state: 'synthesized' | 'insufficient_evidence'; provider: string | null };
