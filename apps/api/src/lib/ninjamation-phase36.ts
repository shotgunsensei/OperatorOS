import { createHash } from 'node:crypto';
import { analyzeScript, sha256, type NinjamationLanguage } from './ninjamation.js';

export const NINJAMATION_REPOSITORY = 'shotgunsensei/AutomationPacks';
export const NINJAMATION_REPOSITORY_BRANCH = 'main';
export const NINJAMATION_PHASE36_SOURCE_COMMIT = 'cca75338d04ed35b89f28d614eb51559735aa32f';
export const NINJAMATION_PHASE36_CATALOG_COMMIT = 'ca0e55fd086f6751a43964927166bfa69db012b6';

export const NINJAMATION_LIBRARY_FORMATS = [
  'powershell', 'python', 'batch', 'bash', 'vbscript', 'javascript', 'typescript',
  'autohotkey', 'registry', 'xml', 'json', 'yaml', 'other',
] as const;
export type NinjamationLibraryFormat = (typeof NINJAMATION_LIBRARY_FORMATS)[number];

const FORMAT_BY_EXTENSION: Readonly<Record<string, NinjamationLibraryFormat>> = Object.freeze({
  '.ps1': 'powershell',
  '.py': 'python',
  '.bat': 'batch',
  '.cmd': 'batch',
  '.sh': 'bash',
  '.bash': 'bash',
  '.vbs': 'vbscript',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.ahk': 'autohotkey',
  '.reg': 'registry',
  '.xml': 'xml',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
});

export type CatalogTreeEntry = {
  path: string;
  type: 'blob';
  sha: string;
  size?: number;
  content: string;
};

export type CatalogSnapshot = {
  repository: typeof NINJAMATION_REPOSITORY;
  branch: typeof NINJAMATION_REPOSITORY_BRANCH;
  commit: string;
  entries: CatalogTreeEntry[];
};

export type NormalizedCatalogScript = {
  sourcePath: string;
  sourceBlobSha: string;
  sourceCommit: string;
  sourceRepository: string;
  sourceBranch: string;
  sourceDisplayName: string;
  persistedName: string;
  description: string;
  fileName: string;
  language: NinjamationLibraryFormat;
  category: string;
  tags: string[];
  content: string;
  contentSha256: string;
  staticAnalysis: ReturnType<typeof analyzePhase36Script>;
};

export class NinjamationPhase36Error extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'NinjamationPhase36Error';
  }
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new NinjamationPhase36Error(`${field} is required`, 'NINJAMATION_INPUT_INVALID', 400, field);
    return null;
  }
  if (typeof value !== 'string') throw new NinjamationPhase36Error(`${field} must be text`, 'NINJAMATION_INPUT_INVALID', 400, field);
  const normalized = value.trim();
  if ((!normalized && required) || normalized.length > max) {
    throw new NinjamationPhase36Error(`${field} is invalid`, 'NINJAMATION_INPUT_INVALID', 400, field);
  }
  return normalized || null;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new NinjamationPhase36Error('Pagination value is invalid', 'NINJAMATION_INPUT_INVALID');
  }
  return number;
}

export function parseLibraryQuery(input: unknown) {
  const value = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const format = text(value.format, 'format', 30)?.toLowerCase() ?? null;
  if (format && !NINJAMATION_LIBRARY_FORMATS.includes(format as NinjamationLibraryFormat)) {
    throw new NinjamationPhase36Error('format is unsupported', 'NINJAMATION_INPUT_INVALID', 400, 'format');
  }
  const sort = text(value.sort, 'sort', 30)?.toLowerCase() ?? 'name';
  if (!['name', 'newest', 'updated', 'downloads'].includes(sort)) {
    throw new NinjamationPhase36Error('sort is unsupported', 'NINJAMATION_INPUT_INVALID', 400, 'sort');
  }
  const status = text(value.status, 'status', 20)?.toLowerCase() ?? null;
  if (status && !['draft', 'review', 'approved', 'retired'].includes(status)) {
    throw new NinjamationPhase36Error('status is unsupported', 'NINJAMATION_INPUT_INVALID', 400, 'status');
  }
  return {
    search: text(value.search ?? value.q, 'search', 160),
    format: format as NinjamationLibraryFormat | null,
    category: text(value.category, 'category', 80),
    status,
    source: text(value.source, 'source', 30),
    favoritesOnly: value.favoritesOnly === true || value.favoritesOnly === 'true',
    ownedOnly: value.ownedOnly === true || value.ownedOnly === 'true',
    includeDeprecated: value.includeDeprecated === true || value.includeDeprecated === 'true',
    sort: sort as 'name' | 'newest' | 'updated' | 'downloads',
    page: boundedInteger(value.page, 1, 1, 10_000),
    limit: boundedInteger(value.limit, 24, 1, 100),
  };
}

