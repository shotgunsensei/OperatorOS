import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const campaignDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(campaignDir, '..', '..', '..');
const data = JSON.parse(await fs.readFile(path.join(campaignDir, 'campaign-data.json'), 'utf8'));
const staticDir = path.join(campaignDir, 'static');
const editableDir = path.join(staticDir, 'editable');
const sourceDir = path.join(campaignDir, 'source');

await fs.mkdir(editableDir, { recursive: true });

const palette = {
  bg: '#080B12',
  panel: '#0D1117',
  elevated: '#121826',
  white: '#F8FAFC',
  secondary: '#A7B0C0',
  muted: '#6B7280',
  cyan: '#00C8FF',
  blue: '#078BFF',
  violet: '#1745E8',
  red: '#EF233C',
  green: '#22C55E',
};

const font = "'Segoe UI', Arial, sans-serif";

const toDataUri = async (file) => {
  const bytes = await fs.readFile(file);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
};

const markUri = await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'brand', 'operatoros-mark.png'));
const logoUri = await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'brand', 'operatoros-logo.png'));
const masterUri = await toDataUri(path.join(sourceDir, 'three-tracks-command-core.png'));
const nexusUri = await toDataUri(path.join(repoDir, 'apps', 'web', 'public', 'media', 'operatoros', 'operatoros-command-nexus.png'));
const trackImageUris = Object.fromEntries(
  await Promise.all(data.tracks.map(async (track) => [track.id, await toDataUri(path.join(repoDir, track.image))])),
);

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const defs = (w, h, accent = palette.cyan) => `
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080B12" stop-opacity="0.97"/>
      <stop offset="0.48" stop-color="#080B12" stop-opacity="0.46"/>
      <stop offset="1" stop-color="#080B12" stop-opacity="0.90"/>
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080B12" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#080B12" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#080B12" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${accent}"/>
      <stop offset="1" stop-color="${palette.blue}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="round"><rect width="${w}" height="${h}" rx="0"/></clipPath>
  </defs>`;

const brandLockup = (x, y, size, color = palette.white) => `
  <g transform="translate(${x} ${y})">
    <image href="${markUri}" width="${size}" height="${size}"/>
    <text x="${size + 16}" y="${Math.round(size * 0.61)}" fill="${color}" font-family="${font}" font-size="${Math.round(size * 0.42)}" font-weight="800" letter-spacing="2">OPERATOR<tspan fill="${palette.cyan}">OS</tspan></text>
    <text x="${size + 16}" y="${Math.round(size * 0.86)}" fill="${palette.secondary}" font-family="${font}" font-size="${Math.round(size * 0.18)}" font-weight="600" letter-spacing="3">THE COMMAND LAYER</text>
  </g>`;

const pill = ({ x, y, width, text, accent = palette.cyan, fontSize = 18 }) => `
  <g transform="translate(${x} ${y})">
    <rect width="${width}" height="${fontSize * 2.05}" rx="${fontSize}" fill="#0D1117" fill-opacity="0.88" stroke="${accent}" stroke-opacity="0.65"/>
    <circle cx="${fontSize * 1.05}" cy="${fontSize * 1.02}" r="${fontSize * 0.28}" fill="${accent}"/>
    <text x="${fontSize * 1.65}" y="${fontSize * 1.34}" fill="${palette.white}" font-family="${font}" font-size="${fontSize}" font-weight="750">${esc(text)}</text>
  </g>`;

const cta = (x, y, width, height, label = data.campaign.primaryCta, fontSize = 22) => `
  <g transform="translate(${x} ${y})" filter="url(#shadow)">
    <rect width="${width}" height="${height}" rx="${height / 2}" fill="url(#accentBar)"/>
    <text x="${width / 2}" y="${height * 0.62}" text-anchor="middle" fill="#061016" font-family="${font}" font-size="${fontSize}" font-weight="850">${esc(label)}  →</text>
  </g>`;

