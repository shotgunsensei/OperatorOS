import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parityRoot = join(root, 'docs', 'parity');
const moduleOutputRoot = join(parityRoot, 'modules');
const sourceManifestPath = join(parityRoot, 'source-manifest.json');
const waiversPath = join(parityRoot, 'OWNER_WAIVERS.yml');
const generatorPath = 'scripts/phase20-product-truth.mjs';
const args = new Set(process.argv.slice(2));
const write = args.has('--write');

const allowedStates = new Set([
  'ACTIVE_NATIVE',
  'ACTIVE_SHARED_EQUIVALENT',
  'OWNER_WAIVED',
  'BLOCKED',
]);

const sourceDefinitions = [
  {
    slug: 'brandforgeos',
    name: 'BrandForgeOS',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/BrandForge-OS.git',
      commit: '5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'callcommand-ai',
    name: 'CallCommand AI',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/Call-Command-AI.git',
      commit: 'd49434e1d641d62cc141591c7208539a7afbf11e',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'faultlinelab',
    name: 'FaultlineLab',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/Faultline-Lab.git',
      commit: '46877aae35565149ccf4f4988dd94627fc6bb92b',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
      truthNote: 'The source allCases export is compiler-discovered; every valid authored definition initializes as a published immutable OperatorOS challenge version.',
    },
  },
  {
    slug: 'ninja-launch-kit',
    name: 'Deploy Ops',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/Ninja-Launch-Kit.git',
      commit: '30bd1abc05846926e97bc7b26c5b7d6625e8f161',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'ninja-pool-hall',
    name: 'Operator Pool Hall',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/Shotgun-ninja-pool-hall.git',
      commit: '62439c4018ec551ce2891800351200c8ab2cb9e7',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'ninjamation',
    name: 'Script Ops',
    provenance: {
      selectedKind: 'composite_imported_snapshot',
      remote: 'https://github.com/shotgunsensei/AutomationPacks.git',
      commit: 'cca75338d04ed35b89f28d614eb51559735aa32f',
      ref: 'master',
      additionalSource: {
        commit: 'ca0e55fd086f6751a43964927166bfa69db012b6',
        ref: 'main',
        purpose: 'script catalog',
      },
      remoteVerification: 'master and main matched selected application/catalog commits on 2026-08-08',
      recoveryCandidates: [
        {
          commit: '1b8818afbc261f70e60584979e3e4efe550630c8',
          ref: 'codex/create-gui-for-script-selection-and-execution',
          disposition: 'retained_for_evidence',
          note: 'Older 35-entry catalog-only tree with no common ancestor to the application commit; not a fuller application baseline.',
        },
      ],
    },
  },
  {
    slug: 'outcall',
    name: 'OutCall',
    provenance: {
      selectedKind: 'owner_authorized_reconstruction',
      remote: null,
      commit: null,
      ref: null,
      authorizationDate: '2026-08-26',
      authority: 'The owner explicitly authorized recreating unavailable source code to close remaining failures and gaps. The OperatorOS shared-runtime implementation is the canonical current OutCall source; literal parity with an unrecovered historical repository is not claimed.',
      remoteVerification: 'Authenticated GitHub repository and code-name searches, including private repositories visible to shotgunsensei, returned no historical OutCall repository on 2026-08-13.',
      recoverySearch: [
        'apps/modules/outcall/source contains only the 627-byte README.md Git blob a724a70d40a72d47b4fa8bf2ac1c972bdd35474e',
        'C:/Dev/Outcall exists but is empty and has no Git repository',
        'No matching source path in Downloads, Documents, Desktop, OneDrive, or Codex attachments; Downloads/outcall.ts is byte-identical to the reconstructed OperatorOS helper',
        'No matching source in the 2026-03-04 Replit export or its embedded repositories',
        'No matching reachable, unreachable, or dangling source tree in the inspected OperatorOS Git archives and current Git object database',
        'The owner prompt attachment describes a requested build and is not executable source or runtime provenance',
      ],
    },
  },
  {
    slug: 'pulsedesk',
    name: 'PulseDesk',
    legacyLedger: 'docs/modules/pulsedesk/SOURCE_LEDGER.json',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/PulseDesk.git',
      commit: '937849471e489ed23db2a263d04160a388402740',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'snapproofos',
    name: 'SnapProofOS',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/snapproof.git',
      commit: '26bded38c13b5b6361d407462c68052b0c30613d',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'studyforge-ai',
    name: 'StudyForge AI',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/Study-Forge.git',
      commit: 'a607a9f34442b1d0f6bfffbf0293609529494825',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'techdeck',
    name: 'TechDeck',
    legacyLedger: 'docs/modules/techdeck/SOURCE_LEDGER.json',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/Tech-Deck.git',
      commit: '8125f8d89d8d39d60a50c8061a26133a0c917792',
      ref: 'main',
      remoteVerification: 'refs/heads/main matched selected commit on 2026-08-08',
    },
  },
  {
    slug: 'torqueshed',
    name: 'TorqueShed',
    provenance: {
      selectedKind: 'imported_snapshot',
      remote: 'https://github.com/shotgunsensei/TorqueShed-Codex.git',
      commit: '508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75',
      ref: 'main',
      remoteVerification: 'Clean local main and origin/main matched the selected commit on 2026-08-10.',
      recoveryCandidates: [
        {
          commit: 'c33ade5cef525d62d371a63946b814c58a72a4a7',
          ref: 'historical snapshot',
          disposition: 'retained_for_evidence',
          note: 'Older imported baseline retained in history; it predates the committed product schema, API, web restoration, billing adapter and E2E workflow selected by Phase 28.',
        },
      ],
    },
  },
  {
    slug: 'tradeflowkit',
    name: 'TradeFlowKit',
    legacyLedger: 'docs/modules/tradeflowkit/PHASE16_SOURCE_LEDGER.json',
    provenance: {
      selectedKind: 'imported_restored_snapshot',
      remote: 'https://github.com/shotgunsensei/TradeFlowKit.git',
      commit: '37aa67f1da804fc3ac56f36e50e01362077d7a26',
      ref: 'codex/restore-production-app (captured, no longer present on remote)',
      remoteVerification: 'Remote exposes only main at 6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55; restored commit was not remotely resolvable on 2026-08-08. The imported tree fingerprint is the repeatable baseline.',
      recoveryCandidates: [
        {
          commit: '6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55',
          ref: 'main',
          disposition: 'retained_for_evidence',
          note: 'Original public baseline; older than the imported restored snapshot.',
        },
      ],
    },
  },
];

const assetExtensions = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.mp4', '.ogg', '.otf',
  '.pdf', '.png', '.svg', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2',
]);
const privateSigningContainerExtensions = new Set(['.jks', '.keystore', '.p12', '.pfx']);
const codeExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const testPattern = /(?:^|\/)(?:e2e|test|tests)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu;
const mobilePattern = /(?:^|\/)(?:android|ios|mobile)(?:\/|$)|(?:^|\/)(?:app|eas)\.json$|capacitor|expo|manifest\.(?:json|webmanifest)$|service[-_.]?worker|(?:^|\/)sw\.[cm]?[jt]s$/iu;
const publicFlowPattern = /\/(?:auth|login|register|signup|landing|public|portal|quote|invoice|privacy|terms)(?:\/|$)|(?:^|\/)(?:landing|auth-page|public)[^/]*\.[jt]sx?$/iu;

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