export function parseSyncRequest(input: unknown) {
  const value = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const idempotencyKey = text(value.idempotencyKey, 'idempotencyKey', 120, true)!;
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    throw new NinjamationPhase36Error('idempotencyKey is invalid', 'NINJAMATION_INPUT_INVALID', 400, 'idempotencyKey');
  }
  const requestedCommit = text(value.commit, 'commit', 40);
  if (requestedCommit && !/^[0-9a-f]{40}$/.test(requestedCommit)) {
    throw new NinjamationPhase36Error('commit must be a full lowercase Git SHA', 'NINJAMATION_INPUT_INVALID', 400, 'commit');
  }
  return { idempotencyKey, requestedCommit };
}

export function detectScriptFormat(path: string): NinjamationLibraryFormat | null {
  const file = path.toLowerCase();
  const dot = file.lastIndexOf('.');
  if (dot < 0) return null;
  return FORMAT_BY_EXTENSION[file.slice(dot)] ?? null;
}

function titleCase(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safePath(raw: string): string {
  const normalized = raw.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.length > 800 || normalized.includes('\0') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new NinjamationPhase36Error('Catalog path is invalid', 'NINJAMATION_CATALOG_PATH_INVALID');
  }
  return normalized;
}

function describeSecretFindings(content: string) {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/,
    /\b(?:password|passwd|api[_-]?key|auth[_-]?token)\s*[=:]\s*["'][^"'\r\n]{8,}["']/i,
  ];
  return patterns.filter((pattern) => pattern.test(content)).length;
}

export function analyzePhase36Script(content: string) {
  const base = analyzeScript(content);
  const secretFindingCount = describeSecretFindings(content);
  return {
    ...base,
    analyzerVersion: 2 as const,
    secretFindingCount,
    provenanceFindingCount: 0,
    findings: [
      ...base.findings,
      ...(secretFindingCount > 0 ? [{
        code: 'POTENTIAL_EMBEDDED_SECRET',
        severity: 'critical' as const,
        message: 'Potential embedded credential material requires removal before distribution.',
        line: null,
      }] : []),
    ],
    findingCount: base.findingCount + secretFindingCount,
    criticalCount: base.criticalCount + secretFindingCount,
  };
}

export function normalizeCatalogSnapshot(snapshot: CatalogSnapshot): {
  scripts: NormalizedCatalogScript[];
  snapshotSha256: string;
} {
  if (snapshot.repository !== NINJAMATION_REPOSITORY || snapshot.branch !== NINJAMATION_REPOSITORY_BRANCH) {
    throw new NinjamationPhase36Error('Catalog repository or branch is not allowlisted', 'NINJAMATION_CATALOG_NOT_ALLOWLISTED', 403);
  }
  if (!/^[0-9a-f]{40}$/.test(snapshot.commit)) {
    throw new NinjamationPhase36Error('Catalog commit is invalid', 'NINJAMATION_CATALOG_COMMIT_INVALID');
  }
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length > 10_000) {
    throw new NinjamationPhase36Error('Catalog tree is invalid or too large', 'NINJAMATION_CATALOG_TREE_INVALID');
  }
  const paths = new Set<string>();
  const scripts: NormalizedCatalogScript[] = [];
  for (const raw of snapshot.entries) {
    const sourcePath = safePath(raw.path);
    if (paths.has(sourcePath)) {
      throw new NinjamationPhase36Error(`Catalog contains duplicate path ${sourcePath}`, 'NINJAMATION_CATALOG_DUPLICATE_PATH');
    }
    paths.add(sourcePath);
    const language = detectScriptFormat(sourcePath);
    if (!language) continue;
    if (raw.type !== 'blob' || !/^[0-9a-f]{40,64}$/.test(raw.sha)) {
      throw new NinjamationPhase36Error(`Catalog blob identity is invalid for ${sourcePath}`, 'NINJAMATION_CATALOG_BLOB_INVALID');
    }
    if (typeof raw.content !== 'string' || raw.content.includes('\0') || raw.content.length < 1 || raw.content.length > 100_000) {
      throw new NinjamationPhase36Error(`Catalog content is invalid for ${sourcePath}`, 'NINJAMATION_CATALOG_CONTENT_INVALID');
    }
    const content = raw.content.replaceAll('\r\n', '\n').trimEnd();
    const fileName = sourcePath.split('/').at(-1)!;
    const segments = sourcePath.split('/');
    const category = segments.length > 1 ? titleCase(segments[0]).slice(0, 80) : 'General';
    const sourceDisplayName = titleCase(fileName.replace(/\.[^.]+$/, '')).slice(0, 180) || fileName.slice(0, 180);
    const pathKey = createHash('sha256').update(sourcePath).digest('hex').slice(0, 10);
    const tags = [...new Set([
      language,
      category.toLowerCase(),
      ...segments.slice(0, -1).map((segment) => segment.toLowerCase().replace(/[^a-z0-9-]+/g, '-')),
    ].filter(Boolean))].slice(0, 24);
    scripts.push({
      sourcePath,
      sourceBlobSha: raw.sha,
      sourceCommit: snapshot.commit,
      sourceRepository: snapshot.repository,
      sourceBranch: snapshot.branch,
      sourceDisplayName,
      persistedName: `${sourceDisplayName.slice(0, 166)} [${pathKey}]`,
      description: `${sourceDisplayName} — ${language} automation from ${category}. Review the source and safety findings before use.`,
      fileName: fileName.slice(0, 180),
      language,
      category,
      tags,
      content,
      contentSha256: sha256(content),
      staticAnalysis: analyzePhase36Script(content),
    });
  }
  scripts.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  const snapshotSha256 = sha256(JSON.stringify(scripts.map((item) => [
    item.sourcePath, item.sourceBlobSha, item.contentSha256, item.language, item.category, item.tags,
  ])));
  return { scripts, snapshotSha256 };
}

