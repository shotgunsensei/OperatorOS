'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileImage, Loader2, Palette, Save, Sparkles } from 'lucide-react';
import type { BrandForgeBrand } from '@/lib/auth';

export type BrandLogoComposition = 'wordmark' | 'lockup' | 'badge' | 'monogram';
export type BrandLogoStyle = 'precision' | 'editorial' | 'impact' | 'heritage';
export type BrandLogoPalette = 'brand' | 'monochrome' | 'reverse';
export type BrandLogoBackground = 'gradient' | 'solid' | 'transparent';
export type BrandLogoPngSize = 'standard' | 'high-resolution';

export type BrandLogoConceptOptions = {
  kind: BrandLogoComposition;
  style?: BrandLogoStyle;
  palette?: BrandLogoPalette;
  background?: BrandLogoBackground;
  tagline?: string;
};

const compositions: Array<{ value: BrandLogoComposition; label: string; use: string }> = [
  { value: 'wordmark', label: 'Wide wordmark', use: 'Web headers and presentations' },
  { value: 'lockup', label: 'Stacked lockup', use: 'Campaign covers and signs' },
  { value: 'badge', label: 'Round badge', use: 'Social profiles and merchandise' },
  { value: 'monogram', label: 'Compact monogram', use: 'Avatars, icons, and stamps' },
];

const styles: Array<{ value: BrandLogoStyle; label: string; description: string }> = [
  { value: 'precision', label: 'Precision', description: 'Crisp geometry and forward motion' },
  { value: 'editorial', label: 'Editorial', description: 'Refined lines and restrained detail' },
  { value: 'impact', label: 'Impact', description: 'Heavy shapes and high visibility' },
  { value: 'heritage', label: 'Heritage', description: 'Emblem structure and lasting authority' },
];

const palettes: Array<{ value: BrandLogoPalette; label: string }> = [
  { value: 'brand', label: 'Full brand color' },
  { value: 'monochrome', label: 'One-color ink' },
  { value: 'reverse', label: 'Light-on-dark' },
];

const backgrounds: Array<{ value: BrandLogoBackground; label: string }> = [
  { value: 'gradient', label: 'Brand gradient' },
  { value: 'solid', label: 'Solid field' },
  { value: 'transparent', label: 'Transparent' },
];

function xml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function color(value: string | null | undefined, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function fileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'brand';
}

function monogram(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]![0]}${words.at(-1)![0]}` : words[0]?.slice(0, 2) || 'BF').toUpperCase();
}

function displayName(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length > 34 ? `${clean.slice(0, 33).trimEnd()}…` : clean;
}

function fitFontSize(label: string, maxWidth: number, preferred: number, minimum: number) {
  if (!label) return preferred;
  return Math.max(minimum, Math.min(preferred, Math.floor(maxWidth / (label.length * 0.58))));
}

function defaultTagline(brand: BrandForgeBrand) {
  const description = (brand.description ?? '').trim().replace(/\s+/g, ' ');
  if (!description) return '';
  const sentence = description.split(/[.!?](?:\s|$)/)[0] ?? description;
  return sentence.slice(0, 70).trim();
}

export function brandLogoDimensions(kind: BrandLogoComposition, size: BrandLogoPngSize = 'standard') {
  const standard = kind === 'wordmark'
    ? { width: 1200, height: 400 }
    : kind === 'lockup'
      ? { width: 900, height: 700 }
      : kind === 'badge'
        ? { width: 800, height: 800 }
        : { width: 600, height: 600 };
  const scale = size === 'high-resolution' ? 2 : 1;
  return { width: standard.width * scale, height: standard.height * scale };
}

function markSvg(style: BrandLogoStyle, transform: string, primary: string, secondary: string, accent: string, foreground: string) {
  if (style === 'editorial') {
    return `<g transform="${transform}" data-mark-style="editorial"><circle cx="80" cy="80" r="66" fill="none" stroke="${foreground}" stroke-width="5"/><circle cx="80" cy="80" r="48" fill="none" stroke="${accent}" stroke-width="2"/><path d="M42 80h76M80 42v76" stroke="${foreground}" stroke-width="4"/><circle cx="80" cy="80" r="9" fill="${accent}"/></g>`;
  }
  if (style === 'impact') {
    return `<g transform="${transform}" data-mark-style="impact"><rect x="13" y="13" width="98" height="98" rx="13" fill="${primary}"/><rect x="52" y="52" width="95" height="95" rx="13" fill="${secondary}"/><path d="M49 113 113 49l24 24-64 64z" fill="${accent}"/></g>`;
  }
  if (style === 'heritage') {
    return `<g transform="${transform}" data-mark-style="heritage"><path d="M80 8 142 31v45c0 39-23 64-62 78C41 140 18 115 18 76V31z" fill="${primary}" stroke="${accent}" stroke-width="7"/><path d="m48 80 22 22 44-48" fill="none" stroke="${foreground}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  return `<g transform="${transform}" data-mark-style="precision"><path d="M12 127 65 17h37L49 127z" fill="${primary}"/><path d="m69 127 53-110h26L95 127z" fill="${secondary}"/><path d="M24 106h100l-10 21H14z" fill="${accent}"/></g>`;
}

