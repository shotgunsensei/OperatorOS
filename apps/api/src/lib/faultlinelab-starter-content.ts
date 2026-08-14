import { FAULTLINELAB_COMPILED_MANIFEST, FAULTLINELAB_SOURCE_CHALLENGES, FAULTLINELAB_SOURCE_COMMIT } from '../generated/faultlinelab-source-catalog.js';
import {
  faultlineContentHash,
  parseFaultlineChallengeContent,
  validateFaultlineChallengeContent,
  type FaultlineCategory,
  type FaultlineChallengeContent,
  type FaultlineDifficulty,
} from './faultlinelab-domain.js';

export interface FaultlineStarterChallenge {
  sourceId: string;
  slug: string;
  title: string;
  category: FaultlineCategory;
  difficulty: FaultlineDifficulty;
  content: FaultlineChallengeContent;
  contentHash: string;
  sourceHash: string;
  catalog: Record<string, unknown>;
}

export { FAULTLINELAB_SOURCE_COMMIT };

export const FAULTLINELAB_STARTER_CHALLENGES: readonly FaultlineStarterChallenge[] =
  FAULTLINELAB_SOURCE_CHALLENGES.map((compiled) => {
    const content = parseFaultlineChallengeContent(compiled.content);
    const validation = validateFaultlineChallengeContent(content);
    if (!validation.valid) {
      throw new Error(`Compiled FaultlineLab challenge is invalid: ${compiled.sourceId}: ${validation.errors.map(item => item.code).join(', ')}`);
    }
    const contentHash = faultlineContentHash(content);
    if (contentHash !== compiled.contentHash) {
      throw new Error(
        `Compiled FaultlineLab challenge hash drifted: ${compiled.sourceId}: expected ${compiled.contentHash}, parsed ${contentHash}`,
      );
    }
    return {
      sourceId: compiled.sourceId,
      slug: compiled.slug,
      title: compiled.title,
      category: compiled.category as FaultlineCategory,
      difficulty: compiled.difficulty as FaultlineDifficulty,
      content,
      contentHash,
      sourceHash: compiled.sourceHash,
      catalog: compiled.catalog,
    };
  });

export function faultlineStarterManifest() {
  return {
    schemaVersion: 1,
    sourceCommit: FAULTLINELAB_SOURCE_COMMIT,
    sourceManifestHash: FAULTLINELAB_COMPILED_MANIFEST.sourceManifestHash,
    discoveredCount: FAULTLINELAB_COMPILED_MANIFEST.discoveredCount,
    categoryCounts: FAULTLINELAB_COMPILED_MANIFEST.categoryCounts,
    difficultyCounts: FAULTLINELAB_COMPILED_MANIFEST.difficultyCounts,
    repairs: FAULTLINELAB_COMPILED_MANIFEST.repairs,
    challenges: FAULTLINELAB_STARTER_CHALLENGES.map((challenge) => ({
      sourceId: challenge.sourceId,
      slug: challenge.slug,
      title: challenge.title,
      category: challenge.category,
      difficulty: challenge.difficulty,
      sourceHash: challenge.sourceHash,
      contentHash: challenge.contentHash,
      catalog: challenge.catalog,
    })),
  };
}
