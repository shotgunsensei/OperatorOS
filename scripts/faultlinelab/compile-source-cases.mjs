import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = resolve(root, 'apps/modules/faultlinelab/source/artifacts/faultline-lab');
const snapshotPath = resolve(root, 'apps/modules/faultlinelab/source/SOURCE_SNAPSHOT.json');
const outputPath = resolve(root, 'apps/api/src/generated/faultlinelab-source-catalog.ts');
const write = process.argv.includes('--write');
const negativeFixtureArg = process.argv.find(arg => arg.startsWith('--negative-fixture='));
const negativeFixture = negativeFixtureArg?.slice('--negative-fixture='.length) ?? null;
if (write && negativeFixture) throw new Error('Negative compiler fixtures cannot write generated output');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

function remediationKeywords(value) {
  const stop = new Set(['about', 'after', 'again', 'also', 'before', 'being', 'between', 'from', 'have', 'into', 'only', 'other', 'should', 'that', 'then', 'their', 'these', 'this', 'through', 'under', 'using', 'verify', 'with']);
  const words = value.toLowerCase().replace(/[^a-z0-9/.-]+/g, ' ').split(/\s+/).filter(word => word.length >= 4 && !stop.has(word));
  return [...new Set(words)].slice(0, 12);
}

function ensureUnique(values, label, errors) {
  const seen = new Set();
  for (const value of values) {
    const normalized = String(value).toLowerCase();
    if (seen.has(normalized)) errors.push(`Duplicate ${label}: ${value}`);
    seen.add(normalized);
  }
}

function normalizedText(value) {
  return String(value).replace(/\r\n?/g, '\n').trim();
}

function normalizeCompiledContent(input) {
  return {
    schemaVersion: 1,
    ...(input.sourceId ? { sourceId: normalizedText(input.sourceId) } : {}),
    description: normalizedText(input.description),
    briefing: normalizedText(input.briefing),
    symptoms: input.symptoms.map(item => ({
      id: normalizedText(item.id),
      description: normalizedText(item.description),
      severity: item.severity,
    })),
    rootCause: {
      id: normalizedText(input.rootCause.id),
      title: normalizedText(input.rootCause.title),
      description: normalizedText(input.rootCause.description),
      technicalDetail: normalizedText(input.rootCause.technicalDetail),
    },
    rootCauseOptions: input.rootCauseOptions.map(item => ({
      id: normalizedText(item.id),
      title: normalizedText(item.title),
    })),
    evidence: input.evidence.map(item => ({
      id: normalizedText(item.id),
      title: normalizedText(item.title),
      description: normalizedText(item.description),
      category: item.category,
      importance: item.importance,
    })),
    hints: input.hints.map(item => ({
      level: Number(item.level),
      label: normalizedText(item.label),
      text: normalizedText(item.text),
      scorePenalty: Number(item.scorePenalty),
    })),
    commands: input.commands.map(item => ({
      command: normalizedText(item.command),
      aliases: item.aliases.map(normalizedText),
      description: normalizedText(item.description),
      output: normalizedText(item.output),
      revealsEvidence: item.revealsEvidence.map(normalizedText),
      risky: item.risky === true,
    })),
    events: input.events.map(item => ({
      id: normalizedText(item.id),
      timestamp: normalizedText(item.timestamp),
      source: normalizedText(item.source),
      level: item.level,
      message: normalizedText(item.message),
      details: normalizedText(item.details),
      revealsEvidence: item.revealsEvidence.map(normalizedText),
    })),
    tickets: input.tickets.map(item => ({
      id: normalizedText(item.id),
      author: normalizedText(item.author),
      role: normalizedText(item.role),
      timestamp: normalizedText(item.timestamp),
      content: normalizedText(item.content),
      redHerring: item.redHerring === true,
      revealsEvidence: item.revealsEvidence.map(normalizedText),
    })),
    availableTools: input.availableTools.map(normalizedText),
    redHerrings: input.redHerrings.map(normalizedText),
    remediation: normalizedText(input.remediation),
    remediationKeywords: input.remediationKeywords.map(item => normalizedText(item).toLowerCase()),
    preventativeMeasures: input.preventativeMeasures.map(normalizedText),
    maxScore: 100,
  };
}