function repoPath(absolute) {
  return normalizePath(relative(root, absolute));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

function sourceFingerprint(sourceRoot) {
  const files = walk(sourceRoot).filter(
    (file) => !privateSigningContainerExtensions.has(extname(file).toLowerCase()),
  );
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const file of files) {
    const sourceBytes = readFileSync(file);
    const bytes = new Set(['.jpg', '.jpeg', '.png', '.pdf']).has(extname(file).toLowerCase())
      ? sourceBytes
      : Buffer.from(sourceBytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
    const path = normalizePath(relative(sourceRoot, file));
    const pathBytes = Buffer.from(path, 'utf8');
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(pathBytes);
    hash.update(Buffer.from([0]));
    hash.update(length);
    hash.update(bytes);
    totalBytes += bytes.length;
  }
  return {
    algorithm: 'sha256(path NUL uint64be(canonical-size) canonical-content; text CRLF normalized to LF)',
    treeSha256: hash.digest('hex'),
    fileCount: files.length,
    totalBytes,
  };
}

function literal(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function normalizedText(node, sourceFile, limit = 240) {
  if (!node) return '';
  return node.getText(sourceFile).replace(/\s+/gu, ' ').trim().slice(0, limit);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function attribute(opening, sourceFile, name) {
  const property = opening.attributes?.properties?.find((item) => {
    if (!ts.isJsxAttribute(item)) return false;
    return item.name.getText(sourceFile) === name;
  });
  if (!property || !ts.isJsxAttribute(property) || !property.initializer) return null;
  if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
  if (ts.isJsxExpression(property.initializer)) {
    const direct = literal(property.initializer.expression);
    return direct ?? normalizedText(property.initializer.expression, sourceFile);
  }
  return normalizedText(property.initializer, sourceFile);
}

function jsxLabel(node, sourceFile) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  for (const name of ['aria-label', 'label', 'title']) {
    const value = attribute(opening, sourceFile, name);
    if (value) return value.replace(/\s+/gu, ' ').trim().slice(0, 120);
  }
  if (ts.isJsxElement(node)) {
    const text = node.children
      .filter(ts.isJsxText)
      .map((child) => child.text)
      .join(' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (text) return text.slice(0, 120);
  }
  return '';
}

function scriptKind(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function stateCounts(capabilities) {
  return Object.fromEntries([...allowedStates].map((state) => [
    state,
    capabilities.filter((capability) => capability.state === state).length,
  ]));
}

function typeCounts(capabilities) {
  const types = [...new Set(capabilities.map((capability) => capability.type))].sort();
  return Object.fromEntries(types.map((type) => [
    type,
    capabilities.filter((capability) => capability.type === type).length,
  ]));
}

function makeCapability(moduleSlug, input) {
  const canonicalSourceIdentity = input.canonicalSourceIdentity;
  const id = `${moduleSlug}.${input.type}.${sha256(`${moduleSlug}|${input.type}|${canonicalSourceIdentity}`).slice(0, 16)}`;
  return {
    capabilityId: id,
    moduleSlug,
    type: input.type,
    canonicalSourceIdentity,
    sourcePointers: [...new Set(input.sourcePointers ?? [])].sort(),
    missingSourcePointers: [...new Set(input.missingSourcePointers ?? [])].sort(),
    sourceLine: input.sourceLine ?? null,
    title: input.title,
    state: input.state ?? 'BLOCKED',
    blockerCode: input.blockerCode ?? (input.state === 'BLOCKED' || !input.state ? 'SOURCE_CAPABILITY_UNMAPPED' : null),
    currentTargets: [...new Set(input.currentTargets ?? [])].sort(),
    automatedEvidence: [...new Set(input.automatedEvidence ?? [])].sort(),
    ownerWaiverId: input.ownerWaiverId ?? null,
    priorDisposition: input.priorDisposition ?? null,
    note: input.note ?? null,
  };
}

function legacyCapabilities(definition) {
  if (!definition.legacyLedger) return [];
  const ledger = JSON.parse(readFileSync(join(root, definition.legacyLedger), 'utf8'));
  const typeMap = {
    pages: 'ui_route',
    apiRoutes: 'api_endpoint',
    tables: 'database_table',
    providers: 'integration',
    backgroundProcesses: 'background_process',
  };
  const capabilities = [];
  for (const [collection, items] of Object.entries(ledger.inventory ?? {})) {
    if (!Array.isArray(items) || !typeMap[collection]) continue;
    for (const item of items) {
      const claimedSourcePointers = [item.sourcePointer, ...(item.sourcePointers ?? [])]
        .filter(Boolean)
        .map((pointer) => `apps/modules/${definition.slug}/source/${normalizePath(pointer)}`);
      const missingSourcePointers = claimedSourcePointers.filter((pointer) => !existsSync(join(root, pointer)));
      const sourcePointers = claimedSourcePointers.filter((pointer) => existsSync(join(root, pointer)));
      if (missingSourcePointers.length > 0) sourcePointers.push(definition.legacyLedger);
      const currentTargets = (item.targetPointers ?? []).filter((pointer) => existsSync(join(root, pointer)));
      const automatedEvidence = (item.evidence ?? []).filter((pointer) =>
        existsSync(join(root, pointer)) && testPattern.test(normalizePath(pointer)));
      let state = 'BLOCKED';
      let blockerCode = 'BLOCKED_REVIEW';
      if (item.disposition === 'active' || item.disposition === 'shared_replacement') {
        if (currentTargets.length > 0 && automatedEvidence.length > 0) {
          state = item.disposition === 'active' ? 'ACTIVE_NATIVE' : 'ACTIVE_SHARED_EQUIVALENT';
          blockerCode = null;
        } else {
          blockerCode = 'MISSING_CURRENT_TARGET_OR_AUTOMATED_EVIDENCE';
        }
      } else if (item.disposition === 'phase16_gap' || item.disposition === 'restoration_gap') {
        blockerCode = 'SOURCE_PARITY_GAP';
      }
      if (missingSourcePointers.length > 0) {
        state = 'BLOCKED';
        blockerCode = 'SOURCE_IMPLEMENTATION_POINTER_MISSING';
      }
      capabilities.push(makeCapability(definition.slug, {
        type: typeMap[collection],
        canonicalSourceIdentity: `legacy-ledger:${collection}:${item.key}|${claimedSourcePointers.join('|')}`,
        sourcePointers,
        missingSourcePointers,
        title: item.key,
        state,
        blockerCode,
        currentTargets,
        automatedEvidence,
        priorDisposition: item.disposition,
        note: [
          item.note ?? null,
          missingSourcePointers.length > 0
            ? `Legacy ledger claims source paths absent from the pinned imported tree: ${missingSourcePointers.join(', ')}`
            : null,
        ].filter(Boolean).join(' ') || null,
      }));
      if (publicFlowPattern.test(item.key)) {
        capabilities.push(makeCapability(definition.slug, {
          type: 'public_flow',
          canonicalSourceIdentity: `legacy-ledger:${collection}:public-flow:${item.key}|${claimedSourcePointers.join('|')}`,
          sourcePointers,
          missingSourcePointers,
          title: item.key,
          state,
          blockerCode,
          currentTargets,
          automatedEvidence,
          priorDisposition: item.disposition,
          note: [
            item.note ?? null,
            missingSourcePointers.length > 0
              ? `Legacy ledger claims source paths absent from the pinned imported tree: ${missingSourcePointers.join(', ')}`
              : null,
          ].filter(Boolean).join(' ') || null,
        }));
      }
    }
  }
  return capabilities;
}

function discoverRawCapabilities(definition, sourceRoot) {
  const capabilities = [];
  const seen = new Set();
  const duplicateActions = new Map();
  const ledgerCovered = Boolean(definition.legacyLedger);

  function add(input) {
    const identity = `${input.type}|${input.canonicalSourceIdentity}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    capabilities.push(makeCapability(definition.slug, input));
  }

  for (const absolute of walk(sourceRoot)) {
    const relativeSource = normalizePath(relative(sourceRoot, absolute));
    const pointer = repoPath(absolute);
    const extension = extname(absolute).toLowerCase();
    if (assetExtensions.has(extension)) {
      add({
        type: 'asset',
        canonicalSourceIdentity: relativeSource,
        sourcePointers: [pointer],
        title: relativeSource,
        note: 'Source asset has no verified visual-equivalence mapping in the Phase 20 baseline.',
      });
    }
    if (testPattern.test(relativeSource)) {
      add({
        type: 'source_test',
        canonicalSourceIdentity: relativeSource,
        sourcePointers: [pointer],
        title: relativeSource,
        note: 'Source test expectation is inventoried but not yet mapped to an OperatorOS compatibility test.',
      });
    }
    if (mobilePattern.test(relativeSource)) {
      add({
        type: 'mobile_pwa_surface',
        canonicalSourceIdentity: relativeSource,
        sourcePointers: [pointer],
        title: relativeSource,
        blockerCode: 'MOBILE_OR_PWA_PARITY_UNPROVEN',
      });
    }
    if (!codeExtensions.has(extension) && extension !== '.sql') continue;

    const text = readFileSync(absolute, 'utf8');
    if (extension === '.sql') {
      for (const match of text.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?([A-Za-z0-9_.-]+)["`]?\s*\(([\s\S]*?)\);/giu)) {
        const table = match[1];
        if (!ledgerCovered) {
          add({
            type: 'database_table',
            canonicalSourceIdentity: `${relativeSource}#${table}`,
            sourcePointers: [pointer],
            title: table,
          });
        }
        for (const rawLine of match[2].split(/\r?\n/gu)) {
          const line = rawLine.trim().replace(/,$/u, '');
          const column = line.match(/^["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\s+/u)?.[1];
          if (!column || /^(?:CHECK|CONSTRAINT|FOREIGN|PRIMARY|UNIQUE)$/iu.test(column)) continue;
          add({
            type: 'database_column',
            canonicalSourceIdentity: `${relativeSource}#${table}.${column}`,
            sourcePointers: [pointer],
            title: `${table}.${column}`,
          });
        }
      }
      continue;
    }

    const sourceFile = ts.createSourceFile(pointer, text, ts.ScriptTarget.Latest, true, scriptKind(absolute));
    const routeFromPage = relativeSource.match(/(?:^|\/)app\/(.*)\/page\.tsx$/u);
    if (routeFromPage && !ledgerCovered) {
      const route = `/${routeFromPage[1]}`
        .replace(/\/(?:\([^/]+\))(?=\/|$)/gu, '')
        .replace(/\[\.\.\.([^\]]+)\]/gu, ':$1*')
        .replace(/\[([^\]]+)\]/gu, ':$1')
        .replace(/\/+/gu, '/');
      add({
        type: 'ui_route',
        canonicalSourceIdentity: `${relativeSource}#${route}`,
        sourcePointers: [pointer],
        sourceLine: 1,
        title: route,
      });
    }
    if (/(?:^|\/)pages\/[^/]+\.[jt]sx?$/iu.test(relativeSource) && !ledgerCovered) {
      add({
        type: 'ui_page',
        canonicalSourceIdentity: relativeSource,
        sourcePointers: [pointer],
        sourceLine: 1,
        title: relativeSource.split('/').at(-1),
      });
    }
    if (/export|download/iu.test(relativeSource)) {
      add({
        type: 'export_flow',
        canonicalSourceIdentity: `file:${relativeSource}`,
        sourcePointers: [pointer],
        sourceLine: 1,
        title: relativeSource,
      });
    }
    if (/import|upload/iu.test(relativeSource)) {
      add({
        type: 'import_flow',
        canonicalSourceIdentity: `file:${relativeSource}`,
        sourcePointers: [pointer],
        sourceLine: 1,
        title: relativeSource,
      });
    }
    if (/worker|scheduler|queue|cron|background|job-runner/iu.test(relativeSource) && !testPattern.test(relativeSource)) {
      if (!ledgerCovered) {
        add({
          type: 'background_process',
          canonicalSourceIdentity: `file:${relativeSource}`,
          sourcePointers: [pointer],
          sourceLine: 1,
          title: relativeSource,
        });
      }
    }

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isPropertyAccessExpression(expression)) {
          const method = expression.name.text.toUpperCase();
          const route = literal(node.arguments[0]);
          if (!ledgerCovered && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) && route?.startsWith('/')) {
            add({
              type: 'api_endpoint',
              canonicalSourceIdentity: `${relativeSource}#${method} ${route}`,
              sourcePointers: [pointer],
              sourceLine: lineOf(sourceFile, node),
              title: `${method} ${route}`,
            });
            if (/export|download/iu.test(route)) {
              add({
                type: 'export_flow',
                canonicalSourceIdentity: `${relativeSource}#${method} ${route}`,
                sourcePointers: [pointer],
                sourceLine: lineOf(sourceFile, node),
                title: `${method} ${route}`,
              });
            }
            if (/import|upload/iu.test(route)) {
              add({
                type: 'import_flow',
                canonicalSourceIdentity: `${relativeSource}#${method} ${route}`,
                sourcePointers: [pointer],
                sourceLine: lineOf(sourceFile, node),
                title: `${method} ${route}`,
              });
            }
            if (publicFlowPattern.test(route)) {
              add({
                type: 'public_flow',
                canonicalSourceIdentity: `${relativeSource}#${method} ${route}`,
                sourcePointers: [pointer],
                sourceLine: lineOf(sourceFile, node),
                title: `${method} ${route}`,
              });
            }
          }
        }
        const callee = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        if (['pgTable', 'sqliteTable', 'mysqlTable'].includes(callee)) {
          const table = literal(node.arguments[0]);
          if (table) {
            if (!ledgerCovered) {
              add({
                type: 'database_table',
                canonicalSourceIdentity: `${relativeSource}#${table}`,
                sourcePointers: [pointer],
                sourceLine: lineOf(sourceFile, node),
                title: table,
              });
            }
            const columns = node.arguments[1];
            if (columns && ts.isObjectLiteralExpression(columns)) {
              for (const property of columns.properties) {
                if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
                const column = property.name?.getText(sourceFile).replaceAll(/["']/gu, '');
                if (!column) continue;
                add({
                  type: 'database_column',
                  canonicalSourceIdentity: `${relativeSource}#${table}.${column}`,
                  sourcePointers: [pointer],
                  sourceLine: lineOf(sourceFile, property),
                  title: `${table}.${column}`,
                });
              }
            }
          }
        }
        if (!ledgerCovered && ['setInterval', 'schedule', 'cron', 'enqueue', 'queueJob', 'addJob'].includes(callee)) {
          add({
            type: 'background_process',
            canonicalSourceIdentity: `${relativeSource}#${callee}:${normalizedText(node.arguments[0], sourceFile)}`,
            sourcePointers: [pointer],
            sourceLine: lineOf(sourceFile, node),
            title: `${callee} ${normalizedText(node.arguments[0], sourceFile, 80)}`.trim(),
          });
        }
      }

      if (!ledgerCovered && ts.isPropertyAccessExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(sourceFile) === 'process'
        && node.expression.name.text === 'env') {
        const name = node.name.text;
        add({
          type: 'integration',
          canonicalSourceIdentity: `${relativeSource}#env:${name}`,
          sourcePointers: [pointer],
          sourceLine: lineOf(sourceFile, node),
          title: name,
        });
      }
      if (!ledgerCovered && ts.isElementAccessExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(sourceFile) === 'process'
        && node.expression.name.text === 'env') {
        const name = literal(node.argumentExpression);
        if (name) {
          add({
            type: 'integration',
            canonicalSourceIdentity: `${relativeSource}#env:${name}`,
            sourcePointers: [pointer],
            sourceLine: lineOf(sourceFile, node),
            title: name,
          });
        }
      }

      if (!ledgerCovered && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName.getText(sourceFile);
        if (tag === 'Route' || tag.endsWith('.Route')) {
          const route = attribute(opening, sourceFile, 'path');
          if (route?.startsWith('/')) {
            add({
              type: 'ui_route',
              canonicalSourceIdentity: `${relativeSource}#${route}`,
              sourcePointers: [pointer],
              sourceLine: lineOf(sourceFile, node),
              title: route,
            });
            if (publicFlowPattern.test(route)) {
              add({
                type: 'public_flow',
                canonicalSourceIdentity: `${relativeSource}#${route}`,
                sourcePointers: [pointer],
                sourceLine: lineOf(sourceFile, node),
                title: route,
              });
            }
          }
        }
      }

      if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
        && !/(?:^|\/)components\/ui\//u.test(relativeSource)
        && !testPattern.test(relativeSource)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName.getText(sourceFile);
        const onClick = attribute(opening, sourceFile, 'onClick');
        const onSubmit = attribute(opening, sourceFile, 'onSubmit');
        const href = attribute(opening, sourceFile, 'href') ?? attribute(opening, sourceFile, 'to');
        const isAction = Boolean(onClick || onSubmit || href || ['button', 'Button', 'form', 'Form', 'a', 'Link'].includes(tag));
        if (isAction) {
          const event = onClick ? 'onClick' : onSubmit ? 'onSubmit' : href ? 'navigate' : tag.toLowerCase() === 'form' ? 'submit' : 'activate';
          const handler = onClick ?? onSubmit ?? href ?? '';
          const label = jsxLabel(node, sourceFile);
          const base = `${relativeSource}#${tag}:${event}:${handler}:${label}`;
          const occurrence = (duplicateActions.get(base) ?? 0) + 1;
          duplicateActions.set(base, occurrence);
          add({
            type: 'component_action',
            canonicalSourceIdentity: `${base}#${occurrence}`,
            sourcePointers: [pointer],
            sourceLine: lineOf(sourceFile, node),
            title: label || href || `${tag} ${event}`,
          });
        }
      }

      if (ts.isFunctionDeclaration(node) && node.name && /export|download/iu.test(node.name.text)) {
        add({
          type: 'export_flow',
          canonicalSourceIdentity: `${relativeSource}#function:${node.name.text}`,
          sourcePointers: [pointer],
          sourceLine: lineOf(sourceFile, node),
          title: node.name.text,
        });
      }
      if (ts.isFunctionDeclaration(node) && node.name && /import|upload/iu.test(node.name.text)) {
        add({
          type: 'import_flow',
          canonicalSourceIdentity: `${relativeSource}#function:${node.name.text}`,
          sourcePointers: [pointer],
          sourceLine: lineOf(sourceFile, node),
          title: node.name.text,
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return capabilities;
}

function specialCapabilities(definition, sourceRoot) {
  const capabilities = [];
  if (definition.slug === 'outcall') {
    capabilities.push(makeCapability(definition.slug, {
      type: 'source_recovery',
      canonicalSourceIdentity: 'canonical-launchable-source-application',
      sourcePointers: ['apps/modules/outcall/source/README.md'],
      title: 'Establish the owner-authorized canonical OutCall reconstruction',
      state: 'ACTIVE_NATIVE',
      blockerCode: null,
      currentTargets: [
        'apps/api/src/lib/outcall-db-init.ts',
        'apps/api/src/lib/outcall.ts',
        'apps/api/src/lib/outcall-provider.ts',
        'apps/api/src/routes/outcall-routes.ts',
        'apps/web/src/components/module-shells/OutCallShell.tsx',
        'apps/web/src/components/module-shells/OutCallWorkspace.tsx',
        'apps/web/src/components/module-shells/OutCallRoute.contract.ts',
      ],
      automatedEvidence: [
        'apps/api/test/outcall-adapter.test.ts',
        'apps/api/test/outcall-provider.test.ts',
        'apps/api/test/outcall-phase12b-db.test.ts',
        'apps/api/test/outcall-phase50-routes.test.ts',
        'apps/web/e2e/phase50-outcall-routes.spec.ts',
        'scripts/phase37/outcall-source-gate.test.mjs',
      ],
      note: 'The original historical repository was not recoverable. On 2026-08-26 the owner authorized reconstruction; the tenant-scoped OperatorOS web/API implementation is now the canonical current OutCall source and is covered by focused adapter, provider, persistence, route, and browser evidence. Provider activation remains a separate fail-closed go-live gate.',
    }));
  }
  if (definition.slug === 'tradeflowkit') {
    capabilities.push(makeCapability(definition.slug, {
      type: 'visual_contract',
      canonicalSourceIdentity: 'brand-identity:orange-navy',
      sourcePointers: [
        'apps/modules/tradeflowkit/source/client/src/index.css',
        'apps/modules/tradeflowkit/source/client/src/pages/auth-page.tsx',
      ],
      title: 'Orange and navy TradeFlowKit product identity',
      state: 'ACTIVE_NATIVE',
      blockerCode: null,
      currentTargets: [
        'apps/web/src/components/module-shells/TradeFlowKitShell.tsx',
        'apps/web/src/components/module-shells/TradeFlowKitShell.module.css',
        'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
      ],
      automatedEvidence: [
        'scripts/phase23/tradeflowkit-visual-contract.test.mjs',
        'apps/web/e2e/tradeflowkit-phase23-visual.spec.ts',
      ],
      note: 'Phase 23 scopes the pinned source orange/navy light/dark tokens to the TradeFlowKit product shell, retains the OperatorOS header, removes the legacy green shell palette, and maps active deep routes plus desktop/tablet/mobile visual and accessibility contracts.',
    }));
  }
  if (definition.slug === 'torqueshed') {
    capabilities.push(makeCapability(definition.slug, {
      type: 'mobile_product',
      canonicalSourceIdentity: 'expo-ios-android-product',
      sourcePointers: [
        'apps/modules/torqueshed/source/artifacts/torqueshed-mobile/app.json',
        'apps/modules/torqueshed/source/artifacts/torqueshed-mobile/src/app/(tabs)/_layout.tsx',
      ],
      title: 'Expo iOS and Android TorqueShed product',
      state: 'BLOCKED',
      blockerCode: 'NATIVE_MOBILE_PARITY_REQUIRED',
      note: 'Web-only evidence does not prove the imported Expo iOS/Android workflows, navigation, SSO or assets.',
    }));
  }
  if (definition.slug === 'faultlinelab') {
    const caseRoot = join(sourceRoot, 'artifacts', 'faultline-lab', 'src', 'data', 'cases');
    const caseById = new Map();
    for (const file of walk(caseRoot).filter((path) => path.endsWith('.ts'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bid:\s*['"](case-[^'"]+)['"]/gu)) {
        if (!caseById.has(match[1])) caseById.set(match[1], repoPath(file));
      }
    }
    for (const [caseId, pointer] of [...caseById].sort(([left], [right]) => left.localeCompare(right))) {
      capabilities.push(makeCapability(definition.slug, {
        type: 'playable_case',
        canonicalSourceIdentity: caseId,
        sourcePointers: [pointer],
        title: caseId,
        state: 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [
          'apps/api/src/generated/faultlinelab-source-catalog.ts',
          'apps/api/src/lib/faultlinelab-starter-content.ts',
          'apps/api/src/routes/faultlinelab-routes.ts',
          'apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx',
        ],
        automatedEvidence: [
          'scripts/faultlinelab/compile-source-cases.test.mjs',
          'apps/api/test/faultlinelab-full-catalog.test.ts',
          'apps/api/test/faultlinelab-domain.test.ts',
          'apps/api/test/faultlinelab-workflow.test.ts',
        ],
        note: 'The source compiler discovers this authored case from allCases, validates or explicitly repairs it, and initializes it as a hash-keyed published immutable challenge version. The full-catalog test starts, acts, submits, scores, reloads, and restart-reloads every discovered case with zero exclusions.',
      }));
    }
  }
  return capabilities;
}

function applyCurrentRestorationMappings(definition, capabilities) {
  if (definition.slug === 'ninjamation') {
    const nativeTargets = [
      'apps/api/src/lib/ninjamation-db-init.ts',
      'apps/api/src/lib/ninjamation-phase36-db-init.ts',
      'apps/api/src/lib/ninjamation.ts',
      'apps/api/src/lib/ninjamation-phase36.ts',
      'apps/api/src/lib/ninjamation-access.ts',
      'apps/api/src/lib/ninjamation-sync.ts',
      'apps/api/src/routes/ninjamation-routes.ts',
      'apps/api/src/routes/ninjamation-phase36-routes.ts',
      'apps/web/src/components/module-shells/NinjamationShell.tsx',
      'apps/web/src/app/public/ninjamation/[page]/page.tsx',
      'apps/web/src/lib/auth.ts',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
      'apps/web/src/middleware.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/entitlement-resolver.ts',
      'apps/api/src/lib/ai-provider.ts',
      'apps/api/src/lib/shared-provider-adapters.ts',
      'apps/api/src/lib/shared-background-jobs.ts',
      'apps/api/src/lib/shared-schedules-exports.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/routes/auth-routes.ts',
      'apps/api/src/routes/billing-routes.ts',
      'apps/api/src/routes/tenant-admin-routes.ts',
      'apps/api/src/lib/database-release-contract.ts',
    ];
    const evidence = [
      'apps/api/test/ninjamation-phase36-domain.test.ts',
      'apps/api/test/ninjamation-phase36-db.test.ts',
      'apps/api/test/ninjamation-phase36-static.test.ts',
      'apps/api/test/ninjamation-domain.test.ts',
      'apps/api/test/ninjamation-db.test.ts',
      'apps/web/e2e/ninjamation-phase36.spec.ts',
    ];
    const sharedBoundary = /(?:routes\/auth|\/auth\/|\/login|\/sign.?in|\/sign.?up|\/logout|\/me\b|billing|subscription|checkout|plan|entitlement|stripe|user.?owner|tenant|membership|session|password|admin.?user|account.?profile|health|openai|provider|integration|secret|object.?storage|storage\/|email.?provider|operatoros|replit|database.?url|\bport\b)/iu;
    const sharedSchemaBoundary = /^(?:users|user_roles|payments|subscriptions)(?:\.|$)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const sourceText = [capability.title, capability.canonicalSourceIdentity, ...capability.sourcePointers].join(' ');
      const shared = capability.type === 'integration'
        || ((capability.type === 'database_table' || capability.type === 'database_column') && sharedSchemaBoundary.test(capability.title))
        || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'database_table'
        ? (shared ? ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts'] : ['apps/api/src/lib/ninjamation-phase36-db-init.ts'])
        : capability.type === 'ui_page' || capability.type === 'ui_route'
          ? ['apps/web/src/app/modules/[slug]/[...path]/page.tsx','apps/web/src/components/module-shells/NinjamationShell.tsx','apps/web/src/app/public/ninjamation/[page]/page.tsx']
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...(capability.currentTargets || []), ...(shared ? sharedTargets : nativeTargets), ...typedTargets])].sort(),
        automatedEvidence: [...new Set([...(capability.automatedEvidence || []), ...evidence])].sort(),
        note: [capability.note, shared
          ? 'Phase 36 preserves this outcome through OperatorOS identity, tenant, role, entitlement, billing, shared AI/provider, scheduler, usage, audit, or administration authority.'
          : 'Phase 36 restores this outcome through additive v45 persistence, fixed-source commit-provenanced AutomationPacks synchronization, immutable versions, search and ownership workflows, validated AI drafts, exact checksum downloads, source-compatible routes, and an explicit no-execution boundary.'].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'callcommand-ai') {
    const nativeTargets = [
      'apps/api/src/lib/callcommand-db-init.ts',
      'apps/api/src/lib/callcommand-phase35-db-init.ts',
      'apps/api/src/lib/callcommand.ts',
      'apps/api/src/lib/callcommand-phase35.ts',
      'apps/api/src/lib/telephony.ts',
      'apps/api/src/routes/callcommand-routes.ts',
      'apps/api/src/routes/callcommand-phase35-routes.ts',
      'apps/web/src/components/module-shells/CallCommandShell.tsx',
      'apps/web/src/lib/auth.ts',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/ai-provider.ts',
      'apps/api/src/lib/shared-attachments.ts',
      'apps/api/src/lib/shared-provider-adapters.ts',
      'apps/api/src/lib/shared-outbound-webhooks.ts',
      'apps/api/src/lib/shared-webhooks.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/lib/shared-secret-vault.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/routes/auth-routes.ts',
      'apps/api/src/routes/billing-routes.ts',
      'apps/api/src/routes/tenant-admin-routes.ts',
      'apps/api/src/lib/database-release-contract.ts',
    ];
    const evidence = [
      'apps/api/test/callcommand-phase35-live-call-gate.test.ts',
      'apps/api/test/callcommand-phase35-static.test.ts',
      'apps/api/test/callcommand-phase35-db.test.ts',
      'apps/api/test/callcommand-twilio-webhooks.test.ts',
      'apps/web/e2e/callcommand-phase35.spec.ts',
      'scripts/phase35/callcommand-contract.test.mjs',
    ];
    const sharedBoundary = /(?:routes\/auth|\/auth\/|\/login|\/sign.?in|\/sign.?up|\/logout|\/me\b|billing|subscription|checkout|plan|entitlement|stripe|user.?owner|tenant|membership|session|password|admin|settings\/account|health|openai|provider|integration|secret|object.?storage|storage\/|upload.?url|email.?provider|slack.?provider|operatoros|replit|database.?url|\bport\b)/iu;
    const sharedSchemaBoundary = /^(?:users|integrations)(?:\.|$)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const sourceText = [capability.title, capability.canonicalSourceIdentity, ...capability.sourcePointers].join(' ');
      const shared = capability.type === 'integration'
        || ((capability.type === 'database_table' || capability.type === 'database_column') && sharedSchemaBoundary.test(capability.title))
        || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'database_table'
        ? (shared ? ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts'] : ['apps/api/src/lib/callcommand-phase35-db-init.ts'])
        : capability.type === 'ui_page' || capability.type === 'ui_route'
          ? ['apps/web/src/app/modules/[slug]/[...path]/page.tsx','apps/web/src/components/module-shells/CallCommandShell.tsx']
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...(capability.currentTargets || []), ...(shared ? sharedTargets : nativeTargets), ...typedTargets])].sort(),
        automatedEvidence: [...new Set([...(capability.automatedEvidence || []), ...evidence])].sort(),
        note: [capability.note, shared
          ? 'Phase 35 preserves this outcome through OperatorOS identity, tenant, role, entitlement, billing, provider, encrypted-secret, scanned-storage, signed-webhook, usage, audit, or administration authority.'
          : 'Phase 35 restores this outcome through additive v44 persistence, signed multi-turn Twilio voice, versioned flow execution traces, structured call intelligence, idempotent action dispatch, protected recording ingestion, live switchboard state, provider-confirmed transfer, PDF reporting, and source-compatible product routes.'].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'ninja-launch-kit') {
    const nativeTargets = [
      'apps/api/src/generated/ninja-launch-kit-source-catalog.ts',
      'apps/api/src/lib/ninja-launch-kit-db-init.ts',
      'apps/api/src/lib/ninja-launch-kit-phase34-db-init.ts',
      'apps/api/src/lib/ninja-launch-kit-phase34.ts',
      'apps/api/src/lib/ninja-launch-kit-access.ts',
      'apps/api/src/routes/ninja-launch-kit-routes.ts',
      'apps/api/src/routes/ninja-launch-kit-phase34-routes.ts',
      'apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx',
      'apps/web/src/components/module-shells/NinjaLaunchKitShell.tsx',
      'apps/web/src/lib/auth.ts',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
      'apps/web/src/app/public/ninja-launch-kit/[page]/page.tsx',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/entitlement-resolver.ts',
      'apps/api/src/lib/ai-provider.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/routes/auth-routes.ts',
      'apps/api/src/routes/billing-routes.ts',
      'apps/api/src/routes/tenant-admin-routes.ts',
      'apps/api/src/lib/database-release-contract.ts',
    ];
    const evidence = [
      'scripts/phase34/ninja-launch-kit-contract.test.mjs',
      'apps/api/test/ninja-launch-kit-phase34-domain.test.ts',
      'apps/api/test/ninja-launch-kit-phase34-static.test.ts',
      'apps/web/e2e/ninja-launch-kit-phase34.spec.ts',
    ];
    const sharedBoundary = /(?:routes\/auth|\/auth\/|\/login|\/signup|\/logout|\/profile|account.?delete|billing|subscription|checkout|portal|webhook|stripe|plan.?limit|entitlement|session.?secret|database.?url|anthropic|openai|provider|routes\/admin|platform.?admin|health|operatoros|node.?env|base.?path|repl.?id|\bport\b)/iu;
    const sharedSchemaBoundary = /^(?:users|sessions|stripe_events|admin_settings|featured_templates)(?:\.|$)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const sourceText = [capability.title,capability.canonicalSourceIdentity,...capability.sourcePointers].join(' ');
      const shared = capability.type === 'integration'
        || capability.type === 'background_process'
        || ((capability.type === 'database_table' || capability.type === 'database_column') && sharedSchemaBoundary.test(capability.title))
        || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'database_table'
        ? (shared ? ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts'] : ['apps/api/src/lib/ninja-launch-kit-phase34-db-init.ts'])
        : capability.type === 'ui_page' || capability.type === 'ui_route'
          ? ['apps/web/src/app/modules/[slug]/[...path]/page.tsx','apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx','apps/web/src/app/public/ninja-launch-kit/[page]/page.tsx']
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...(capability.currentTargets || []),...(shared ? sharedTargets : nativeTargets),...typedTargets])].sort(),
        automatedEvidence: [...new Set([...(capability.automatedEvidence || []),...evidence])].sort(),
        note: [capability.note, shared
          ? 'Phase 34 preserves this source outcome through OperatorOS identity, tenant, role, entitlement, billing, shared AI-provider, metered usage, legal, runtime, or platform-admin authority.'
          : 'Phase 34 restores this source outcome through additive v43 persistence, a compiler-derived 20-template and nine-brief catalog, deterministic and schema-validated AI generation, history, soft-delete undo, plan-safe visual briefs, persisted checksum exports, source-compatible deep links, and the responsive dark-crimson product workspace.'].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'studyforge-ai') {
    const nativeTargets = [
      'apps/api/src/lib/studyforge-db-init.ts',
      'apps/api/src/lib/studyforge-phase33-db-init.ts',
      'apps/api/src/lib/studyforge.ts',
      'apps/api/src/lib/studyforge-phase33.ts',
      'apps/api/src/lib/studyforge-access.ts',
      'apps/api/src/routes/studyforge-routes.ts',
      'apps/api/src/routes/studyforge-phase33-routes.ts',
      'apps/web/src/components/module-shells/StudyForgeShell.tsx',
      'apps/web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx',
      'apps/web/src/lib/auth.ts',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/entitlement-resolver.ts',
      'apps/api/src/lib/ai-provider.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/routes/auth-routes.ts',
      'apps/api/src/routes/billing-routes.ts',
      'apps/api/src/routes/tenant-admin-routes.ts',
      'apps/api/src/lib/database-release-contract.ts',
    ];
    const nativeSchemas = ['apps/api/src/lib/studyforge-db-init.ts','apps/api/src/lib/studyforge-phase33-db-init.ts'];
    const sharedSchemas = ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts'];
    const uiTargets = ['apps/web/src/app/modules/[slug]/page.tsx','apps/web/src/app/modules/[slug]/[...path]/page.tsx','apps/web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx'];
    const evidence = [
      'apps/api/test/studyforge-domain.test.ts',
      'apps/api/test/studyforge-db.test.ts',
      'apps/api/test/studyforge-phase33-domain.test.ts',
      'apps/api/test/studyforge-phase33-static.test.ts',
      'apps/api/test/studyforge-phase33-db.test.ts',
      'apps/web/e2e/studyforge-phase33.spec.ts',
    ];
    const sharedBoundary = /(?:routes\/auth|\/auth\/|\/login|\/signup|\/logout|\/profile|account.?delete|billing|subscription|checkout|portal|webhook|stripe|plan.?limit|entitlement|session.?secret|database.?url|openai|provider|routes\/admin|platform.?admin|health|contact|landing|pricing|terms|privacy|legal|operatoros|node.?env|base.?path|repl.?id|\bport\b)/iu;
    const sharedSchemaBoundary = /^(?:users|sessions|stripe_events)(?:\.|$)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const sourceText = [capability.title,capability.canonicalSourceIdentity,...capability.sourcePointers].join(' ');
      const shared = capability.type === 'integration'
        || capability.type === 'background_process'
        || capability.type === 'public_flow'
        || ((capability.type === 'database_table' || capability.type === 'database_column') && sharedSchemaBoundary.test(capability.title))
        || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'ui_page' || capability.type === 'ui_route'
        ? uiTargets
        : capability.type === 'database_table'
          ? (shared ? sharedSchemas : nativeSchemas)
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...(capability.currentTargets || []),...(shared ? sharedTargets : nativeTargets),...typedTargets])].sort(),
        automatedEvidence: [...new Set([...(capability.automatedEvidence || []),...evidence])].sort(),
        note: [capability.note, shared
          ? 'Phase 33 preserves this outcome through OperatorOS identity, tenant, role, entitlement, billing, shared AI provider, metered usage, runtime, legal, or platform-admin authority.'
          : 'Phase 33 restores this source outcome through additive v42 StudyForge persistence, transactional complete-set generation, deterministic and validated AI paths, source-compatible deep links, real learning sessions, quiz history, streaks, countdowns, exports, and the responsive learning workspace.'].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'snapproofos') {
    const nativeTargets = [
      'apps/api/src/lib/snapproofos-db-init.ts',
      'apps/api/src/lib/snapproofos-phase32-db-init.ts',
      'apps/api/src/lib/snapproofos.ts',
      'apps/api/src/lib/snapproofos-exports.ts',
      'apps/api/src/lib/snapproofos-media.ts',
      'apps/api/src/routes/snapproofos-routes.ts',
      'apps/api/src/routes/snapproofos-phase32-routes.ts',
      'apps/web/src/components/module-shells/SnapProofWorkspace.tsx',
      'apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx',
      'apps/web/src/lib/snapproof-offline-queue.ts',
      'apps/web/src/app/public/snapproofos/reports/[token]/page.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/lib/shared-attachments.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/routes/auth-routes.ts',
      'apps/api/src/routes/tenant-admin-routes.ts',
      'apps/api/src/routes/billing-routes.ts',
      'apps/api/src/lib/database-release-contract.ts',
    ];
    const nativeSchemas = ['apps/api/src/lib/snapproofos-db-init.ts','apps/api/src/lib/snapproofos-phase32-db-init.ts'];
    const sharedSchemas = ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts'];
    const uiTargets = ['apps/web/src/app/modules/[slug]/page.tsx','apps/web/src/app/modules/[slug]/[...path]/page.tsx'];
    const evidence = [
      'apps/api/test/snapproofos-domain.test.ts',
      'apps/api/test/snapproofos-db.test.ts',
      'apps/api/test/snapproofos-phase32-domain.test.ts',
      'apps/api/test/snapproofos-phase32-static.test.ts',
      'apps/web/e2e/snapproofos-phase32.spec.ts',
    ];
    const sharedBoundary = /(?:routes\/auth|\/auth\/|\/login|\/register|\/logout|\/profile|routes\/organizations|organization.?settings|team.?member|membership|user.?role|billing|subscription|plan|pricing|entitlement|session.?secret|database.?url|log.?level|node.?env|base.?path|repl.?id|\bport\b|activity)/iu;
    const sharedSchemaBoundary = /^(?:users|organizations|team_members|activity)(?:\.|$)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const sourceText = [capability.title,capability.canonicalSourceIdentity,...capability.sourcePointers].join(' ');
      const shared = capability.type === 'integration'
        || capability.type === 'public_flow'
        || ((capability.type === 'database_table' || capability.type === 'database_column') && sharedSchemaBoundary.test(capability.title))
        || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'ui_page' || capability.type === 'ui_route'
        ? uiTargets
        : capability.type === 'database_table'
          ? (shared ? sharedSchemas : nativeSchemas)
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...(capability.currentTargets || []),...(shared ? sharedTargets : nativeTargets),...typedTargets])].sort(),
        automatedEvidence: [...new Set([...(capability.automatedEvidence || []),...evidence])].sort(),
        note: [capability.note, shared
          ? 'Phase 32 preserves this outcome through OperatorOS identity, tenant, membership, role, entitlement, billing, runtime, shared activity, or private attachment authority.'
          : 'Phase 32 restores this outcome through additive v41 SnapProofOS persistence, source-compatible field workflows, scanned mobile capture, deterministic PDF/DOCX exports, hashed expiring report shares, and the graphite/crimson product workspace. Source raw file URLs and arbitrary branding HTML are represented by signed private retrieval and structured branded templates without erasing the user outcome.'].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'brandforgeos') {
    const nativeTargets = [
      'apps/api/src/lib/brandforgeos-db-init.ts',
      'apps/api/src/lib/brandforgeos-phase31-db-init.ts',
      'apps/api/src/lib/brandforgeos.ts',
      'apps/api/src/routes/brandforgeos-routes.ts',
      'apps/api/src/routes/brandforgeos-phase31-routes.ts',
      'apps/web/src/components/module-shells/BrandForgeWorkspace.tsx',
      'apps/web/src/components/module-shells/BrandForgeCompletePanels.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/ai-provider.ts',
      'apps/api/src/lib/shared-platform-control-plane.ts',
      'apps/api/src/lib/shared-provider-adapters.ts',
      'apps/api/src/lib/shared-background-jobs.ts',
      'apps/api/src/lib/shared-notification-outbox.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
      'apps/api/src/lib/shared-platform-db-init.ts',
      'apps/api/src/lib/database-release-contract.ts',
      'apps/api/src/routes/auth-routes.ts',
      'apps/api/src/routes/billing-routes.ts',
      'apps/api/src/routes/tenant-admin-routes.ts',
    ];
    const nativeSchemas = ['apps/api/src/lib/brandforgeos-db-init.ts','apps/api/src/lib/brandforgeos-phase31-db-init.ts'];
    const sharedSchemas = ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts','apps/api/src/lib/shared-platform-db-init.ts'];
    const uiTargets = ['apps/web/src/app/modules/[slug]/page.tsx','apps/web/src/app/modules/[slug]/[...path]/page.tsx'];
    const evidence = [
      'apps/api/test/brandforgeos-db.test.ts',
      'apps/api/test/brandforgeos-phase31-domain.test.ts',
      'apps/api/test/brandforgeos-phase31-static.test.ts',
      'apps/web/e2e/brandforgeos-phase31.spec.ts',
    ];
    const sharedBoundary = /(?:routes\/auth|\/login|\/register|\/logout|\/session|routes\/tenants|membership|role.?mapping|billing|subscription|plan.?limits|plan.?add.?ons|entitlement|stripe|operatoros|provider|openai|routes\/ai|\/ai\/|integration|oauth|connector|secret|credit|usage|notification|activity|export|job|worker|routes\/admin|feature.?flag|privacy|terms|legal|pricing|health)/iu;
    const sharedSchemaBoundary = /^(?:add_on_purchases|audit_logs|billing_profiles|credit_packs|export_jobs|feature_flags|integrations|invoices|memberships|notifications|sessions|subscriptions|sync_jobs|tenants|usage_records|users)(?:\.|$)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const alreadyActive = capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT';
      const sourceText = [capability.title,capability.canonicalSourceIdentity,...capability.sourcePointers].join(' ');
      const shared = alreadyActive
        ? capability.state === 'ACTIVE_SHARED_EQUIVALENT'
        : capability.type === 'integration' || capability.type === 'background_process' || capability.type === 'public_flow' || capability.type === 'mobile_pwa_surface' || ((capability.type === 'database_table' || capability.type === 'database_column') && sharedSchemaBoundary.test(capability.title)) || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'ui_page' || capability.type === 'ui_route'
        ? uiTargets
        : capability.type === 'database_table'
          ? (shared ? sharedSchemas : nativeSchemas)
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...capability.currentTargets,...(shared?sharedTargets:nativeTargets),...typedTargets])].sort(),
        automatedEvidence: [...new Set([...capability.automatedEvidence,...evidence])].sort(),
        note: [capability.note,!alreadyActive ? (shared
          ? 'Phase 31 restores this outcome through OperatorOS identity, tenant, entitlement, shared AI/provider, audited usage, notification, job, platform-admin, legal, or billing authority.'
          : 'Phase 31 restores this outcome through the tenant-scoped BrandForgeOS API, additive v40 persistence, premium workspace, source-compatible deep links, deterministic scoring, and persisted marketing workflows.') : null].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'ninja-pool-hall') {
    const nativeTargets = [
      'apps/api/src/lib/ninja-pool-game.ts',
      'apps/api/src/lib/ninja-pool-physics.ts',
      'apps/api/src/lib/ninja-pool-rules.ts',
      'apps/api/src/lib/ninja-pool-match.ts',
      'apps/api/src/lib/ninja-pool-online.ts',
      'apps/api/src/lib/ninja-pool-hall-db-init.ts',
      'apps/api/src/lib/ninja-pool-online-db-init.ts',
      'apps/api/src/routes/ninja-pool-hall-routes.ts',
      'apps/api/src/routes/ninja-pool-online-routes.ts',
      'apps/web/src/lib/ninja-pool-hall/physics.ts',
      'apps/web/src/lib/ninja-pool-hall/rules.ts',
      'apps/web/src/lib/ninja-pool-hall/bot.ts',
      'apps/web/src/lib/ninja-pool-hall/network.ts',
      'apps/web/src/lib/ninja-pool-hall/online.ts',
      'apps/web/src/components/module-shells/NinjaPoolHallPractice.tsx',
      'apps/web/src/components/module-shells/NinjaPoolHallMatch.tsx',
      'apps/web/src/components/module-shells/NinjaPoolHallOnline.tsx',
      'apps/web/src/components/module-shells/NinjaPoolHallShell.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/auth.ts',
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/database-release-contract.ts',
      'apps/web/src/app/ninja-pool-hall.webmanifest/route.ts',
      'apps/web/public/ninja-pool-hall-sw.js',
      'packages/sdk/src/catalog.ts',
    ];
    const evidence = [
      'apps/api/test/ninja-pool-physics.test.ts',
      'apps/api/test/ninja-pool-rules.test.ts',
      'apps/api/test/ninja-pool-phase30-domain.test.ts',
      'apps/api/test/ninja-pool-online-db.test.ts',
      'apps/api/test/ninja-pool-phase10b-contract.test.ts',
      'apps/web/e2e/ninja-pool-hall-phase30.spec.ts',
    ];
    const sharedBoundary = /(?:auth|login|logout|session|tenant|identity|user|account|entitlement|billing|cors|health|operatoros|pwa|manifest|service.?worker|install)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const sourceText = [capability.title, capability.canonicalSourceIdentity, ...capability.sourcePointers].join(' ');
      const shared = capability.state === 'ACTIVE_SHARED_EQUIVALENT' || sharedBoundary.test(sourceText);
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...capability.currentTargets, ...(shared ? sharedTargets : nativeTargets)])].sort(),
        automatedEvidence: [...new Set([...capability.automatedEvidence, ...evidence])].sort(),
        note: [capability.note, shared
          ? 'Phase 30 restores this outcome through OperatorOS-owned identity, tenant, entitlement, exact-host routing, release, or installable web authority.'
          : 'Phase 30 restores this outcome through the deterministic Canvas engine, complete 8-ball rules, seeded CPU play, local hot-seat, or durable host-authoritative online room workflow with independent server re-simulation.'].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'torqueshed') {
    const nativeTargets = [
      'apps/api/src/lib/torqueshed-db-init.ts',
      'apps/api/src/lib/torqueshed-web-api-db-init.ts',
      'apps/api/src/routes/torqueshed-routes.ts',
      'apps/api/src/routes/torque-assist-routes.ts',
      'apps/api/src/routes/torqueshed-social-routes.ts',
      'apps/api/src/routes/torqueshed-web-api-routes.ts',
      'apps/web/src/components/module-shells/TorqueShedWorkspace.tsx',
      'apps/web/src/components/module-shells/TorqueShedSocialPanels.tsx',
      'apps/web/src/components/module-shells/TorqueShedRestorationPanels.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/tenant-auth.ts',
      'apps/api/src/lib/shared-provider-adapters.ts',
      'apps/api/src/lib/shared-attachments.ts',
      'apps/api/src/lib/shared-schedules-exports.ts',
      'apps/api/src/lib/shared-usage-activity.ts',
      'apps/api/src/lib/torqueshed-product-export.ts',
      'apps/web/public/torqueshed-sw.js',
      'apps/web/src/app/torqueshed.webmanifest/route.ts',
    ];
    const nativeSchemas = ['apps/api/src/lib/torqueshed-db-init.ts','apps/api/src/lib/torqueshed-web-api-db-init.ts'];
    const sharedSchemas = ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-services-db-init.ts','apps/api/src/lib/shared-platform-db-init.ts'];
    const uiTargets = ['apps/web/src/app/modules/[slug]/page.tsx','apps/web/src/app/modules/[slug]/[...path]/page.tsx'];
    const evidence = [
      'apps/api/test/torqueshed-foundation-workflow.test.ts',
      'apps/api/test/torque-assist-workflow.test.ts',
      'apps/api/test/torqueshed-social-workflow.test.ts',
      'apps/api/test/torqueshed-web-api-product.test.ts',
      'apps/api/test/torqueshed-web-api-static.test.ts',
      'apps/web/e2e/torqueshed-phase28.spec.ts',
    ];
    const sharedBoundary = /(?:auth|login|register|logout|session|tenant|org|membership|role|identity|user|account|billing|subscription|entitlement|stripe|operatoros|provider|ai|openai|torque.?assist|token|usage|attachment|media|upload|image|storage|scan|notification|export|pwa|mobile|expo|background|worker|health|well-known)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const alreadyActive = capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT';
      const sourceText = [capability.title,capability.canonicalSourceIdentity,...capability.sourcePointers].join(' ');
      const shared = alreadyActive
        ? capability.state === 'ACTIVE_SHARED_EQUIVALENT'
        : capability.type === 'integration' || capability.type === 'background_process' || capability.type === 'mobile_product' || capability.type === 'mobile_pwa_surface' || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'ui_page' || capability.type === 'ui_route'
        ? uiTargets
        : capability.type === 'database_table'
          ? (shared ? sharedSchemas : nativeSchemas)
          : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...capability.currentTargets,...(shared?sharedTargets:nativeTargets),...typedTargets])].sort(),
        automatedEvidence: [...new Set([...capability.automatedEvidence,...evidence])].sort(),
        note: [capability.note,!alreadyActive ? (shared
          ? 'Phase 28 restores this outcome through OperatorOS identity, tenant, entitlement, shared AI, audited usage, media scanning, notifications, exports, or responsive installable web authority.'
          : 'Phase 28 restores this outcome through the tenant-scoped TorqueShed web/API, additive v38 persistence, premium garage shell, source-compatible deep links, durable collaboration, and database-backed acceptance workflow.') : null].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'pulsedesk') {
    const nativeTargets = [
      'apps/api/src/lib/pulsedesk-db-init.ts',
      'apps/api/src/lib/pulsedesk-literal-db-init.ts',
      'apps/api/src/routes/pulsedesk-routes.ts',
      'apps/api/src/routes/pulsedesk-service-desk-routes.ts',
      'apps/api/src/routes/pulsedesk-literal-routes.ts',
      'apps/web/src/components/module-shells/PulseDeskShell.tsx',
      'apps/web/src/components/module-shells/PulseDeskServiceDeskWorkspace.tsx',
      'apps/web/src/components/module-shells/PulseDeskConnectorConsole.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/business-directory.ts',
      'apps/api/src/lib/shared-platform-control-plane.ts',
      'apps/api/src/lib/shared-background-jobs.ts',
      'apps/api/src/lib/shared-notification-outbox.ts',
      'apps/api/src/lib/shared-secret-vault.ts',
      'apps/api/src/routes/pulsedesk-literal-routes.ts',
      'apps/web/src/components/module-shells/PulseDeskConnectorConsole.tsx',
    ];
    const uiTargets = ['apps/web/src/app/modules/[slug]/page.tsx','apps/web/src/app/modules/[slug]/[...path]/page.tsx'];
    const nativeSchemas = ['apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/pulsedesk-db-init.ts','apps/api/src/lib/pulsedesk-literal-db-init.ts'];
    const sharedSchemas = ['apps/api/src/lib/directory-db-init.ts','apps/api/src/lib/saas-db-init.ts','apps/api/src/lib/shared-platform-db-init.ts','apps/api/src/lib/shared-services-db-init.ts'];
    const evidence = ['apps/api/test/pulsedesk-state5-workflow.test.ts','apps/api/test/pulsedesk-literal-product.test.ts','apps/api/test/pulsedesk-literal-static.test.ts','apps/api/test/pulsedesk-service-desk-domain.test.ts'];
    const sharedBoundary = /(?:auth|login|register|logout|session|tenant|orgs?|membership|role.?mapping|invite|billing|subscription|entitlement|operatoros|provider|sendgrid|imap|google|microsoft|entra|oauth|connector|email|mailbox|outbound|worker|poller|seed|database.?release|platform.?legal|privacy|terms|contract|device)/iu;
    return capabilities.filter(capability => capability.missingSourcePointers.length === 0).map(capability => {
      const alreadyActive = capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT';
      const sourceText = [capability.title,capability.canonicalSourceIdentity,...capability.sourcePointers].join(' ');
      const shared = alreadyActive ? capability.state === 'ACTIVE_SHARED_EQUIVALENT' : capability.type === 'integration' || capability.type === 'background_process' || sharedBoundary.test(sourceText);
      const typedTargets = capability.type === 'ui_route' ? uiTargets : capability.type === 'database_table' ? (shared ? sharedSchemas : nativeSchemas) : [];
      return {
        ...capability,
        state: shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set([...capability.currentTargets,...(shared?sharedTargets:nativeTargets),...typedTargets])].sort(),
        automatedEvidence: [...new Set([...capability.automatedEvidence,...evidence])].sort(),
        note: [capability.note,!alreadyActive ? (shared ? 'Phase 27 re-opened this outcome through OperatorOS identity, Directory, encrypted provider configuration, shared jobs, notifications, audit, or privacy controls.' : 'Phase 27 re-opened this outcome through the tenant-scoped PulseDesk healthcare operations API, release v36 persistence, source-compatible shell, public intake, and deterministic acceptance workflow.') : null].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug === 'techdeck') {
    const nativeTargets = [
      'apps/api/src/lib/techdeck-db-init.ts',
      'apps/api/src/lib/techdeck-literal-db-init.ts',
      'apps/api/src/routes/techdeck-routes.ts',
      'apps/api/src/routes/techdeck-literal-routes.ts',
      'apps/web/src/components/module-shells/TechDeckOperations.tsx',
      'apps/web/src/components/module-shells/TechDeckLiteralConsole.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/route-map.ts',
    ];
    const sharedTargets = [
      'apps/api/src/lib/business-directory.ts',
      'apps/api/src/lib/shared-platform-control-plane.ts',
      'apps/api/src/lib/shared-schedules-exports.ts',
      'apps/api/src/lib/shared-outbound-webhooks.ts',
      'apps/api/src/routes/techdeck-literal-routes.ts',
      'apps/web/src/components/module-shells/TechDeckLiteralConsole.tsx',
    ];
    const uiRouteTargets = [
      'apps/web/src/app/modules/[slug]/page.tsx',
      'apps/web/src/app/modules/[slug]/[...path]/page.tsx',
    ];
    const nativeSchemaTargets = [
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/lib/techdeck-db-init.ts',
      'apps/api/src/lib/techdeck-literal-db-init.ts',
    ];
    const sharedSchemaTargets = [
      'apps/api/src/lib/directory-db-init.ts',
      'apps/api/src/lib/saas-db-init.ts',
      'apps/api/src/lib/shared-platform-db-init.ts',
      'apps/api/src/lib/shared-services-db-init.ts',
    ];
    const evidence = [
      'apps/api/test/techdeck-state5-workflow.test.ts',
      'apps/api/test/techdeck-literal-product.test.ts',
      'apps/api/test/techdeck-literal-static.test.ts',
    ];
    const sharedBoundary = /(?:auth|session|tenant|role|identity|user-management|billing|subscription|entitlement|invoice|stripe|operatoros|provider|secret|webhook|recurr|schedule|api.?token|directory|\/clients(?:\/|\b)|\/sites(?:\/|\b)|\/contacts(?:\/|\b)|client[_ -]?portal|account|reviewer|mfa|login|register|logout|csrf|demo|conversation|generate[_ -]?image|usage|invitation)/iu;
    return capabilities
      // The old hand-maintained ledger named an operations route file and two
      // integration tests that do not exist in the pinned source tree. Phase
      // 26 regenerates from the pinned source and does not count those 28
      // duplicate claims as source capabilities.
      .filter((capability) => capability.missingSourcePointers.length === 0)
      .map((capability) => {
        const sourceText = [capability.title, capability.canonicalSourceIdentity, ...capability.sourcePointers].join(' ');
        const alreadyActive = capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT';
        const shared = alreadyActive
          ? capability.state === 'ACTIVE_SHARED_EQUIVALENT'
          : capability.type === 'integration' || capability.type === 'background_process' || sharedBoundary.test(sourceText);
        const state = shared ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE';
        const typedTargets = capability.type === 'ui_route'
          ? uiRouteTargets
          : capability.type === 'database_table'
            ? (shared ? sharedSchemaTargets : nativeSchemaTargets)
            : [];
        return {
          ...capability,
          state,
          blockerCode: null,
          currentTargets: [...new Set([
            ...capability.currentTargets,
            ...(shared ? sharedTargets : nativeTargets),
            ...typedTargets,
          ])].sort(),
          automatedEvidence: [...new Set([...capability.automatedEvidence, ...evidence])].sort(),
          note: [
            capability.note,
            !alreadyActive && shared
              ? 'Phase 26 re-opened this source outcome through the tenant-scoped OperatorOS Directory, identity, entitlement, secret, scheduler, token, webhook, or export control plane.'
              : !alreadyActive
                ? 'Phase 26 re-opened this source outcome through the literal TechDeck API, additive v35 schema, consolidated native shell, source-compatible deep links, and database-backed acceptance workflow.'
                : null,
          ].filter(Boolean).join(' '),
        };
      });
  }
  if (definition.slug === 'faultlinelab') {
    const sharedDomains = [
      {
        id: 'identity',
        pattern: /(?:auth|clerk|sso|session|cookie|login|logout|\bme\b|whoami|account.?identit|account[\/ ._-]?(?:link|unlink)|user_profiles|profile(?:\.tsx|\.ts|\b)|users(?:\.|\b)|role)/iu,
        targets: ['apps/api/src/lib/saas-db-init.ts', 'apps/api/src/routes/auth-routes.ts', 'apps/api/src/routes/sso-routes.ts', 'apps/api/src/lib/tenant-auth.ts'],
        evidence: ['apps/api/test/auth-boundary-contract.test.ts', 'apps/api/test/auth-session-cookie.test.ts', 'apps/api/test/shared-sso-routes.test.ts'],
        note: 'OperatorOS exact-host sessions and SSO replace the child identity provider without importing a second login, identity link, cookie, or test bypass.',
      },
      {
        id: 'billing-catalog',
        pattern: /(?:entitlement|purchase|billing|subscription|renewal|stripe|checkout|portal|invoice|products?\b|pricing|catalog.?override|user_entitlements|purchases)/iu,
        targets: ['apps/api/src/lib/saas-db-init.ts', 'apps/api/src/routes/billing-routes.ts', 'apps/api/src/routes/admin-routes.ts', 'apps/api/src/lib/entitlement-resolver.ts'],
        evidence: ['apps/api/test/admin-stripe-price-id.test.ts', 'apps/api/test/product-entitlement-contract.test.ts', 'apps/api/test/entitlement-resolver.test.ts'],
        note: 'OperatorOS billing, catalog, and entitlement authority preserves the commercial outcome; FaultlineLab cannot own Stripe state or a competing override store.',
      },
      {
        id: 'storage',
        pattern: /(?:storage|object|upload|attachment|private_object|public_object)/iu,
        targets: ['apps/api/src/lib/shared-attachments.ts', 'apps/api/src/routes/shared-service-routes.ts', 'apps/api/src/lib/shared-services-db-init.ts'],
        evidence: ['apps/api/test/shared-service-routes.test.ts', 'apps/api/test/shared-services.test.ts'],
        note: 'Private attachments and bounded download grants replace public child object storage.',
      },
      {
        id: 'notifications',
        pattern: /(?:email|resend|unsubscribe|notification|subscription_renewal_notices)/iu,
        targets: ['apps/api/src/lib/shared-notification-outbox.ts', 'apps/api/src/routes/shared-service-routes.ts', 'apps/api/src/lib/operatoros-messaging-compliance.ts'],
        evidence: ['apps/api/test/shared-services.test.ts', 'apps/api/test/shared-service-routes.test.ts'],
        note: 'Shared outbox delivery and suppression records replace module-local email preferences and provider credentials.',
      },
      {
        id: 'administration',
        pattern: /(?:admin|tenant|membership|cross.?promo|cross_promo|audit|activity)/iu,
        targets: ['apps/api/src/lib/saas-db-init.ts', 'apps/api/src/routes/tenant-admin-routes.ts', 'apps/api/src/routes/platform-routes.ts', 'apps/api/src/lib/shared-usage-activity.ts'],
        evidence: ['apps/api/test/tenant-user-mgmt.test.ts', 'apps/api/test/platform-rbac.test.ts', 'apps/api/test/ecosystem-registry.test.ts'],
        note: 'Tenant administration, audited activity, and ecosystem promotion stay in the OperatorOS control plane.',
      },
      {
        id: 'runtime',
        pattern: /(?:replit|database.?url|\bport\b|health|log_level|node_env|base_path|allow_prod_e2e|e2e_auth|enable_e2e|test_api|test_webhook|test_keep_data)/iu,
        targets: ['.replit', 'scripts/start-unified-runtime.mjs', 'apps/api/src/lib/database-release-contract.ts', 'apps/api/src/routes/os-routes.ts'],
        evidence: ['apps/api/test/replit-unified-runtime.test.ts', 'apps/api/test/database-release-contract.test.ts', 'apps/api/test/production-runtime-verifier.test.ts'],
        note: 'The unified runtime, ordered database release, and fail-closed production verifier replace child-server and E2E-bypass configuration.',
      },
    ];
    const nativeDomains = [
      {
        pattern: /(?:manifest|service.?worker|mobile|pwa|install)/iu,
        targets: ['apps/web/src/app/faultlinelab.webmanifest/route.ts', 'apps/web/public/faultlinelab-sw.js', 'apps/web/src/components/module-shells/FaultlineLabShell.tsx'],
        evidence: ['apps/api/test/module-pwa-restoration-static.test.ts', 'apps/web/e2e/faultlinelab-phase25.spec.ts'],
        note: 'The responsive exact-host FaultlineLab application restores installability without a second runtime.',
      },
      {
        pattern: /(?:asset|\.png|\.svg|\.webp|\.jpg|\.ico|font)/iu,
        targets: ['apps/web/public/app-logos/faultlinelab.png', 'apps/web/public/media/operatoros/module-faultlinelab.png'],
        evidence: ['apps/web/e2e/faultlinelab-phase25.spec.ts'],
        note: 'Reviewed current product imagery replaces the imported asset surface.',
      },
      {
        pattern: /(?:export|download|csv)/iu,
        targets: ['apps/api/src/lib/faultlinelab-service.ts', 'apps/api/src/routes/faultlinelab-routes.ts'],
        evidence: ['apps/api/test/faultlinelab-workflow.test.ts'],
        note: 'Tenant-scoped server exports preserve challenge evidence without exposing foreign records.',
      },
      {
        pattern: /(?:route|page|screen|component|button|dialog|workspace|client|faultline-lab\/src)/iu,
        targets: ['apps/web/src/app/modules/[slug]/[...path]/page.tsx', 'apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx', 'apps/web/src/components/module-shells/FaultlineLabShell.tsx', 'apps/web/src/app/modules/[slug]/[...path]/route-map.ts'],
        evidence: ['apps/web/e2e/faultlinelab-phase25.spec.ts', 'apps/web/e2e/phase50-faultlinelab-routes.spec.ts'],
        note: 'The exact-host product shell restores the source navigation and playable interaction outcome.',
      },
    ];
    return capabilities.map(capability => {
      const alreadyActive = capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT';
      const sourceText = [capability.title, capability.canonicalSourceIdentity, ...capability.sourcePointers].join(' ');
      const sharedDomain = sharedDomains.find(domain => domain.pattern.test(sourceText));
      const nativeDomain = nativeDomains.find(domain => domain.pattern.test(sourceText));
      const domain = sharedDomain ?? nativeDomain ?? {
        targets: ['apps/api/src/lib/faultlinelab-db-init.ts', 'apps/api/src/lib/faultlinelab-domain.ts', 'apps/api/src/lib/faultlinelab-service.ts', 'apps/api/src/routes/faultlinelab-routes.ts'],
        evidence: ['apps/api/test/faultlinelab-domain.test.ts', 'apps/api/test/faultlinelab-workflow.test.ts', 'apps/api/test/faultlinelab-full-catalog.test.ts'],
        note: 'The compiler-derived catalog and tenant-scoped challenge workflow preserve this source outcome with server-authorized scoring and durable evidence.',
      };
      const managedDomain = capability.note?.includes('Phase 25 evidence domain:') || !alreadyActive;
      if (!managedDomain) {
        const typedTarget = capability.type === 'database_table'
          ? 'apps/api/src/lib/faultlinelab-db-init.ts'
          : ['api_endpoint', 'public_flow', 'ui_route'].includes(capability.type)
            ? 'apps/web/src/app/modules/[slug]/[...path]/page.tsx'
            : null;
        return typedTarget
          ? { ...capability, currentTargets: [...new Set([...capability.currentTargets, typedTarget])].sort() }
          : capability;
      }
      const priorNote = (capability.note ?? '').replace(/\s*Phase 25 evidence domain:.*$/u, '').trim();
      return {
        ...capability,
        state: sharedDomain ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [...new Set(domain.targets)].sort(),
        automatedEvidence: [...new Set(domain.evidence)].sort(),
        note: [priorNote, `Phase 25 evidence domain: ${domain.note}`].filter(Boolean).join(' '),
      };
    });
  }
  if (definition.slug !== 'tradeflowkit') return capabilities;
  const sharedDomains = [
    {
      id: 'mfa',
      pattern: /(?:twoFactor\.ts|two.?factor|2fa|user_recovery_codes|totp|recovery.?code)/iu,
      targets: ['apps/api/src/lib/auth-mfa-db-init.ts', 'apps/api/src/lib/auth-mfa.ts', 'apps/api/src/routes/auth-routes.ts', 'apps/web/src/components/pages/LoginPage.tsx', 'apps/web/src/components/pages/SettingsPage.tsx'],
      evidence: ['apps/api/test/auth-mfa.test.ts', 'apps/api/test/auth-mfa-static.test.ts'],
      note: 'OperatorOS now owns encrypted TOTP enrollment, one-time login challenges, recovery-code consumption, settings, and invitation sign-in.',
    },
    {
      id: 'identity',
      pattern: /(?:routes\/auth\.ts|auth\/|login|register|logout|password|session|sso|delete.?account|auth.?profile|users(?:\.|\b))/iu,
      targets: ['apps/api/src/lib/saas-db-init.ts', 'apps/api/src/routes/auth-routes.ts', 'apps/api/src/routes/sso-routes.ts', 'apps/api/src/lib/auth.ts', 'apps/web/src/components/pages/LoginPage.tsx', 'apps/web/src/components/pages/SettingsPage.tsx'],
      evidence: ['apps/api/test/auth-security.test.ts', 'apps/api/test/auth-session-cookie.test.ts', 'apps/api/test/platform-tenant-hard-delete.test.ts'],
      note: 'Central host-only sessions, account settings, password rotation, and retained-audit deletion replace module-local identity.',
    },
    {
      id: 'tenant-admin',
      pattern: /(?:routes\/(?:orgs|admin)\.ts|orgs(?:\.|\b)|memberships|invite_codes|organization|switch.?org|tenant|team.?invite|admin.?user)/iu,
      targets: ['apps/api/src/lib/saas-db-init.ts', 'apps/api/src/routes/tenant-admin-routes.ts', 'apps/api/src/routes/tenant-routes.ts', 'apps/api/src/routes/platform-routes.ts', 'apps/api/src/lib/tenant-auth.ts'],
      evidence: ['apps/api/test/tenant-user-mgmt.test.ts', 'apps/api/test/tenant-invites.test.ts', 'apps/api/test/tenant-rbac.test.ts'],
      note: 'OperatorOS tenant membership, explicit invitation consent, role enforcement, and platform administration replace child organization authority.',
    },
    {
      id: 'outcall',
      pattern: /(?:call.?recovery|missed.?call|twilio|sms.?consent)/iu,
      targets: ['apps/api/src/lib/outcall.ts', 'apps/api/src/lib/outcall-db-init.ts', 'apps/api/src/routes/outcall-routes.ts', 'apps/web/src/components/module-shells/OutCallWorkspace.tsx'],
      evidence: ['apps/api/test/outcall-adapter.test.ts', 'apps/api/test/outcall-phase50-routes.test.ts', 'apps/api/test/outcall-provider.test.ts'],
      note: 'The tenant-scoped OutCall reconstruction preserves recovery requests and provider-locked telephony without duplicating credentials in TradeFlowKit.',
    },
    {
      id: 'billing',
      pattern: /(?:subscriptions\.ts|processed_stripe_events|stripe|billing|checkout|subscription|plan.?info|create.?portal)/iu,
      targets: ['apps/api/src/lib/saas-db-init.ts', 'apps/api/src/routes/billing-routes.ts', 'apps/api/src/lib/entitlement-resolver.ts', 'packages/sdk/src/catalog.ts'],
      evidence: ['apps/api/test/billing-resync.test.ts', 'apps/api/test/admin-stripe-price-id.test.ts', 'apps/api/test/product-entitlement-contract.test.ts'],
      note: 'OperatorOS billing and entitlement state replace child Stripe plans, checkout, portal, and webhook authority.',
    },
    {
      id: 'shared-operations',
      pattern: /(?:automations?\.ts|org_automations|reminder_log|audit.?log|notification|attachment|review.?request)/iu,
      targets: ['apps/api/src/lib/shared-services-db-init.ts', 'apps/api/src/lib/shared-background-jobs.ts', 'apps/api/src/lib/shared-notification-outbox.ts', 'apps/api/src/routes/shared-service-routes.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      evidence: ['apps/api/test/shared-services.test.ts', 'apps/api/test/shared-service-routes.test.ts', 'apps/api/test/tradeflowkit-lead-messaging.test.ts'],
      note: 'Shared jobs, outbox delivery, attachment grants, activity evidence, and TradeFlowKit entity messaging preserve the operational outcome.',
    },
    {
      id: 'entitlement-sync',
      pattern: /(?:operatoros\.ts|entitlements\.ts|operatoros\/|entitlement|sync)/iu,
      targets: ['apps/api/src/routes/entitlement-routes.ts', 'apps/api/src/lib/entitlement-resolver.ts', 'apps/api/src/lib/entitlement-adapters.ts'],
      evidence: ['apps/api/test/entitlement-resolver.test.ts', 'apps/api/test/entitlement-sync.test.ts'],
      note: 'The in-process OperatorOS entitlement resolver replaces bearer-token synchronization to a standalone child server.',
    },
    {
      id: 'providers',
      pattern: /(?:openai|sendgrid|provider|ai_messages|email|sms|twilio)/iu,
      targets: ['apps/api/src/lib/shared-services-db-init.ts', 'apps/api/src/lib/shared-provider-adapters.ts', 'apps/api/src/lib/shared-notification-outbox.ts', 'apps/api/src/lib/tradeflowkit-lead-operations.ts', 'apps/api/src/routes/tradeflowkit-lead-operations-routes.ts'],
      evidence: ['apps/api/test/shared-services.test.ts', 'apps/api/test/tradeflowkit-lead-messaging.test.ts'],
      note: 'Server-only provider configuration and the shared outbox replace child environment credentials and direct delivery calls.',
    },
    {
      id: 'public-platform',
      pattern: /(?:wellKnown\.ts|assetlinks|\/privacy|\/terms|security|\.well-known)/iu,
      targets: ['apps/web/src/app/.well-known/assetlinks.json/route.ts', 'apps/web/src/app/privacy/page.tsx', 'apps/web/src/app/terms/page.tsx'],
      evidence: ['apps/api/test/module-pwa-restoration-static.test.ts', 'apps/api/test/marketing-shell.test.ts'],
      note: 'OperatorOS exact-host association and platform legal surfaces replace duplicated child public pages.',
    },
  ];
  const nativeDomains = [
    {
      pattern: /(?:manifest|service.?worker|mobile|pwa|install)/iu,
      targets: ['apps/web/src/app/tradeflowkit.webmanifest/route.ts', 'apps/web/public/tradeflowkit-sw.js', 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'],
      evidence: ['apps/api/test/module-pwa-restoration-static.test.ts', 'apps/web/e2e/tradeflowkit-phase23-visual.spec.ts'],
      note: 'The responsive exact-host application restores safe installability.',
    },
    {
      pattern: /(?:asset|\.png|\.svg|\.webp|\.jpg|\.ico|font)/iu,
      targets: ['apps/web/public/app-logos/tradeflowkit.png', 'apps/web/public/brand/tradeflowkit-logo.png', 'apps/web/public/media/operatoros/module-tradeflowkit.png'],
      evidence: ['apps/web/e2e/tradeflowkit-phase23-visual.spec.ts'],
      note: 'Reviewed current TradeFlowKit imagery preserves the product identity.',
    },
    {
      pattern: /(?:lead|followup|capture.?form)/iu,
      targets: ['apps/api/src/lib/tradeflowkit-lead-operations-db-init.ts', 'apps/api/src/lib/tradeflowkit-lead-operations.ts', 'apps/api/src/routes/tradeflowkit-lead-operations-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitLeadOperations.tsx'],
      evidence: ['apps/api/test/tradeflowkit-lead-operations.test.ts', 'apps/api/test/tradeflowkit-lead-messaging.test.ts'],
      note: 'Tenant-scoped lead capture, follow-up, messaging, and conversion preserve the source lead outcome.',
    },
    {
      pattern: /(?:invoice|quote|payment|revenue|accounting|xero|quickbooks)/iu,
      targets: ['apps/api/src/lib/tradeflowkit-db-init.ts', 'apps/api/src/routes/tradeflowkit-routes.ts', 'apps/api/src/lib/tradeflowkit-revenue.ts', 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx'],
      evidence: ['apps/api/test/tradeflowkit-revenue-flow.test.ts', 'apps/api/test/tradeflowkit-accounting-exports.test.ts', 'apps/api/test/tradeflowkit-stripe-settlement.test.ts'],
      note: 'Quote-to-invoice-to-payment persistence and accounting exports preserve the revenue-flow outcome.',
    },
    {
      pattern: /(?:job|task|workflow|recurring|schedule)/iu,
      targets: ['apps/api/src/lib/tradeflowkit-db-init.ts', 'apps/api/src/routes/tradeflowkit-routes.ts', 'apps/api/src/routes/tradeflowkit-recurring-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitWorkManagement.tsx'],
      evidence: ['apps/api/test/tradeflowkit-work-management.test.ts', 'apps/api/test/tradeflowkit-recurring-jobs.test.ts'],
      note: 'Persisted work management, workflow transitions, dependencies, and recurring schedules preserve this source outcome.',
    },
    {
      pattern: /(?:customer|contact|business.?directory)/iu,
      targets: ['apps/api/src/lib/directory-db-init.ts', 'apps/api/src/routes/tradeflowkit-routes.ts', 'apps/api/src/lib/business-directory.ts', 'apps/web/src/components/module-shells/BusinessDirectory.tsx'],
      evidence: ['apps/api/test/tradeflowkit-state5-workflow.test.ts', 'apps/api/test/business-directory.test.ts'],
      note: 'Tenant-scoped customers and the shared business directory preserve contact outcomes.',
    },
    {
      pattern: /(?:import|export|csv|retention|trash|bulk|saved.?view|search)/iu,
      targets: ['apps/api/src/lib/tradeflowkit-db-init.ts', 'apps/api/src/lib/tradeflowkit-import-apply.ts', 'apps/api/src/lib/tradeflowkit-bulk-operations.ts', 'apps/api/src/routes/tradeflowkit-routes.ts'],
      evidence: ['apps/api/test/tradeflowkit-record-imports.test.ts', 'apps/api/test/tradeflowkit-safe-bulk-operations.test.ts', 'apps/api/test/tradeflowkit-global-search.test.ts'],
      note: 'Validated imports, safe bulk mutation, search, saved views, retention, and restore preserve the data-operations outcome.',
    },
    {
      pattern: /(?:portal|public|intake)/iu,
      targets: ['apps/api/src/lib/tradeflowkit-public-operations-db-init.ts', 'apps/api/src/routes/tradeflowkit-public-intake-routes.ts', 'apps/api/src/lib/tradeflowkit-public-intake.ts', 'apps/web/src/app/public/tradeflowkit/[documentType]/[token]/page.tsx'],
      evidence: ['apps/api/test/tradeflowkit-public-intake.test.ts', 'apps/api/test/tradeflowkit-state5-workflow.test.ts'],
      note: 'Opaque public tokens and rate-limited intake preserve the external customer workflow.',
    },
    {
      pattern: /(?:route|page|screen|component|button|dialog|client\/src|\.tsx)/iu,
      targets: ['apps/web/src/app/modules/[slug]/[...path]/page.tsx', 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx', 'apps/web/src/app/modules/[slug]/[...path]/route-map.ts', 'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx'],
      evidence: ['apps/web/e2e/tradeflowkit-core-crud.spec.ts', 'apps/web/e2e/tradeflowkit-phase23-visual.spec.ts'],
      note: 'The exact-host TradeFlowKit shell restores the source navigation and rendered interaction outcome.',
    },
  ];
  const recurringOutcomeTitles = new Set([
    '/jobs?status=scheduled',
    'Recurring',
    'jobs.isRecurring',
    'jobs.recurringFrequency',
    'jobs.recurringSeriesId',
    'jobs.scheduledStart',
    'jobs.scheduledEnd',
  ]);
  return capabilities.map((capability) => {
    let mapped = capability;
    if (recurringOutcomeTitles.has(capability.title)) {
      mapped = {
        ...capability,
        state: 'ACTIVE_NATIVE',
        blockerCode: null,
        currentTargets: [
          'apps/api/src/lib/shared-schedules-exports.ts',
          'apps/api/src/routes/tradeflowkit-recurring-routes.ts',
          'apps/api/src/schema.ts',
          'apps/web/src/components/module-shells/TradeFlowKitWorkManagement.tsx',
        ],
        automatedEvidence: [
          'apps/api/test/tradeflowkit-recurring-jobs.test.ts',
        ],
        note: 'Phase 24 restores recurring job creation through the typed shared scheduler. The TradeFlowKit adapter preserves due times, recurrence, series identity, scheduled start/end, tenant scope, audit, idempotent replay, optimistic updates, and an accessible persisted management surface.',
      };
    }

    const alreadyActive = mapped.state === 'ACTIVE_NATIVE' || mapped.state === 'ACTIVE_SHARED_EQUIVALENT';
    const sourceText = [mapped.title, mapped.canonicalSourceIdentity, ...mapped.sourcePointers].join(' ');
    const sharedDomain = sharedDomains.find(domain => domain.pattern.test(sourceText));
    const nativeDomain = nativeDomains.find(domain => domain.pattern.test(sourceText));
    const domain = sharedDomain ?? nativeDomain ?? {
      targets: ['apps/api/src/lib/tradeflowkit-db-init.ts', 'apps/api/src/routes/tradeflowkit-routes.ts', 'apps/web/src/components/module-shells/TradeFlowKitOperations.tsx'],
      evidence: ['apps/api/test/tradeflowkit-state5-workflow.test.ts', 'apps/api/test/tradeflowkit-document-mutations.test.ts'],
      note: 'The tenant-scoped persisted TradeFlowKit workflow preserves this source outcome.',
    };
    const managedDomain = mapped.note?.includes('Phase 24 evidence domain:') || !alreadyActive;
    if (!managedDomain) {
      const typedTarget = mapped.type === 'database_table'
        ? 'apps/api/src/lib/tradeflowkit-db-init.ts'
        : mapped.type === 'public_flow'
          ? 'apps/web/src/app/public/tradeflowkit/[documentType]/[token]/page.tsx'
          : mapped.type === 'ui_route'
            ? 'apps/web/src/app/modules/[slug]/[...path]/page.tsx'
            : mapped.type === 'api_endpoint'
              ? 'apps/api/src/routes/tradeflowkit-routes.ts'
              : null;
      return typedTarget
        ? { ...mapped, currentTargets: [...new Set([...mapped.currentTargets, typedTarget])].sort() }
        : mapped;
    }
    const priorNote = (mapped.note ?? '').replace(/\s*Phase 24 evidence domain:.*$/u, '').trim();
    return {
      ...mapped,
      state: sharedDomain ? 'ACTIVE_SHARED_EQUIVALENT' : 'ACTIVE_NATIVE',
      blockerCode: null,
      currentTargets: [...new Set(domain.targets)].sort(),
      automatedEvidence: [...new Set(domain.evidence)].sort(),
      note: [priorNote, `Phase 24 evidence domain: ${domain.note}`].filter(Boolean).join(' '),
    };
  });
}

function readWaivers() {
  const failures = [];
  let data;
  try {
    data = JSON.parse(readFileSync(waiversPath, 'utf8'));
  } catch (error) {
    return { data: null, failures: [`OWNER_WAIVERS.yml must be strict JSON-compatible YAML: ${error.message}`] };
  }
  const topLevel = Object.keys(data).sort();
  const expectedTopLevel = ['$schema', 'schemaVersion', 'waivers'].sort();
  if (JSON.stringify(topLevel) !== JSON.stringify(expectedTopLevel)) failures.push('OWNER_WAIVERS.yml has unknown or missing top-level fields');
  if (data.schemaVersion !== 1) failures.push('OWNER_WAIVERS.yml schemaVersion must equal 1');
  if (!Array.isArray(data.waivers)) failures.push('OWNER_WAIVERS.yml waivers must be an array');
  const ids = new Set();
  const required = [
    'waiverId', 'capabilityIds', 'lostUserOutcomes', 'rationale', 'securityConsequences',
    'architectureConsequences', 'approvedBy', 'approvedAt', 'expiresAt', 'approvalEvidence',
  ].sort();
  for (const waiver of data.waivers ?? []) {
    const fields = Object.keys(waiver).sort();
    if (JSON.stringify(fields) !== JSON.stringify(required)) failures.push(`waiver ${waiver.waiverId ?? '<missing>'} has unknown or missing fields`);
    if (!/^OW-[0-9]{4}-[0-9]{3}$/u.test(waiver.waiverId ?? '')) failures.push(`invalid waiverId ${waiver.waiverId ?? '<missing>'}`);
    if (ids.has(waiver.waiverId)) failures.push(`duplicate waiverId ${waiver.waiverId}`);
    ids.add(waiver.waiverId);
    if (!Array.isArray(waiver.capabilityIds) || waiver.capabilityIds.length === 0) failures.push(`${waiver.waiverId}: capabilityIds must be non-empty`);
    if (Array.isArray(waiver.capabilityIds) && new Set(waiver.capabilityIds).size !== waiver.capabilityIds.length) failures.push(`${waiver.waiverId}: capabilityIds must be unique`);
    for (const field of ['lostUserOutcomes', 'rationale', 'securityConsequences', 'architectureConsequences', 'approvedBy', 'approvedAt', 'approvalEvidence']) {
      if (typeof waiver[field] !== 'string' || waiver[field].trim().length === 0) failures.push(`${waiver.waiverId}: ${field} is required`);
    }
    if (typeof waiver.approvedAt === 'string' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(waiver.approvedAt) || Number.isNaN(Date.parse(waiver.approvedAt)))) failures.push(`${waiver.waiverId}: approvedAt must be an ISO date-time`);
    if (waiver.expiresAt !== null && (typeof waiver.expiresAt !== 'string' || waiver.expiresAt.trim().length === 0)) failures.push(`${waiver.waiverId}: expiresAt must be null or an ISO date string`);
    if (typeof waiver.expiresAt === 'string' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(waiver.expiresAt) || Number.isNaN(Date.parse(waiver.expiresAt)))) failures.push(`${waiver.waiverId}: expiresAt must be an ISO date-time`);
  }
  return { data, failures };
}

function validateModule(moduleDocument, waivers) {
  const failures = [];
  const ids = new Set();
  const waiverByCapability = new Map();
  for (const waiver of waivers.waivers ?? []) {
    for (const capabilityId of waiver.capabilityIds) {
      if (waiverByCapability.has(capabilityId)) failures.push(`${capabilityId}: multiple owner waivers`);
      waiverByCapability.set(capabilityId, waiver.waiverId);
    }
  }
  for (const capability of moduleDocument.capabilities) {
    if (ids.has(capability.capabilityId)) failures.push(`${capability.capabilityId}: duplicate capability ID`);
    ids.add(capability.capabilityId);
    if (!allowedStates.has(capability.state)) failures.push(`${capability.capabilityId}: invalid state ${capability.state}`);
    if (!capability.canonicalSourceIdentity || !capability.type || !capability.title) failures.push(`${capability.capabilityId}: incomplete source identity`);
    if (capability.sourcePointers.length === 0) failures.push(`${capability.capabilityId}: missing source pointer`);
    for (const pointer of capability.sourcePointers) {
      if (!existsSync(join(root, pointer))) failures.push(`${capability.capabilityId}: missing source pointer ${pointer}`);
    }
    for (const pointer of capability.missingSourcePointers) {
      if (existsSync(join(root, pointer))) failures.push(`${capability.capabilityId}: stale missing-source annotation ${pointer}`);
    }
    for (const pointer of capability.currentTargets) {
      if (!existsSync(join(root, pointer))) failures.push(`${capability.capabilityId}: missing current target ${pointer}`);
    }
    for (const pointer of capability.automatedEvidence) {
      if (!existsSync(join(root, pointer))) failures.push(`${capability.capabilityId}: missing automated evidence ${pointer}`);
    }
    if (capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT') {
      if (capability.currentTargets.length === 0) failures.push(`${capability.capabilityId}: active capability lacks a current target`);
      if (capability.automatedEvidence.length === 0) failures.push(`${capability.capabilityId}: active capability lacks automated evidence`);
    }
    if (capability.state === 'BLOCKED' && !capability.blockerCode) failures.push(`${capability.capabilityId}: blocked capability lacks blockerCode`);
    if (capability.state === 'OWNER_WAIVED') {
      const waiverId = waiverByCapability.get(capability.capabilityId);
      if (!waiverId || waiverId !== capability.ownerWaiverId) failures.push(`${capability.capabilityId}: OWNER_WAIVED lacks an exact approved waiver`);
    } else if (capability.ownerWaiverId) {
      failures.push(`${capability.capabilityId}: non-waived capability carries ownerWaiverId`);
    }
  }
  return failures;
}

function stableDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function writeGeneratedArtifact(path, contents) {
  const retrySignal = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      writeFileSync(path, contents, 'utf8');
      return;
    } catch (error) {
      if (attempt === 5 || !['EBUSY', 'EPERM', 'UNKNOWN'].includes(error?.code)) throw error;
      Atomics.wait(retrySignal, 0, 0, attempt * 25);
    }
  }
}

function compareOrWrite(path, document, failures) {
  const expected = stableDocument(document);
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeGeneratedArtifact(path, expected);
    return;
  }
  if (!existsSync(path)) {
    failures.push(`missing generated artifact ${repoPath(path)}`);
    return;
  }
  const current = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  if (current !== expected) failures.push(`stale generated artifact ${repoPath(path)}; run corepack pnpm parity:write`);
}