type GitHubTreeResponse = { sha?: unknown; tree?: Array<{ path?: unknown; type?: unknown; sha?: unknown; size?: unknown }>; truncated?: unknown };
type GitHubBlobResponse = { content?: unknown; encoding?: unknown; size?: unknown };

async function githubJson(url: string, token?: string | null): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OperatorOS-Ninjamation-Phase36',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new NinjamationPhase36Error(`GitHub catalog request failed with HTTP ${response.status}`, 'NINJAMATION_GITHUB_UNAVAILABLE', 503);
  }
  return response.json();
}

/** Fetches only the fixed public AutomationPacks repository; no caller URL reaches fetch. */
export async function fetchAutomationPacksSnapshot(input: { commit?: string | null; token?: string | null } = {}): Promise<CatalogSnapshot> {
  const commit = input.commit ?? NINJAMATION_PHASE36_CATALOG_COMMIT;
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new NinjamationPhase36Error('GitHub commit is invalid', 'NINJAMATION_CATALOG_COMMIT_INVALID');
  const root = `https://api.github.com/repos/${NINJAMATION_REPOSITORY}`;
  const tree = await githubJson(`${root}/git/trees/${commit}?recursive=1`, input.token) as GitHubTreeResponse;
  if (tree.truncated === true || !Array.isArray(tree.tree)) {
    throw new NinjamationPhase36Error('GitHub returned a truncated or invalid tree', 'NINJAMATION_GITHUB_TREE_INCOMPLETE', 503);
  }
  const candidates = tree.tree
    .filter((item) => item.type === 'blob' && typeof item.path === 'string' && detectScriptFormat(item.path))
    .map((item) => ({ path: String(item.path), sha: String(item.sha), size: Number(item.size ?? 0) }));
  if (candidates.length > 5_000) throw new NinjamationPhase36Error('GitHub tree exceeds the reviewed script limit', 'NINJAMATION_GITHUB_TREE_TOO_LARGE', 503);
  const entries: CatalogTreeEntry[] = [];
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.size) || candidate.size < 1 || candidate.size > 100_000) {
      throw new NinjamationPhase36Error(`GitHub blob size is invalid for ${candidate.path}`, 'NINJAMATION_GITHUB_BLOB_TOO_LARGE', 422);
    }
    const blob = await githubJson(`${root}/git/blobs/${candidate.sha}`, input.token) as GitHubBlobResponse;
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
      throw new NinjamationPhase36Error(`GitHub blob encoding is invalid for ${candidate.path}`, 'NINJAMATION_GITHUB_BLOB_INVALID', 503);
    }
    const content = Buffer.from(blob.content.replaceAll('\n', ''), 'base64').toString('utf8');
    entries.push({ path: candidate.path, type: 'blob', sha: candidate.sha, size: candidate.size, content });
  }
  return { repository: NINJAMATION_REPOSITORY, branch: NINJAMATION_REPOSITORY_BRANCH, commit, entries };
}

export function aiLanguage(value: unknown): NinjamationLanguage {
  const language = String(value ?? '').trim().toLowerCase();
  if (!['powershell', 'python', 'batch', 'bash'].includes(language)) {
    throw new NinjamationPhase36Error('AI language must be PowerShell, Python, Batch, or Bash', 'NINJAMATION_AI_FORMAT_INVALID', 400, 'language');
  }
  return language as NinjamationLanguage;
}