async function loadSourceExports() {
  const result = await build({
    stdin: {
      contents: [
        "export { allCases } from './src/data/cases/index.ts';",
        "export { CASE_CATALOG_ENTRIES } from './src/data/caseCatalog/entries.ts';",
      ].join('\n'),
      resolveDir: sourceRoot,
      sourcefile: 'faultlinelab-compiler-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
    alias: { '@': resolve(sourceRoot, 'src') },
    logLevel: 'silent',
  });
  const bundled = result.outputFiles[0]?.text;
  if (!bundled) throw new Error('FaultlineLab source compiler produced no executable bundle');
  return import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
}

function compileCase(sourceCase, entry, allCases, repairs, errors) {
  const evidenceIds = new Set(sourceCase.evidence.map(item => item.id));
  const commandKeys = new Set();
  const compiledCommands = sourceCase.terminalCommands.map(item => {
    const commandKey = item.command.trim().toLowerCase();
    if (commandKeys.has(commandKey)) errors.push(`${sourceCase.id}: duplicate command ${item.command}`);
    commandKeys.add(commandKey);
    const aliases = [];
    for (const alias of item.aliases ?? []) {
      const key = alias.trim().toLowerCase();
      if (commandKeys.has(key)) {
        repairs.push({ sourceId: sourceCase.id, code: 'DUPLICATE_COMMAND_ALIAS_REMOVED', detail: alias });
        continue;
      }
      commandKeys.add(key);
      aliases.push(alias);
    }
    return {
      command: item.command, aliases, description: item.description, output: item.output,
      revealsEvidence: [...(item.revealsEvidence ?? [])], risky: item.isRisky === true,
    };
  });
  const compiledEvents = sourceCase.eventLogs.map(item => {
    const details = typeof item.details === 'string' && item.details.trim()
      ? item.details
      : item.message;
    if (details !== item.details) {
      repairs.push({
        sourceId: sourceCase.id,
        code: 'EMPTY_EVENT_DETAILS_REPAIRED',
        detail: `${item.id} uses its authored event message as required detail`,
      });
    }
    return {
      id: item.id, timestamp: item.timestamp, source: item.source, level: item.level,
      message: item.message, details, revealsEvidence: [...(item.revealsEvidence ?? [])],
    };
  });
  const compiledTickets = sourceCase.ticketHistory.map(item => {
    const content = typeof item.content === 'string' && item.content.trim()
      ? item.content
      : `No additional detail was authored for ticket ${item.id}.`;
    if (content !== item.content) {
      repairs.push({
        sourceId: sourceCase.id,
        code: 'EMPTY_TICKET_CONTENT_REPAIRED',
        detail: `${item.id} receives an explicit truthful no-detail record`,
      });
    }
    return {
      id: item.id, author: item.author, role: item.role, timestamp: item.timestamp,
      content, redHerring: item.isRedHerring === true, revealsEvidence: [...(item.revealsEvidence ?? [])],
    };
  });
  const revealTargets = [
    ...compiledCommands.map(item => ({ item, text: `${item.command} ${item.description} ${item.output}` })),
    ...compiledEvents.map(item => ({ item, text: `${item.message} ${item.details}` })),
    ...compiledTickets.map(item => ({ item, text: item.content })),
  ];
  let reveals = revealTargets.flatMap(target => target.item.revealsEvidence);
  for (const evidence of sourceCase.evidence) {
    if ((evidence.category !== 'clue' && evidence.importance !== 'critical') || reveals.includes(evidence.id)) continue;
    const words = new Set(`${evidence.title} ${evidence.description}`.toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length > 3) ?? []);
    const best = [...revealTargets].sort((left, right) => {
      const score = target => [...words].filter(word => target.text.toLowerCase().includes(word)).length;
      return score(right) - score(left) || left.text.localeCompare(right.text);
    })[0];
    if (!best) errors.push(`${sourceCase.id}: required evidence ${evidence.id} is unreachable and no repair target exists`);
    else {
      best.item.revealsEvidence.push(evidence.id);
      repairs.push({ sourceId: sourceCase.id, code: 'UNREACHABLE_EVIDENCE_LINK_REPAIRED', detail: `${evidence.id} linked to ${best.text.slice(0, 100)}` });
    }
  }
  reveals = revealTargets.flatMap(target => target.item.revealsEvidence);
  for (const id of reveals) if (!evidenceIds.has(id)) errors.push(`${sourceCase.id}: unknown evidence reference ${id}`);
  for (const item of sourceCase.evidence) {
    if ((item.category === 'clue' || item.importance === 'critical') && !reveals.includes(item.id)) {
      errors.push(`${sourceCase.id}: required evidence ${item.id} is unreachable`);
    }
  }
  ensureUnique(sourceCase.evidence.map(item => item.id), `${sourceCase.id} evidence id`, errors);
  ensureUnique(compiledCommands.flatMap(item => [item.command, ...item.aliases]), `${sourceCase.id} command or alias`, errors);
  ensureUnique(sourceCase.hints.map(item => item.level), `${sourceCase.id} hint level`, errors);
  if (sourceCase.maxScore !== 100) errors.push(`${sourceCase.id}: maxScore must be 100`);
  if (sourceCase.hints.length !== 4 || sourceCase.hints.some((item, index) => item.level !== index + 1 || item.scorePenalty < 0 || item.scorePenalty > 50)) {
    errors.push(`${sourceCase.id}: hints must be ordered levels 1-4 with bounded penalties`);
  }

  const peerCases = [...allCases.filter(item => item.id !== sourceCase.id && item.category === sourceCase.category), ...allCases.filter(item => item.id !== sourceCase.id && item.category !== sourceCase.category)];
  const distractors = peerCases
    .sort((left, right) => sha256(`${sourceCase.id}:${left.id}`).localeCompare(sha256(`${sourceCase.id}:${right.id}`)))
    .filter((item, index, array) => array.findIndex(candidate => candidate.rootCause.title.toLowerCase() === item.rootCause.title.toLowerCase()) === index)
    .slice(0, 3)
    .map(item => ({ id: `distractor:${item.id}`, title: item.rootCause.title }));
  if (distractors.length < 1) errors.push(`${sourceCase.id}: no deterministic root-cause distractor is available`);
  repairs.push({ sourceId: sourceCase.id, code: 'ROOT_CAUSE_OPTIONS_COMPILED', detail: 'Source CaseDefinition stores one canonical cause; deterministic peer causes supply playable options.' });

  const sourceAuthorImagePath = entry.authorImagePath ?? null;
  let authorImagePath = sourceAuthorImagePath;
  if (sourceAuthorImagePath && !existsSync(resolve(sourceRoot, 'public', sourceAuthorImagePath))) {
    authorImagePath = null;
    repairs.push({ sourceId: sourceCase.id, code: 'MISSING_OPTIONAL_AUTHOR_ASSET_REMOVED', detail: sourceAuthorImagePath });
  }

  const keywords = remediationKeywords(sourceCase.remediation);
  if (keywords.length < 2) errors.push(`${sourceCase.id}: remediation cannot produce two deterministic scoring keywords`);
  repairs.push({ sourceId: sourceCase.id, code: 'REMEDIATION_KEYWORDS_COMPILED', detail: keywords.join(', ') });
  const slug = entry.slug || slugify(sourceCase.title);
  const content = normalizeCompiledContent({
    schemaVersion: 1,
    sourceId: sourceCase.id,
    description: sourceCase.description,
    briefing: sourceCase.briefing,
    symptoms: sourceCase.symptoms,
    rootCause: sourceCase.rootCause,
    rootCauseOptions: [{ id: sourceCase.rootCause.id, title: sourceCase.rootCause.title }, ...distractors],
    evidence: sourceCase.evidence.map(({ unlocked: _unlocked, unlockedBy: _unlockedBy, unlockedAt: _unlockedAt, ...item }) => item),
    hints: sourceCase.hints,
    commands: compiledCommands,
    events: compiledEvents,
    tickets: compiledTickets,
    availableTools: sourceCase.availableTools,
    redHerrings: sourceCase.redHerrings,
    remediation: sourceCase.remediation,
    remediationKeywords: keywords,
    preventativeMeasures: sourceCase.preventativeMeasures,
    maxScore: 100,
  });
  return {
    sourceId: sourceCase.id,
    slug,
    title: sourceCase.title,
    category: sourceCase.category,
    difficulty: sourceCase.difficulty,
    sourceHash: sha256({ sourceCase, entry }),
    contentHash: sha256(content),
    content,
    catalog: {
      estimatedMinutes: entry.estimatedMinutes,
      shortSummary: entry.shortSummary,
      mobileSummary: entry.mobileSummary,
      accessModel: entry.accessModel,
      sourceProductId: entry.sourceProductId,
      requiredEntitlements: entry.requiredEntitlements,
      requiredToolSlugs: entry.requiredToolSlugs,
      previewSymptoms: entry.previewSymptoms,
      previewSystems: entry.previewSystems,
      redHerringLevel: entry.redHerringLevel,
      sourceType: entry.sourceType,
      sourceCatalogStatus: entry.status,
      sourceAuthorImagePath,
      authorImagePath,
      tags: entry.tags,
      isStarter: entry.isStarter,
      isFeatured: entry.isFeatured,
      isDailyEligible: entry.isDailyEligible,
      isSandboxEligible: entry.isSandboxEligible,
      sortOrder: entry.sortOrder,
    },
  };
}

