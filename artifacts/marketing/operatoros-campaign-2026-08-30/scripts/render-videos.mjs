import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const campaignDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(campaignDir, '..', '..', '..');
const videoDir = path.join(campaignDir, 'video');
const sourceDir = path.join(campaignDir, 'source');
const templatePath = path.join(scriptDir, 'video-ad.html');
const soundtrackPath = path.join(videoDir, 'operatoros-three-tracks-original-score.wav');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const ffmpeg = args.get('ffmpeg') || process.env.FFMPEG_PATH;
if (!ffmpeg || !fsSync.existsSync(ffmpeg)) {
  throw new Error('Set FFMPEG_PATH or pass --ffmpeg=<absolute path> to a full FFmpeg build with H.264 and AAC encoders.');
}

await fs.mkdir(videoDir, { recursive: true });

const pythonCandidates = [
  process.env.CODEX_WORKSPACE_PYTHON,
  'C:\\Users\\John Xodus\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
  'python',
].filter(Boolean);
const python = pythonCandidates.find((candidate) => candidate === 'python' || fsSync.existsSync(candidate));
if (!python) throw new Error('A Python runtime with NumPy is required to render the original soundtrack.');

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: repoDir,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed (${result.status}): ${command} ${commandArgs.join(' ')}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
};

run(python, [path.join(scriptDir, 'render-audio.py'), soundtrackPath, '--duration', '15.2']);

const toDataUri = async (file) => {
  const bytes = await fs.readFile(file);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
};

const replacements = {
  '{{MASTER}}': await toDataUri(path.join(sourceDir, 'three-tracks-command-core.png')),
  '{{NEXUS}}': await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'media', 'operatoros', 'operatoros-command-nexus.png')),
  '{{TRADEFLOWKIT}}': await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'media', 'operatoros', 'module-tradeflowkit.png')),
  '{{PULSEDESK}}': await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'media', 'operatoros', 'module-pulsedesk.png')),
  '{{TECHDECK}}': await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'media', 'operatoros', 'module-techdeck.png')),
  '{{MARK}}': await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'brand', 'operatoros-mark.png')),
};

let html = await fs.readFile(templatePath, 'utf8');
for (const [token, value] of Object.entries(replacements)) html = html.replaceAll(token, value);

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'operatoros-campaign-video-'));
const htmlPath = path.join(tempRoot, 'operatoros-video.html');
const rawDir = path.join(tempRoot, 'raw');
await fs.mkdir(rawDir, { recursive: true });
await fs.writeFile(htmlPath, html, 'utf8');

const formats = [
  { id: 'vertical', width: 1080, height: 1920, suffix: 'vertical-1080x1920' },
  { id: 'square', width: 1080, height: 1080, suffix: 'square-1080x1080' },
  { id: 'landscape', width: 1920, height: 1080, suffix: 'landscape-1920x1080' },
];

const ffmpegVersion = run(ffmpeg, ['-version']).stdout.split(/\r?\n/)[0];
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\John Xodus\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
  'C:\\Users\\John Xodus\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browserExecutable = browserCandidates.find((candidate) => fsSync.existsSync(candidate));
if (!browserExecutable) throw new Error('No compatible Chrome, Chromium, or Edge executable was found.');
const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable,
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--force-device-scale-factor=1',
  ],
});

const outputs = [];
try {
  for (const format of formats) {
    console.log(`Rendering ${format.id} ${format.width}x${format.height}...`);
    const context = await browser.newContext({
      viewport: { width: format.width, height: format.height },
      colorScheme: 'dark',
      deviceScaleFactor: 1,
      recordVideo: {
        dir: rawDir,
        size: { width: format.width, height: format.height },
      },
    });
    const page = await context.newPage();
    const video = page.video();
    const url = `${pathToFileURL(htmlPath).href}?format=${format.id}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__AD_READY__ === true);
    await page.evaluate(() => window.startAd());
    await page.waitForTimeout(15_250);
    await context.close();

    const rawPath = path.join(videoDir, `operatoros-three-tracks-${format.suffix}.webm`);
    await video.saveAs(rawPath);
    const mp4Path = path.join(videoDir, `operatoros-three-tracks-${format.suffix}.mp4`);
    const posterPath = path.join(videoDir, `operatoros-three-tracks-${format.suffix}-poster.png`);

    run(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', rawPath,
      '-i', soundtrackPath,
      '-map', '0:v:0', '-map', '1:a:0',
      '-t', '15.1', '-r', '30',
      '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2',
      '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      mp4Path,
    ]);

    run(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '13.55', '-i', mp4Path,
      '-frames:v', '1', posterPath,
    ]);

    const rawStat = await fs.stat(rawPath);
    const mp4Stat = await fs.stat(mp4Path);
    const posterStat = await fs.stat(posterPath);
    outputs.push({
      format: format.id,
      width: format.width,
      height: format.height,
      webm: { path: rawPath, bytes: rawStat.size },
      mp4: { path: mp4Path, bytes: mp4Stat.size },
      poster: { path: posterPath, bytes: posterStat.size },
    });
  }
} finally {
  await browser.close();
  const resolvedTemp = path.resolve(tempRoot);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  if (resolvedTemp.startsWith(`${resolvedOsTemp}${path.sep}`) && path.basename(resolvedTemp).startsWith('operatoros-campaign-video-')) {
    await fs.rm(resolvedTemp, { recursive: true, force: true });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  renderer: 'Playwright CSS motion graphics + FFmpeg H.264/AAC',
  browserExecutable,
  ffmpegVersion,
  durationSeconds: 15.1,
  framesPerSecond: 30,
  audio: {
    path: soundtrackPath,
    origin: 'Locally generated mathematical waveforms; no samples or third-party music.',
  },
  outputs,
};
await fs.writeFile(path.join(videoDir, 'video-render-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