const trackCard = (track, x, y, width, height, compact = false) => {
  const titleSize = compact ? 20 : 26;
  const priceSize = compact ? 29 : 40;
  const pad = compact ? 18 : 24;
  return `
    <g transform="translate(${x} ${y})" filter="url(#shadow)">
      <rect width="${width}" height="${height}" rx="22" fill="#0D1117" fill-opacity="0.91" stroke="${track.accent}" stroke-opacity="0.58"/>
      <rect width="7" height="${height}" rx="4" fill="${track.accent}"/>
      <text x="${pad}" y="${pad + 4}" fill="${track.accent}" font-family="${font}" font-size="${compact ? 12 : 14}" font-weight="850" letter-spacing="2">TRACK ${track.number} · ${esc(track.track.toUpperCase())}</text>
      <text x="${pad}" y="${pad + titleSize + 18}" fill="${palette.white}" font-family="${font}" font-size="${titleSize}" font-weight="850">${esc(track.product)}</text>
      <text x="${width - pad}" y="${pad + titleSize + 18}" text-anchor="end" fill="${palette.white}" font-family="${font}" font-size="${priceSize}" font-weight="900">$${track.monthly}<tspan fill="${palette.secondary}" font-size="${compact ? 13 : 16}" font-weight="650">/mo</tspan></text>
      <text x="${pad}" y="${height - pad}" fill="${palette.secondary}" font-family="${font}" font-size="${compact ? 14 : 16}" font-weight="600">${esc(track.shortOutcome)}</text>
    </g>`;
};

const svgShell = (w, h, content, accent = palette.cyan) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${defs(w, h, accent)}
  ${content}