function backgroundSvg(background: BrandLogoBackground, width: number, height: number, primary: string) {
  if (background === 'transparent') return '';
  return `<rect width="${width}" height="${height}" rx="${Math.round(Math.min(width, height) * 0.08)}" fill="${background === 'gradient' ? 'url(#brand-background)' : primary}"/>`;
}

/** Builds a deterministic, editable SVG locally. A composition string keeps the original API compatible. */
export function buildBrandSvgConcept(brand: BrandForgeBrand, input: BrandLogoComposition | BrandLogoConceptOptions) {
  const requested = typeof input === 'string'
    ? { kind: input, style: 'precision', palette: 'brand', background: 'gradient', tagline: defaultTagline(brand) }
    : input;
  const options: Required<BrandLogoConceptOptions> = {
    kind: compositions.some(item => item.value === requested.kind) ? requested.kind : 'wordmark',
    style: styles.some(item => item.value === requested.style) ? requested.style as BrandLogoStyle : 'precision',
    palette: palettes.some(item => item.value === requested.palette) ? requested.palette as BrandLogoPalette : 'brand',
    background: backgrounds.some(item => item.value === requested.background) ? requested.background as BrandLogoBackground : 'gradient',
    tagline: typeof requested.tagline === 'string' ? requested.tagline.trim().slice(0, 70) : '',
  };
  const { width, height } = brandLogoDimensions(options.kind);
  const fullName = xml(brand.name.trim());
  const namePlain = displayName(brand.name);
  const name = xml(namePlain);
  const initials = xml(monogram(brand.name));
  const tagline = xml(options.tagline);
  const savedPrimary = color(brand.primaryColor, '#7c3aed');
  const savedSecondary = color(brand.secondaryColor, '#db2777');
  const savedAccent = color(brand.accentColor, '#22d3ee');
  const primary = options.palette === 'monochrome' ? '#111827' : options.palette === 'reverse' ? '#020617' : savedPrimary;
  const secondary = options.palette === 'monochrome' ? '#374151' : options.palette === 'reverse' ? '#111827' : savedSecondary;
  const accent = options.palette === 'monochrome' ? '#111827' : savedAccent;
  const foreground = options.background === 'transparent'
    ? (options.palette === 'reverse' ? '#111827' : primary)
    : '#ffffff';
  const detail = options.background === 'transparent' && options.palette === 'monochrome' ? '#374151' : accent;
  const markPrimary = foreground;
  const markSecondary = options.background === 'transparent' ? secondary : detail;
  const font = xml((brand.headingFont || 'Arial, Helvetica, sans-serif').slice(0, 120));
  const nameWeight = options.style === 'editorial' ? 600 : options.style === 'heritage' ? 700 : 850;
  const nameSpacing = options.style === 'editorial' ? '1' : options.style === 'impact' ? '-4' : '-2';
  const accessibleDescription = `${options.style} ${options.kind} in the ${options.palette} palette on a ${options.background} background.`;
  const defs = `<defs><linearGradient id="brand-background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs>`;
  const metadata = `<metadata data-composition="${options.kind}" data-style="${options.style}" data-palette="${options.palette}" data-background="${options.background}"/>`;
  const opening = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">${fullName} ${options.kind}</title><desc id="description">${xml(accessibleDescription)}</desc>${metadata}${defs}${backgroundSvg(options.background, width, height, primary)}`;
  const taglineLine = (x: number, y: number, anchor = 'start', size = 24, maxWidth = 700) => tagline
    ? `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${detail}" font-family="Arial, Helvetica, sans-serif" font-size="${fitFontSize(options.tagline, maxWidth, size, 12)}" font-weight="700" letter-spacing="4">${tagline}</text>`
    : '';

  if (options.kind === 'monogram') {
    return `${opening}${markSvg(options.style, 'translate(108 92) scale(2.4)', markPrimary, markSecondary, detail, foreground)}<rect x="82" y="76" width="436" height="436" rx="94" fill="none" stroke="${detail}" stroke-width="8" opacity=".88"/><text x="300" y="365" text-anchor="middle" fill="${foreground}" font-family="${font}" font-size="170" font-weight="${nameWeight}" letter-spacing="-7">${initials}</text>${taglineLine(300, 536, 'middle', 18, 430)}</svg>`;
  }
  if (options.kind === 'badge') {
    return `${opening}<circle cx="400" cy="400" r="310" fill="none" stroke="${foreground}" stroke-width="11"/><circle cx="400" cy="400" r="276" fill="none" stroke="${detail}" stroke-width="4"/>${markSvg(options.style, 'translate(304 170) scale(1.2)', markPrimary, markSecondary, detail, foreground)}<text x="400" y="488" text-anchor="middle" fill="${foreground}" font-family="${font}" font-size="102" font-weight="${nameWeight}" letter-spacing="${nameSpacing}">${initials}</text><text x="400" y="578" text-anchor="middle" fill="${foreground}" font-family="${font}" font-size="${fitFontSize(namePlain, 580, 38, 20)}" font-weight="${nameWeight}" letter-spacing="1">${name}</text>${taglineLine(400, 635, 'middle', 18, 500)}</svg>`;
  }
  if (options.kind === 'lockup') {
    return `${opening}${markSvg(options.style, 'translate(338 105) scale(1.4)', markPrimary, markSecondary, detail, foreground)}<text x="450" y="445" text-anchor="middle" fill="${foreground}" font-family="${font}" font-size="${fitFontSize(namePlain, 730, 82, 34)}" font-weight="${nameWeight}" letter-spacing="${nameSpacing}">${name}</text><path d="M245 490h410" stroke="${detail}" stroke-width="5" stroke-linecap="round"/>${taglineLine(450, 550, 'middle', 21, 590)}</svg>`;
  }
  const scaledNameSize = fitFontSize(namePlain, 820, 108, 38);
  return `${opening}${markSvg(options.style, 'translate(72 115) scale(1.05)', markPrimary, markSecondary, detail, foreground)}<text x="275" y="225" fill="${foreground}" font-family="${font}" font-size="${scaledNameSize}" font-weight="${nameWeight}" letter-spacing="${nameSpacing}">${name}</text>${taglineLine(279, 286, 'start', 23, 760)}</svg>`;
}