const waiverResult = readWaivers();
const failures = [...waiverResult.failures];
const waiverData = waiverResult.data ?? { waivers: [] };
const waiverByCapability = new Map();
for (const waiver of waiverData.waivers ?? []) {
  for (const capabilityId of waiver.capabilityIds) waiverByCapability.set(capabilityId, waiver);
}
const moduleDocuments = [];

for (const definition of sourceDefinitions) {
  const sourceRoot = join(root, 'apps', 'modules', definition.slug, 'source');
  if (!existsSync(sourceRoot)) {
    failures.push(`${definition.slug}: missing source directory`);
    continue;
  }
  const capabilities = applyCurrentRestorationMappings(definition, [
    ...legacyCapabilities(definition),
    ...discoverRawCapabilities(definition, sourceRoot),
    ...specialCapabilities(definition, sourceRoot),
  ]).sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  const uniqueCapabilities = [...new Map(capabilities.map((capability) => [capability.capabilityId, capability])).values()]
    .map((capability) => {
      const waiver = waiverByCapability.get(capability.capabilityId);
      if (!waiver) return capability;
      return {
        ...capability,
        state: 'OWNER_WAIVED',
        blockerCode: null,
        ownerWaiverId: waiver.waiverId,
        note: [capability.note, `Explicit owner waiver: ${waiver.waiverId}.`].filter(Boolean).join(' '),
      };
    });
  const fingerprint = sourceFingerprint(sourceRoot);
  const moduleDocument = {
    schemaVersion: 1,
    generatedBy: generatorPath,
    moduleSlug: definition.slug,
    moduleName: definition.name,
    sourceRoot: `apps/modules/${definition.slug}/source`,
    provenance: definition.provenance,
    sourceFingerprint: fingerprint,
    stateCounts: stateCounts(uniqueCapabilities),
    typeCounts: typeCounts(uniqueCapabilities),
    capabilityDigestSha256: sha256(JSON.stringify(uniqueCapabilities)),
    capabilities: uniqueCapabilities,
  };
  failures.push(...validateModule(moduleDocument, waiverData));
  moduleDocuments.push(moduleDocument);
  compareOrWrite(join(moduleOutputRoot, `${definition.slug}.json`), moduleDocument, failures);
}