</svg>`;

function overviewSvg(w, h, variant) {
  const isLandscape = w / h > 1.5;
  const isVertical = h / w > 1.45;
  if (isLandscape) {
    const cardGap = 18;
    const cardW = (w - 96 - cardGap * 2) / 3;
    return svgShell(w, h, `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <image href="${masterUri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
      <rect width="${w}" height="${h}" fill="url(#shade)"/>
      <rect y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="url(#bottomShade)"/>
      <ellipse cx="${w * 0.69}" cy="${h * 0.42}" rx="${w * 0.30}" ry="${h * 0.49}" fill="url(#glow)"/>
      ${brandLockup(42, 30, 66)}
      <text x="48" y="170" fill="${palette.cyan}" font-family="${font}" font-size="18" font-weight="850" letter-spacing="4">ONE PLATFORM. YOUR OPERATING TRACK.</text>
      <text x="48" y="232" fill="${palette.white}" font-family="${font}" font-size="58" font-weight="900" letter-spacing="-2">ONE COMMAND LAYER.</text>
      <text x="48" y="292" fill="${palette.white}" font-family="${font}" font-size="58" font-weight="900" letter-spacing="-2">THREE OPERATING TRACKS.</text>
      <text x="50" y="336" fill="${palette.secondary}" font-family="${font}" font-size="21" font-weight="550">Choose the stack built around the way your business actually works.</text>
      ${pill({ x: 48, y: 365, width: 215, text: 'OperatorOS · $0', fontSize: 17 })}
      ${pill({ x: 278, y: 365, width: 244, text: '5 seats included', accent: palette.green, fontSize: 17 })}
      ${cta(w - 286, 358, 238, 54, 'Build Your Stack', 18)}
      ${data.tracks.map((track, index) => trackCard(track, 48 + index * (cardW + cardGap), h - 156, cardW, 122, true)).join('')}
      <text x="${w - 48}" y="${h - 10}" text-anchor="end" fill="${palette.muted}" font-family="${font}" font-size="12">operatoros.net/pricing · Monthly pricing shown · Terms apply</text>
    `);
  }

  if (isVertical) {
    const cardH = Math.round(h * 0.105);
    const gap = Math.round(h * 0.014);
    const cardsY = h - 3 * cardH - 2 * gap - 184;
    return svgShell(w, h, `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <image href="${masterUri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
      <rect width="${w}" height="${h}" fill="url(#shade)"/>
      <rect y="${h * 0.44}" width="${w}" height="${h * 0.56}" fill="url(#bottomShade)"/>
      <ellipse cx="${w * 0.53}" cy="${h * 0.37}" rx="${w * 0.48}" ry="${h * 0.24}" fill="url(#glow)"/>
      ${brandLockup(54, 52, 78)}
      <text x="54" y="218" fill="${palette.cyan}" font-family="${font}" font-size="21" font-weight="850" letter-spacing="4">ONE PLATFORM. YOUR OPERATING TRACK.</text>
      <text x="54" y="294" fill="${palette.white}" font-family="${font}" font-size="64" font-weight="900" letter-spacing="-2">ONE COMMAND</text>
      <text x="54" y="358" fill="${palette.white}" font-family="${font}" font-size="64" font-weight="900" letter-spacing="-2">LAYER.</text>
      <text x="54" y="430" fill="${palette.white}" font-family="${font}" font-size="54" font-weight="900" letter-spacing="-2">THREE TRACKS.</text>
      <text x="56" y="474" fill="${palette.secondary}" font-family="${font}" font-size="22" font-weight="550">Choose the stack built for your operation.</text>
      ${pill({ x: 54, y: 510, width: 262, text: 'OperatorOS · $0', fontSize: 19 })}
      ${pill({ x: 330, y: 510, width: 292, text: '5 seats included', accent: palette.green, fontSize: 19 })}
      ${data.tracks.map((track, index) => trackCard(track, 54, cardsY + index * (cardH + gap), w - 108, cardH, true)).join('')}
      ${cta(54, h - 138, w - 108, 68, 'Build Your Stack', 24)}
      <text x="${w / 2}" y="${h - 32}" text-anchor="middle" fill="${palette.secondary}" font-family="${font}" font-size="18" font-weight="650">operatoros.net/pricing</text>
    `);
  }

  const cardGap = 16;
  const cardW = (w - 80 - cardGap * 2) / 3;
  return svgShell(w, h, `
    <rect width="${w}" height="${h}" fill="${palette.bg}"/>
    <image href="${masterUri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
    <rect width="${w}" height="${h}" fill="url(#shade)"/>
    <rect y="${h * 0.48}" width="${w}" height="${h * 0.52}" fill="url(#bottomShade)"/>
    ${brandLockup(40, 36, 72)}
    <text x="40" y="190" fill="${palette.cyan}" font-family="${font}" font-size="18" font-weight="850" letter-spacing="4">ONE PLATFORM. YOUR OPERATING TRACK.</text>
    <text x="40" y="258" fill="${palette.white}" font-family="${font}" font-size="59" font-weight="900" letter-spacing="-2">ONE COMMAND LAYER.</text>
    <text x="40" y="322" fill="${palette.white}" font-family="${font}" font-size="59" font-weight="900" letter-spacing="-2">THREE TRACKS.</text>
    <text x="42" y="364" fill="${palette.secondary}" font-family="${font}" font-size="21">Choose the stack built for your operation.</text>
    ${pill({ x: 40, y: 397, width: 230, text: 'OperatorOS · $0', fontSize: 18 })}
    ${pill({ x: 282, y: 397, width: 260, text: '5 seats included', accent: palette.green, fontSize: 18 })}
    ${data.tracks.map((track, index) => trackCard(track, 40 + index * (cardW + cardGap), h - 250, cardW, 164, true)).join('')}
    ${cta(w - 338, 394, 298, 54, 'Build Your Stack', 19)}
    <text x="40" y="${h - 31}" fill="${palette.secondary}" font-family="${font}" font-size="17" font-weight="650">operatoros.net/pricing</text>
    <text x="${w - 40}" y="${h - 31}" text-anchor="end" fill="${palette.muted}" font-family="${font}" font-size="12">Monthly pricing shown · Terms apply</text>
  `);
}

function pricingSvg(w, h) {
  const isLandscape = w / h > 1.5;
  if (isLandscape) {
    const left = 46;
    const cardsX = 558;
    const cardW = w - cardsX - 46;
    const cardH = 92;
    const cardGap = 14;
    return svgShell(w, h, `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <image href="${nexusUri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.62"/>
      <rect width="${w}" height="${h}" fill="url(#shade)"/>
      ${brandLockup(left, 28, 64)}
      <text x="${left}" y="158" fill="${palette.cyan}" font-family="${font}" font-size="17" font-weight="850" letter-spacing="3">TRANSPARENT MONTHLY PRICING</text>
      <text x="${left}" y="218" fill="${palette.white}" font-family="${font}" font-size="46" font-weight="900">THE COMMAND LAYER</text>
      <text x="${left}" y="268" fill="${palette.white}" font-family="${font}" font-size="46" font-weight="900">STARTS AT <tspan fill="${palette.cyan}">$0</tspan>.</text>
      <text x="${left}" y="314" fill="${palette.secondary}" font-family="${font}" font-size="20">Then choose the operating track your business needs.</text>
      ${pill({ x: left, y: 350, width: 250, text: '5 seats included', accent: palette.green, fontSize: 17 })}
      ${pill({ x: left, y: 395, width: 318, text: '1 companion app included', accent: palette.violet, fontSize: 17 })}
      ${pill({ x: left, y: 440, width: 260, text: 'Extra apps · $29/mo', fontSize: 17 })}
      ${pill({ x: left, y: 485, width: 265, text: 'Extra seats · $15/mo', accent: palette.red, fontSize: 17 })}
      ${data.tracks.map((track, index) => trackCard(track, cardsX, 172 + index * (cardH + cardGap), cardW, cardH, true)).join('')}
      ${cta(cardsX, 496, cardW, 62, 'Build Your Stack at operatoros.net/pricing', 20)}
      <text x="${w - 46}" y="${h - 22}" text-anchor="end" fill="${palette.muted}" font-family="${font}" font-size="12">Monthly pricing shown · Final price confirmed at checkout · Terms apply</text>
    `);
  }

  const cardH = 190;
  return svgShell(w, h, `
    <rect width="${w}" height="${h}" fill="${palette.bg}"/>
    <image href="${nexusUri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.55"/>
    <rect width="${w}" height="${h}" fill="url(#shade)"/>
    <rect y="${h * 0.48}" width="${w}" height="${h * 0.52}" fill="url(#bottomShade)"/>
    ${brandLockup(46, 42, 76)}
    <text x="46" y="196" fill="${palette.cyan}" font-family="${font}" font-size="19" font-weight="850" letter-spacing="3">TRANSPARENT MONTHLY PRICING</text>
    <text x="46" y="272" fill="${palette.white}" font-family="${font}" font-size="58" font-weight="900">OPERATOROS <tspan fill="${palette.cyan}">$0</tspan>.</text>
    <text x="46" y="330" fill="${palette.white}" font-family="${font}" font-size="49" font-weight="900">CHOOSE YOUR TRACK.</text>
    <text x="48" y="374" fill="${palette.secondary}" font-family="${font}" font-size="21">5 seats + 1 companion application included.</text>
    ${data.tracks.map((track, index) => trackCard(track, 46, 440 + index * (cardH + 18), w - 92, cardH, false)).join('')}
    ${pill({ x: 46, y: 1080, width: 306, text: 'Extra apps · $29/mo', fontSize: 18 })}
    ${pill({ x: 366, y: 1080, width: 310, text: 'Extra seats · $15/mo', accent: palette.red, fontSize: 18 })}
    <g transform="translate(46 1190)" filter="url(#shadow)">
      <rect width="${w - 92}" height="360" rx="26" fill="#0D1117" fill-opacity="0.88" stroke="${palette.cyan}" stroke-opacity="0.35"/>
      <text x="28" y="55" fill="${palette.green}" font-family="${font}" font-size="18" font-weight="850" letter-spacing="3">FREE WITH ANY ACCOUNT</text>
      <text x="28" y="105" fill="${palette.white}" font-family="${font}" font-size="27" font-weight="800">TorqueShed · FaultlineLab · Operator Pool Hall</text>
      <line x1="28" y1="144" x2="${w - 148}" y2="144" stroke="${palette.secondary}" stroke-opacity="0.22"/>
      <text x="28" y="194" fill="${palette.violet}" font-family="${font}" font-size="18" font-weight="850" letter-spacing="3">CHOOSE 1 COMPANION APPLICATION</text>
      <text x="28" y="242" fill="${palette.white}" font-family="${font}" font-size="23" font-weight="750">SnapProofOS · BrandForgeOS · StudyForge AI</text>
      <text x="28" y="282" fill="${palette.white}" font-family="${font}" font-size="23" font-weight="750">Deploy Ops · CallCommand AI · Script Ops</text>
      <text x="28" y="326" fill="${palette.secondary}" font-family="${font}" font-size="18">One selection included; additional companion applications are $29/month.</text>
    </g>
    ${cta(46, h - 146, w - 92, 72, 'Build Your Stack', 25)}
    <text x="${w / 2}" y="${h - 32}" text-anchor="middle" fill="${palette.secondary}" font-family="${font}" font-size="18">operatoros.net/pricing · Monthly pricing shown · Terms apply</text>
  `);
}

function trackSvg(track, w, h) {
  const isVertical = h / w > 1.3;
  const image = trackImageUris[track.id];
  if (isVertical) {
    return svgShell(w, h, `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <image href="${image}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
      <rect width="${w}" height="${h}" fill="url(#shade)"/>
      <rect y="${h * 0.38}" width="${w}" height="${h * 0.62}" fill="url(#bottomShade)"/>
      <ellipse cx="${w * 0.5}" cy="${h * 0.34}" rx="${w * 0.55}" ry="${h * 0.30}" fill="url(#glow)"/>
      ${brandLockup(50, 44, 74)}
      <text x="50" y="210" fill="${track.accent}" font-family="${font}" font-size="21" font-weight="850" letter-spacing="4">TRACK ${track.number} · ${esc(track.track.toUpperCase())}</text>
      <text x="50" y="300" fill="${palette.white}" font-family="${font}" font-size="72" font-weight="900">${esc(track.product)}</text>
      <text x="50" y="354" fill="${palette.secondary}" font-family="${font}" font-size="24" font-weight="600">${esc(track.audience)}</text>
      <text x="50" y="470" fill="${palette.white}" font-family="${font}" font-size="86" font-weight="900">$${track.monthly}<tspan fill="${palette.secondary}" font-size="26">/month</tspan></text>
      <text x="50" y="524" fill="${track.accent}" font-family="${font}" font-size="27" font-weight="800">${esc(track.shortOutcome)}</text>
      <g transform="translate(50 ${h - 520})">
        <rect width="${w - 100}" height="300" rx="26" fill="#0D1117" fill-opacity="0.92" stroke="${track.accent}" stroke-opacity="0.55"/>
        <text x="28" y="56" fill="${palette.white}" font-family="${font}" font-size="24" font-weight="850">WHAT THIS TRACK RUNS</text>
        ${track.features.map((feature, index) => `
          <circle cx="36" cy="${105 + index * 58}" r="8" fill="${track.accent}"/>
          <text x="58" y="${113 + index * 58}" fill="${palette.secondary}" font-family="${font}" font-size="22" font-weight="600">${esc(feature)}</text>
        `).join('')}
      </g>
      ${pill({ x: 50, y: h - 190, width: 252, text: '5 seats included', accent: palette.green, fontSize: 18 })}
      ${pill({ x: 316, y: h - 190, width: 340, text: '1 companion app included', accent: palette.violet, fontSize: 18 })}
      ${cta(50, h - 126, w - 100, 70, 'Build This Stack', 24)}
      <text x="${w / 2}" y="${h - 20}" text-anchor="middle" fill="${palette.secondary}" font-family="${font}" font-size="17">operatoros.net/pricing · Monthly pricing shown · Terms apply</text>
    `, track.accent);
  }

  return svgShell(w, h, `
    <rect width="${w}" height="${h}" fill="${palette.bg}"/>
    <image href="${image}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
    <rect width="${w}" height="${h}" fill="url(#shade)"/>
    <rect y="${h * 0.48}" width="${w}" height="${h * 0.52}" fill="url(#bottomShade)"/>
    ${brandLockup(42, 36, 70)}
    <text x="42" y="180" fill="${track.accent}" font-family="${font}" font-size="19" font-weight="850" letter-spacing="4">TRACK ${track.number} · ${esc(track.track.toUpperCase())}</text>
    <text x="42" y="260" fill="${palette.white}" font-family="${font}" font-size="66" font-weight="900">${esc(track.product)}</text>
    <text x="42" y="306" fill="${palette.secondary}" font-family="${font}" font-size="23" font-weight="600">${esc(track.audience)}</text>
    <text x="42" y="408" fill="${palette.white}" font-family="${font}" font-size="80" font-weight="900">$${track.monthly}<tspan fill="${palette.secondary}" font-size="24">/month</tspan></text>
    <text x="42" y="460" fill="${track.accent}" font-family="${font}" font-size="25" font-weight="800">${esc(track.shortOutcome)}</text>
    <g transform="translate(42 ${h - 315})">
      <rect width="${w - 84}" height="210" rx="22" fill="#0D1117" fill-opacity="0.90" stroke="${track.accent}" stroke-opacity="0.52"/>
      ${track.features.map((feature, index) => `
        <circle cx="30" cy="${48 + index * 51}" r="7" fill="${track.accent}"/>
        <text x="50" y="${56 + index * 51}" fill="${palette.secondary}" font-family="${font}" font-size="19" font-weight="600">${esc(feature)}</text>
      `).join('')}
      <text x="${w - 122}" y="56" text-anchor="end" fill="${palette.white}" font-family="${font}" font-size="18" font-weight="800">5 seats + 1 companion app included</text>
      ${cta(w - 392, 100, 310, 62, 'Build This Stack', 20)}
    </g>
    <text x="42" y="${h - 34}" fill="${palette.secondary}" font-family="${font}" font-size="17">operatoros.net/pricing</text>
    <text x="${w - 42}" y="${h - 34}" text-anchor="end" fill="${palette.muted}" font-family="${font}" font-size="12">Monthly pricing shown · Terms apply</text>
  `, track.accent);
}

async function renderSvg(name, width, height, svg) {
  const svgPath = path.join(editableDir, `${name}.svg`);
  const pngPath = path.join(staticDir, `${name}.png`);
  await fs.writeFile(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(pngPath);
  return { name, path: pngPath, width, height };
}

async function renderClean(name, width, height, sourceUri, position = 'xMidYMid') {
  const svg = svgShell(width, height, `
    <rect width="${width}" height="${height}" fill="${palette.bg}"/>
    <image href="${sourceUri}" width="${width}" height="${height}" preserveAspectRatio="${position} slice"/>
    <rect width="${width}" height="${height}" fill="url(#shade)" opacity="0.35"/>
    <image href="${markUri}" x="${Math.round(width * 0.055)}" y="${Math.round(height * 0.07)}" width="${Math.round(Math.min(width, height) * 0.15)}" height="${Math.round(Math.min(width, height) * 0.15)}" opacity="0.94"/>
  `);
  const pngPath = path.join(staticDir, `${name}.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(pngPath);
  return { name, path: pngPath, width, height };
}

