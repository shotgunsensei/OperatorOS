import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lockPath = join(repositoryRoot, 'pnpm-lock.yaml');
const outputPath = join(repositoryRoot, 'docs', 'phase-39', 'OPERATOROS-SBOM.cdx.json');

function splitPackageKey(key) {
  const normalized = key.replace(/\([^)]*\)$/g, '');
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0) return null;
  const name = normalized.slice(0, separator);
  const version = normalized.slice(separator + 1);
  if (!name || !version || version.startsWith('link:') || version.startsWith('workspace:')) return null;
  return { name, version };
}

export function compileSbom(lockText = readFileSync(lockPath, 'utf8')) {
  const components = new Map();
  let inPackages = false;
  for (const line of lockText.split(/\r?\n/)) {
    if (line === 'packages:') { inPackages = true; continue; }
    if (line === 'snapshots:') break;
    if (!inPackages) continue;
    const match = line.match(/^  (?:'([^']+)'|([^:\s][^:]*)):\s*$/);
    const parsed = splitPackageKey(match?.[1] ?? match?.[2] ?? '');
    if (!parsed) continue;
    const key = `${parsed.name}@${parsed.version}`;
    components.set(key, {
      type: 'library',
      'bom-ref': `pkg:npm/${encodeURIComponent(parsed.name)}@${encodeURIComponent(parsed.version)}`,
      name: parsed.name,
      version: parsed.version,
      purl: `pkg:npm/${encodeURIComponent(parsed.name)}@${encodeURIComponent(parsed.version)}`,
    });
  }
  const lockHash = createHash('sha256').update(lockText).digest('hex');
  const serial = `${lockHash.slice(0, 8)}-${lockHash.slice(8, 12)}-4${lockHash.slice(13, 16)}-a${lockHash.slice(17, 20)}-${lockHash.slice(20, 32)}`;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${serial}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: 'application', name: 'OperatorOS', version: 'phase-39' },
      properties: [{ name: 'operatoros:pnpm-lock-sha256', value: lockHash }],
    },
    components: [...components.values()].sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref'])),
  };
}

const sbom = compileSbom();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(sbom, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ components: sbom.components.length, output: 'docs/phase-39/OPERATOROS-SBOM.cdx.json' }, null, 2)}\n`);
