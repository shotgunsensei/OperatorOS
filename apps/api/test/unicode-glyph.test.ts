/**
 * Gate 3 — No Unicode emoji glyphs in the role-aware sidebar.
 *
 * The sidebar must use lucide-react vector icons exclusively so the IA is
 * crisp at every DPI and respects user font/theme. This test scans the
 * SaasLayout source for emoji-class Unicode glyphs and fails if any sneak
 * back in during refactors.
 *
 * We allow the brand-mark "O" character used inside the OperatorOS logo
 * pill (which is plain ASCII), and any lucide-react imports — those are
 * SVG components, not glyphs in source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAAS_LAYOUT = path.join(__dirname, '../../web/src/components/SaasLayout.tsx');
const SIDEBAR_NAV = path.join(__dirname, '../../web/src/lib/sidebar-nav.ts');

// Match Unicode emoji / pictograph / symbol code points commonly used as
// nav glyphs (\uD83C-\uDBFF surrogate pairs, miscellaneous symbols, dingbats).
// Built from char codes to avoid escape-mangling in the source file.
const ranges: Array<[number, number]> = [
  [0x1F300, 0x1FAFF], // misc symbols / pictographs / emoji
  [0x2600,  0x27BF],  // misc symbols + dingbats
  [0x1F000, 0x1F2FF], // mahjong / playing cards / enclosed alphanumerics
];
function hasEmojiGlyph(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    if (cp == null) continue;
    for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
    if (cp > 0xFFFF) i++; // skip the second half of the surrogate pair
  }
  return false;
}

for (const file of [SAAS_LAYOUT, SIDEBAR_NAV]) {
  test(`${path.basename(file)} contains no Unicode emoji glyphs`, () => {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (hasEmojiGlyph(line)) offenders.push(`L${i + 1}: ${line.trim()}`);
    });
    assert.equal(
      offenders.length, 0,
      `Unicode emoji glyphs must not appear in ${path.basename(file)}.\n` +
      `Use lucide-react icon components instead. Offenders:\n${offenders.join('\n')}`,
    );
  });
}

test('SaasLayout imports lucide-react (vector icons only)', () => {
  const src = readFileSync(SIDEBAR_NAV, 'utf8');
  assert.match(src, /from 'lucide-react'/, 'sidebar nav must source icons from lucide-react');
});