const outputs = [];
outputs.push(await renderSvg('operatoros-overview-landscape-1200x628', 1200, 628, overviewSvg(1200, 628, 'landscape')));
outputs.push(await renderSvg('operatoros-overview-square-1200x1200', 1200, 1200, overviewSvg(1200, 1200, 'square')));
outputs.push(await renderSvg('operatoros-overview-feed-1080x1350', 1080, 1350, overviewSvg(1080, 1350, 'feed')));
outputs.push(await renderSvg('operatoros-overview-story-1080x1920', 1080, 1920, overviewSvg(1080, 1920, 'story')));
outputs.push(await renderSvg('operatoros-pricing-landscape-1200x628', 1200, 628, pricingSvg(1200, 628)));
outputs.push(await renderSvg('operatoros-pricing-story-1080x1920', 1080, 1920, pricingSvg(1080, 1920)));
for (const track of data.tracks) {
  outputs.push(await renderSvg(`operatoros-track-${track.id}-square-1080x1080`, 1080, 1080, trackSvg(track, 1080, 1080)));
  outputs.push(await renderSvg(`operatoros-track-${track.id}-story-1080x1920`, 1080, 1920, trackSvg(track, 1080, 1920)));
}
outputs.push(await renderClean('google-rda-clean-landscape-1200x628', 1200, 628, masterUri));
outputs.push(await renderClean('google-rda-clean-square-1200x1200', 1200, 1200, masterUri));
outputs.push(await renderClean('google-rda-clean-vertical-900x1600', 900, 1600, masterUri));
outputs.push(await renderClean('operatoros-logo-square-1200x1200', 1200, 1200, logoUri));

console.log(JSON.stringify({ rendered: outputs.length, outputs }, null, 2));
