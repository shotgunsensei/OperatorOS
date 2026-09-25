import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Rebuilds shareable artwork without browser automation or external services.
// Photography is generated separately with ImageGen; text remains editable here.
const root = process.cwd();
const require = createRequire(join(root, 'apps/web/package.json'));
const React = require('react');
const { ImageResponse } = require('next/og');
const h = React.createElement;
const output = resolve(root, 'output/marketing/choose-your-lane-2026-09-24');
// Supply an installed open-licensed font folder when rebuilding the export kit.
const fontDir = process.env.CAMPAIGN_FONT_DIR;
const fonts = fontDir ? [
  { name: 'Campaign', data: await readFile(join(fontDir, 'LiberationSans-Regular.ttf')), weight: 400 },
  { name: 'Campaign', data: await readFile(join(fontDir, 'LiberationSans-Bold.ttf')), weight: 700 },
] : undefined;
const fontFamily = fonts ? 'Campaign' : 'sans-serif';
await mkdir(join(output, 'exports'), { recursive: true });
const dataImage = async path => `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
const mark = await dataImage(join(root, 'apps/web/public/brand/operatoros-mark.png'));
const lanes = [
  { slug: 'trades', audience: 'TRADE COMPANIES', product: 'TradeFlowKit', color: '#ffc17a', lines: ['Less chasing.', 'More paid work.'], detail: 'Customers. Quotes. Jobs. Invoices.', url: 'operatoros.net/for/trades' },
  { slug: 'msps', audience: 'MSPs & IT TEAMS', product: 'TechDeck', color: '#7bdcff', lines: ['Clear tickets.', 'Confident handoffs.'], detail: 'Client support. Equipment. Team knowledge.', url: 'operatoros.net/for/msps' },
  { slug: 'healthcare-legal', audience: 'HEALTHCARE / LEGAL-OFFICE OPERATIONS', product: 'PulseDesk', color: '#89e5d1', lines: ['Keep the', 'office moving.'], detail: 'Internal requests. Equipment. Follow-ups.', url: 'operatoros.net/for/healthcare-legal' },
];
for (const lane of lanes) lane.image = await dataImage(join(output, 'source-art', `${lane.slug}.png`));
const div = (style, ...children) => h('div', { style: { display: 'flex', ...style } }, ...children);
const text = (copy, style = {}) => div(style, copy);
const logo = scale => div({ alignItems: 'center', gap: 14 * scale }, h('img', { src: mark, width: 50 * scale, height: 50 * scale }), text('OperatorOS', { color: '#f5f8ff', fontSize: 28 * scale, fontWeight: 700, letterSpacing: -1 }));

function single(lane, width, height) {
  const wide = width > height;
  const scale = width / 1080;
  const pad = 64 * scale;
  const titleSize = (wide ? 66 : 88) * scale;
  return div({ width: '100%', height: '100%', background: '#070f1a', color: '#f5f8ff', position: 'relative', fontFamily },
    h('img', { src: lane.image, width: wide ? width * .6 : width, height: (wide ? width * .6 : width) * 1.5, style: { position: 'absolute', right: 0, top: 0 } }),
    div({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: wide ? 'linear-gradient(90deg, #070f1a 28%, rgba(7,15,26,.94) 43%, rgba(7,15,26,.1) 100%)' : 'linear-gradient(180deg, rgba(7,15,26,.24) 0%, rgba(7,15,26,.2) 30%, #070f1a 76%)' }),
    div({ position: 'absolute', top: pad, left: pad }, logo(scale)),
    div({ position: 'absolute', left: pad, right: pad, bottom: pad, flexDirection: 'column' },
      text(lane.audience, { color: lane.color, fontSize: (wide ? 14 : 17) * scale, letterSpacing: 2 * scale, fontWeight: 700, marginBottom: 18 * scale }),
      ...lane.lines.map(line => text(line, { fontSize: titleSize, lineHeight: 1.04, letterSpacing: -3 * scale, fontWeight: 700 })),
      text(lane.product, { fontSize: 29 * scale, color: lane.color, fontWeight: 700, marginTop: 24 * scale }),
      text(lane.detail, { color: '#c2cfdf', fontSize: (wide ? 18 : 24) * scale, marginTop: 13 * scale }),
      div({ marginTop: 31 * scale, borderTop: '1px solid #4b6273', paddingTop: 22 * scale, justifyContent: 'space-between', alignItems: 'center' },
        text('Find your fit', { fontSize: 21 * scale, fontWeight: 700 }),
        text(lane.url, { fontSize: (wide ? 17 : 20) * scale, color: '#bfd1e5' })),
      ...(lane.slug === 'healthcare-legal' ? [text('Office operations only. No patient charts or legal case management.', { fontSize: 14 * scale, color: '#aebed0', marginTop: 19 * scale })] : []),
    ),
  );
}

function overview(width, height) {
  const scale = width / 1080;
  const wide = width > height;
  const pad = 55 * scale;
  const top = wide ? 168 * scale : 355 * scale;
  const bottom = 102 * scale;
  return div({ width: '100%', height: '100%', background: '#070f1a', color: '#f5f8ff', flexDirection: 'column', padding: pad, fontFamily },
    logo(scale),
    text(wide ? 'Your business. Choose your lane.' : 'You run the business.', { fontSize: (wide ? 49 : 64) * scale, fontWeight: 700, letterSpacing: -2 * scale, marginTop: 28 * scale, lineHeight: 1.08 }),
    ...(!wide ? [text('Choose your lane.', { fontSize: 70 * scale, fontWeight: 700, color: '#7bdcff', letterSpacing: -2 * scale, lineHeight: 1.08 })] : []),
    div({ position: 'absolute', top, left: pad, right: pad, bottom, gap: 17 * scale },
      ...lanes.map((lane, index) => div({ position: 'relative', flex: 1, overflow: 'hidden', borderRadius: 12 * scale, border: '1px solid #43576d', background: '#102030' },
        h('img', { src: lane.image, width: (width - pad * 2 - 34 * scale) / 3, height: height - top - bottom, style: { objectFit: 'cover', objectPosition: 'center 20%' } }),
        div({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(7,15,26,.12), rgba(7,15,26,.1) 20%, #070f1a 84%)' }),
        text(`0${index + 1}`, { position: 'absolute', top: 20 * scale, left: 20 * scale, color: lane.color, fontSize: 17 * scale, fontWeight: 700 }),
        div({ position: 'absolute', bottom: 25 * scale, left: 20 * scale, right: 20 * scale, flexDirection: 'column' },
          text(index === 0 ? 'Trade Companies' : index === 1 ? 'MSPs' : 'Healthcare / Legal', { fontSize: (wide ? 22 : 27) * scale, fontWeight: 700, lineHeight: 1.1 }),
          text(lane.product, { color: lane.color, fontSize: 19 * scale, marginTop: 12 * scale, fontWeight: 700 }),
          ...(!wide ? [text(index === 0 ? 'Jobs to invoices.' : index === 1 ? 'Client work, connected.' : 'Office operations.', { color: '#bfcedf', fontSize: 17 * scale, marginTop: 12 * scale })] : []),
        ),
      )),
    ),
    div({ position: 'absolute', bottom: 40 * scale, left: pad, right: pad, justifyContent: 'space-between', fontSize: 21 * scale }, text('One account. A focused way forward.'), text('operatoros.net', { color: '#7bdcff', fontWeight: 700 })),
  );
}

const manifest = [];
for (const [format, width, height] of [['square', 1080, 1080], ['portrait', 1080, 1350], ['landscape', 1200, 630]]) {
  for (const lane of [...lanes, null]) {
    const name = `${lane?.slug ?? 'choose-your-lane'}-${format}.png`;
    const response = new ImageResponse(lane ? single(lane, width, height) : overview(width, height), { width, height, fonts });
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(join(output, 'exports', name), bytes);
    manifest.push({ file: `exports/${name}`, width, height, bytes: bytes.length, destination: lane ? `https://${lane.url}` : 'https://operatoros.net', status: 'prepared-not-published' });
    console.log(`${name}: ${bytes.length} bytes`);
  }
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ created: '2026-09-24', generator: 'ImageGen photography + editable ImageResponse composition', assets: manifest }, null, 2) + '\n');
