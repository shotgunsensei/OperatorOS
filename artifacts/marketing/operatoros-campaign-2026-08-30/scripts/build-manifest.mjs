import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const campaignDir = path.resolve(scriptDir, '..');
const manifestPath = path.join(campaignDir, 'manifest.json');
const ffprobe = process.argv.find((arg) => arg.startsWith('--ffprobe='))?.slice('--ffprobe='.length)
  || process.env.FFPROBE_PATH;

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (absolute !== manifestPath) files.push(absolute);
  }
  return files;
};

const sha256 = async (file) => {
  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(file));
  return hash.digest('hex').toUpperCase();
};

const probeMedia = (file) => {
  if (!ffprobe || !fsSync.existsSync(ffprobe)) return null;
  const result = spawnSync(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=index,codec_name,codec_type,width,height,r_frame_rate,pix_fmt,sample_rate,channels',
    '-of', 'json', file,
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe failed for ${file}`);
  return JSON.parse(result.stdout);
};

const files = (await walk(campaignDir)).sort((a, b) => a.localeCompare(b));
const entries = [];
for (const file of files) {
  const relative = path.relative(campaignDir, file).replaceAll('\\', '/');
  const ext = path.extname(file).toLowerCase();
  const stat = await fs.stat(file);
  const entry = {
    path: relative,
    bytes: stat.size,
    sha256: await sha256(file),
  };
  if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
    const metadata = await sharp(file).metadata();
    entry.media = {
      type: ext === '.svg' ? 'editable_vector' : 'image',
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
    };
  } else if (['.mp4', '.webm', '.wav'].includes(ext)) {
    entry.media = probeMedia(file);
  }
  entries.push(entry);
}

const count = (predicate) => entries.filter(predicate).length;
const manifest = {
  campaign: 'One Command Layer. Three Operating Tracks.',
  status: 'approval_ready_not_published',
  generatedAt: new Date().toISOString(),
  sourceTruth: {
    repositoryPricing: 'packages/sdk/src/products.ts',
    livePricing: 'https://operatoros.net/pricing',
    releaseAuthority: 'docs/CURRENT_RELEASE_GATE.md',
    verifiedDate: '2026-08-30',
  },
  counts: {
    files: entries.length,
    staticPng: count((entry) => entry.path.startsWith('static/') && entry.path.endsWith('.png')),
    editableSvg: count((entry) => entry.path.startsWith('static/editable/') && entry.path.endsWith('.svg')),
    mp4: count((entry) => entry.path.endsWith('.mp4')),
    webm: count((entry) => entry.path.endsWith('.webm')),
    copyAndGuides: count((entry) => entry.path.startsWith('copy/')),
  },
  files: entries,
};

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest.counts, null, 2));