function conceptFileName(brand: BrandForgeBrand, options: Required<BrandLogoConceptOptions>, extension: 'svg' | 'png') {
  return `${fileSlug(brand.name)}-${options.kind}-${options.style}-${options.palette}-${options.background}.${extension}`;
}

function triggerDownload(href: string, fileName: string, revoke = false) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

function downloadSvg(brand: BrandForgeBrand, options: Required<BrandLogoConceptOptions>) {
  const url = URL.createObjectURL(new Blob([buildBrandSvgConcept(brand, options)], { type: 'image/svg+xml;charset=utf-8' }));
  triggerDownload(url, conceptFileName(brand, options, 'svg'), true);
}

async function pngBase64(svg: string, width: number, height: number) {
  const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The visual concept could not be rendered.'));
      image.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser cannot prepare this image.');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('The visual concept could not be encoded.')), 'image/png'),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

type SaveLogoInput = {
  expectedVersion: number;
  fileName: string;
  mimeType: 'image/png';
  contentBase64: string;
  idempotencyKey: string;
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  border: '1px solid rgba(148,163,184,.32)',
  borderRadius: 8,
  background: '#0b1220',
  color: '#f8fafc',
  padding: '8px 10px',
};

export default function BrandSvgConceptExporter({
  brand,
  onSaveLogo,
  canWrite = true,
}: {
  brand: BrandForgeBrand;
  onSaveLogo: (input: SaveLogoInput) => Promise<{ brand: BrandForgeBrand; logo?: { id: string; scanStatus: string }; duplicate?: boolean; pendingSafetyCheck?: boolean }>;
  canWrite?: boolean;
}) {
  const [kind, setKind] = useState<BrandLogoComposition>('wordmark');
  const [style, setStyle] = useState<BrandLogoStyle>('precision');
  const [palette, setPalette] = useState<BrandLogoPalette>('brand');
  const [background, setBackground] = useState<BrandLogoBackground>('gradient');
  const [tagline, setTagline] = useState(() => defaultTagline(brand));
  const [pngSize, setPngSize] = useState<BrandLogoPngSize>('standard');
  const [saving, setSaving] = useState<BrandLogoComposition | null>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(brand.version);
  const [savedScanStatus, setSavedScanStatus] = useState<string | null>(null);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  useEffect(() => setCurrentVersion(brand.version), [brand.version]);
  const options = useMemo<Required<BrandLogoConceptOptions>>(() => ({ kind, style, palette, background, tagline: tagline.trim().slice(0, 70) }), [background, kind, palette, style, tagline]);
  const previewSvg = useMemo(() => buildBrandSvgConcept(brand, options), [brand, options]);
  const previewUrl = useMemo(() => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(previewSvg)}`, [previewSvg]);
  const chosenComposition = compositions.find(item => item.value === kind)!;
  const action: React.CSSProperties = {
    border: '1px solid rgba(148,163,184,.3)',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    padding: '8px 11px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    fontWeight: 750,
  };
  const saveLabels: Record<BrandLogoComposition, string> = {
    wordmark: 'Save wordmark as brand logo',
    lockup: 'Save stacked lockup as brand logo',
    badge: 'Save round badge as brand logo',
    monogram: 'Save monogram as brand logo',
  };

  const downloadPng = async () => {
    setExportingPng(true);
    setError(null);
    try {
      const dimensions = brandLogoDimensions(kind, pngSize);
      const content = await pngBase64(previewSvg, dimensions.width, dimensions.height);
      triggerDownload(`data:image/png;base64,${content}`, conceptFileName(brand, options, 'png'));
      setNotice(`${chosenComposition.label} PNG prepared at ${dimensions.width} × ${dimensions.height}px.`);
    } catch (cause) {
      setError((cause as Error)?.message ?? 'The PNG could not be prepared.');
    } finally {
      setExportingPng(false);
    }
  };

  const saveAsLogo = async () => {
    setSaving(kind);
    setNotice(null);
    setError(null);
    try {
      const { width, height } = brandLogoDimensions(kind);
      const optionKey = `${kind}:${style}:${palette}:${background}:${fileSlug(tagline).slice(0, 28) || 'no-tagline'}`;
      const sessionKey = `brandforge:logo-concept:${brand.id}:${currentVersion}:${optionKey}`;
      let idempotencyKey = '';
      try {
        idempotencyKey = sessionStorage.getItem(sessionKey) ?? '';
        if (!idempotencyKey) {
          idempotencyKey = `brand-logo:${brand.id}:${currentVersion}:${optionKey}:${crypto.randomUUID()}`;
          sessionStorage.setItem(sessionKey, idempotencyKey);
        }
      } catch {
        idempotencyKey = `brand-logo:${brand.id}:${currentVersion}:${optionKey}:${crypto.randomUUID()}`;
      }
      const saveInput: SaveLogoInput = {
        expectedVersion: currentVersion,
        fileName: conceptFileName(brand, options, 'png'),
        mimeType: 'image/png',
        contentBase64: await pngBase64(previewSvg, width, height),
        idempotencyKey,
      };
      let saved = await onSaveLogo(saveInput);
      for (let attempt = 0; saved.pendingSafetyCheck && attempt < 4; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 750));
        saved = await onSaveLogo(saveInput);
      }
      setCurrentVersion(saved.brand.version);
      setLogoPreviewFailed(false);
      const promoted = saved.logo?.scanStatus === 'clean' && saved.brand.logoAttachmentId === saved.logo.id;
      if (promoted) {
        setSavedScanStatus('File verified');
        setNotice(`${chosenComposition.label} ${saved.duplicate ? 'was already verified and saved' : 'passed the required format and safety checks and is now the shared brand logo'}.`);
      } else {
        setNotice(`${chosenComposition.label} was accepted and queued for its safety check. The existing logo stays in place until the check passes; choose Save again if the check is still running.`);
      }
    } catch (cause) {
      setError((cause as { error?: string; message?: string })?.error ?? (cause as Error)?.message ?? 'The logo could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <details data-testid={`brandforge-svg-concepts-${brand.id}`} style={{ marginTop: 14, borderTop: '1px solid rgba(148,163,184,.2)', paddingTop: 12 }}>
      <summary style={{ cursor: 'pointer', color: '#e9d5ff', fontWeight: 800 }}>
        <Palette size={15} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
        Build a flexible logo system
      </summary>
      <p style={{ color: '#aab4c5', fontSize: 12, lineHeight: 1.5 }}>
        Shape a useful family of local logo directions from this brand’s saved name, type, and colors. Choose a composition, visual character, color treatment, and background; then export an editable SVG or production-ready PNG.
      </p>
      <p style={{ color: '#c4b5fd', fontSize: 12, lineHeight: 1.5 }}>
        Canva and Figma use a standard file handoff; BrandForgeOS does not log in to or create a design inside either service. Import the downloaded SVG or PNG there to continue editing, collaborate, or place it into a template.
      </p>
      {brand.logoAttachmentId && (
        <div data-testid={`brandforge-saved-logo-${brand.id}`} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 12, alignItems: 'center', marginBottom: 12, padding: 10, border: '1px solid rgba(134,239,172,.25)', borderRadius: 10 }}>
          {!logoPreviewFailed ? (
            <img
              src={`/api/modules/brandforgeos/brands/${encodeURIComponent(brand.id)}/logo?v=${encodeURIComponent(String(brand.version))}`}
              alt={`${brand.name} saved logo`}
              onError={() => setLogoPreviewFailed(true)}
              style={{ width: 96, height: 72, objectFit: 'contain', borderRadius: 8, background: '#fff' }}
            />
          ) : (
            <div style={{ width: 96, height: 72, display: 'grid', placeItems: 'center', borderRadius: 8, background: '#111827', color: '#fcd34d', fontSize: 11, textAlign: 'center' }}>Logo checking or unavailable</div>
          )}
          <div>
            <strong>Shared workspace logo</strong>
            <p style={{ margin: '4px 0', color: '#aab4c5', fontSize: 12 }}>Safety check: {savedScanStatus ?? (logoPreviewFailed ? 'checking or unavailable' : 'passed')}</p>
            <a href={`/api/modules/brandforgeos/brands/${encodeURIComponent(brand.id)}/logo`} target="_blank" rel="noreferrer" style={{ color: '#c4b5fd', fontSize: 12 }}>Open or download the private logo</a>
          </div>
        </div>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <legend style={{ color: '#f8fafc', fontSize: 12, fontWeight: 800, marginBottom: 7 }}>1. Choose where the logo needs to work</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(132px,1fr))', gap: 7 }}>
          {compositions.map(item => {
            const active = item.value === kind;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(item.value)}
                style={{ textAlign: 'left', minHeight: 70, padding: 9, borderRadius: 9, border: active ? '1px solid #c084fc' : '1px solid rgba(148,163,184,.25)', background: active ? 'rgba(126,34,206,.24)' : '#0b1220', color: '#f8fafc', cursor: 'pointer' }}
              >
                <strong style={{ display: 'block', fontSize: 12 }}>{item.label}</strong>
                <span style={{ display: 'block', color: '#aab4c5', fontSize: 10, lineHeight: 1.35, marginTop: 3 }}>{item.use}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 9, marginBottom: 10 }}>
        <label style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}>
          2. Visual character
          <select value={style} onChange={event => setStyle(event.target.value as BrandLogoStyle)} style={{ ...controlStyle, marginTop: 4 }}>
            {styles.map(item => <option key={item.value} value={item.value}>{item.label} — {item.description}</option>)}
          </select>
        </label>
        <label style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}>
          3. Color treatment
          <select value={palette} onChange={event => setPalette(event.target.value as BrandLogoPalette)} style={{ ...controlStyle, marginTop: 4 }}>
            {palettes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700 }}>
          4. Background
          <select value={background} onChange={event => setBackground(event.target.value as BrandLogoBackground)} style={{ ...controlStyle, marginTop: 4 }}>
            {backgrounds.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
        Optional tagline (70 characters)
        <input
          value={tagline}
          maxLength={70}
          onChange={event => setTagline(event.target.value)}
          placeholder="A short customer-facing promise"
          style={{ ...controlStyle, marginTop: 4 }}
        />
      </label>

      <div data-testid="brandforge-logo-live-preview" style={{ padding: 12, borderRadius: 12, background: background === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0 25%,#fff 0 50%) 50% / 20px 20px' : '#070b13', border: '1px solid rgba(148,163,184,.28)' }}>
        <img src={previewUrl} alt={`${brand.name} ${styles.find(item => item.value === style)?.label} ${chosenComposition.label} preview`} style={{ width: '100%', maxHeight: 300, display: 'block', objectFit: 'contain' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button type="button" style={action} disabled={Boolean(saving) || exportingPng} onClick={() => downloadSvg(brand, options)}>
          <Download size={14} /> Download editable SVG
        </button>
        <label style={{ color: '#cbd5e1', fontSize: 11 }}>
          PNG size
          <select value={pngSize} onChange={event => setPngSize(event.target.value as BrandLogoPngSize)} style={{ ...controlStyle, width: 'auto', marginLeft: 6 }}>
            <option value="standard">Standard</option>
            <option value="high-resolution">High-resolution (2×)</option>
          </select>
        </label>
        <button type="button" style={action} disabled={Boolean(saving) || exportingPng} onClick={() => void downloadPng()}>
          {exportingPng ? <Loader2 size={14} /> : <FileImage size={14} />} Download PNG
        </button>
        <button type="button" style={{ ...action, background: '#6d28d9' }} disabled={Boolean(saving) || exportingPng || !canWrite} title={!canWrite ? 'You need brand edit access to save a logo.' : undefined} onClick={() => void saveAsLogo()}>
          {saving ? <Loader2 size={14} /> : <Save size={14} />} {saveLabels[kind]}
        </button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.45 }}>
        <Sparkles size={13} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} />
        SVG keeps the shapes and text editable. PNG is ready for websites and documents. Saving a concept changes the shared workspace logo only after its required safety check passes.
      </p>
      {!canWrite && <p style={{ color: '#fcd34d', fontSize: 12 }}>You can download concepts, but you need brand edit access to save one as the shared logo.</p>}
      {notice && <p role="status" style={{ color: '#86efac', fontSize: 12 }}><CheckCircle2 size={14} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} />{notice}</p>}
      {error && <p role="alert" style={{ color: '#fecaca', fontSize: 12 }}>{error}</p>}
    </details>
  );
}