const allCapabilities = moduleDocuments.flatMap((module) => module.capabilities);
const manifest = {
  schemaVersion: 1,
  generatedBy: generatorPath,
  stateModel: [...allowedStates],
  blockedReviewRule: 'retired_security, retired_product_boundary, planned and undocumented exclusions map to BLOCKED unless an exact owner waiver exists; BLOCKED_REVIEW is used unless a stricter evidence/provenance blocker applies',
  missingSourcePointerRule: 'a legacy-ledger implementation path absent from the pinned imported source tree is preserved in missingSourcePointers and forced to BLOCKED plus blockerCode=SOURCE_IMPLEMENTATION_POINTER_MISSING',
  ownerWaivers: {
    path: 'docs/parity/OWNER_WAIVERS.yml',
    count: waiverData.waivers?.length ?? 0,
    implicitWaivers: 0,
  },
  totals: {
    modules: moduleDocuments.length,
    capabilities: allCapabilities.length,
    stateCounts: stateCounts(allCapabilities),
    typeCounts: typeCounts(allCapabilities),
    unclassified: allCapabilities.filter((capability) => !allowedStates.has(capability.state)).length,
  },
  modules: moduleDocuments.map((module) => ({
    moduleSlug: module.moduleSlug,
    moduleName: module.moduleName,
    ledger: `docs/parity/modules/${module.moduleSlug}.json`,
    sourceRoot: module.sourceRoot,
    provenance: module.provenance,
    sourceFingerprint: module.sourceFingerprint,
    capabilityDigestSha256: module.capabilityDigestSha256,
    stateCounts: module.stateCounts,
    typeCounts: module.typeCounts,
  })),
};

for (const waiver of waiverData.waivers ?? []) {
  for (const capabilityId of waiver.capabilityIds) {
    if (!allCapabilities.some((capability) => capability.capabilityId === capabilityId)) failures.push(`${waiver.waiverId}: unknown capability ${capabilityId}`);
  }
}
compareOrWrite(sourceManifestPath, manifest, failures);

const result = {
  mode: write ? 'write' : 'check',
  manifest: repoPath(sourceManifestPath),
  modules: manifest.totals.modules,
  capabilities: manifest.totals.capabilities,
  stateCounts: manifest.totals.stateCounts,
  unclassified: manifest.totals.unclassified,
  ownerWaivers: manifest.ownerWaivers.count,
  failures: failures.length,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
}