function generatedModule(manifest) {
  const serialized = JSON.stringify(manifest);
  return `/* This file is generated by scripts/faultlinelab/compile-source-cases.mjs. */\n` +
    `export const FAULTLINELAB_COMPILED_MANIFEST = JSON.parse(${JSON.stringify(serialized)}) as unknown as {\n` +
    `  schemaVersion: 1; sourceCommit: string; sourceManifestHash: string; discoveredCount: number;\n` +
    `  categoryCounts: Record<string, number>; difficultyCounts: Record<string, number>;\n` +
    `  repairs: ReadonlyArray<{ sourceId: string; code: string; detail: string }>;\n` +
    `  challenges: ReadonlyArray<{ sourceId: string; slug: string; title: string; category: string; difficulty: string; sourceHash: string; contentHash: string; content: Record<string, unknown>; catalog: Record<string, unknown> }>;\n` +
    `};\n` +
    `export const FAULTLINELAB_SOURCE_COMMIT = FAULTLINELAB_COMPILED_MANIFEST.sourceCommit;\n` +
    `export const FAULTLINELAB_SOURCE_CHALLENGES = FAULTLINELAB_COMPILED_MANIFEST.challenges;\n`;
}

const sourceExports = await loadSourceExports();
let allCases = sourceExports.allCases;
let CASE_CATALOG_ENTRIES = sourceExports.CASE_CATALOG_ENTRIES;
if (negativeFixture) {
  allCases = structuredClone(allCases);
  CASE_CATALOG_ENTRIES = structuredClone(CASE_CATALOG_ENTRIES);
  if (negativeFixture === 'duplicate-id') {
    allCases.push(structuredClone(allCases[0]));
  } else if (negativeFixture === 'invalid-evidence-reference') {
    allCases[0].terminalCommands[0].revealsEvidence = [
      ...(allCases[0].terminalCommands[0].revealsEvidence ?? []),
      'evidence-does-not-exist',
    ];
  } else if (negativeFixture === 'source-drift') {
    allCases[0].title = `${allCases[0].title} controlled source drift`;
  } else {
    throw new Error(`Unknown negative compiler fixture: ${negativeFixture}`);
  }
}
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const errors = [];
const repairs = [];
ensureUnique(allCases.map(item => item.id), 'source case id', errors);
ensureUnique(CASE_CATALOG_ENTRIES.map(item => item.id), 'catalog id', errors);
ensureUnique(CASE_CATALOG_ENTRIES.map(item => item.slug), 'catalog slug', errors);
const casesById = new Map(allCases.map(item => [item.id, item]));
const entriesById = new Map(CASE_CATALOG_ENTRIES.map(item => [item.id, item]));
for (const item of allCases) if (!entriesById.has(item.id)) errors.push(`${item.id}: source case has no catalog entry`);
for (const entry of CASE_CATALOG_ENTRIES) if (!casesById.has(entry.id)) errors.push(`${entry.id}: catalog entry has no source case definition`);
if (allCases.length !== CASE_CATALOG_ENTRIES.length) errors.push(`Source allCases count ${allCases.length} differs from catalog count ${CASE_CATALOG_ENTRIES.length}`);
const challenges = allCases.map(sourceCase => compileCase(sourceCase, entriesById.get(sourceCase.id), allCases, repairs, errors)).sort((left, right) => left.slug.localeCompare(right.slug));
for (const challenge of challenges) {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(challenge.slug)) errors.push(`${challenge.sourceId}: invalid slug ${challenge.slug}`);
  if (!['windows-ad', 'networking', 'automotive', 'electronics', 'servers', 'mixed', 'healthcare-imaging'].includes(challenge.category)) errors.push(`${challenge.sourceId}: invalid category ${challenge.category}`);
  if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(challenge.difficulty)) errors.push(`${challenge.sourceId}: invalid difficulty ${challenge.difficulty}`);
}
if (errors.length) throw new Error(`FaultlineLab source compiler failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
const countBy = key => Object.fromEntries([...new Set(challenges.map(item => item[key]))].sort().map(value => [value, challenges.filter(item => item[key] === value).length]));
const manifestCore = {
  schemaVersion: 1,
  sourceCommit: snapshot.sourceCommit,
  discoveredCount: challenges.length,
  categoryCounts: countBy('category'),
  difficultyCounts: countBy('difficulty'),
  repairs,
  challenges,
};
const manifest = { ...manifestCore, sourceManifestHash: sha256(manifestCore) };
const output = generatedModule(manifest);
if (write) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
}
else if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== output) throw new Error('Generated FaultlineLab source catalog is stale; run pnpm faultlinelab:catalog:write');
console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, discoveredCount: manifest.discoveredCount, categoryCounts: manifest.categoryCounts, difficultyCounts: manifest.difficultyCounts, repairs: repairs.length, sourceManifestHash: manifest.sourceManifestHash, output: outputPath.slice(root.length + 1), mode: write ? 'write' : 'check' }, null, 2));
