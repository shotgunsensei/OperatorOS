/**
 * Gate 3 — No Unicode emoji glyphs in the *rendered* role-aware sidebar.
 *
 * The sidebar must use lucide-react vector icons exclusively so the IA is
 * crisp at every DPI and respects user font/theme. This test renders the
 * sidebar nav data through React's server renderer and scans the resulting
 * DOM string for any character in the Unicode block U+2400-U+2BFF
 * (Control Pictures through Miscellaneous Symbols and Arrows), which is
 * the range commonly abused for nav glyph hacks.
 *
 * Filename is `.test.tsx` so JSX in the renderer call is parsed by tsx.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildNavSections, type NavSection } from '../../web/src/lib/sidebar-nav.js';

// U+2400-U+2BFF covers Control Pictures, Box Drawing, Block Elements,
// Geometric Shapes, Miscellaneous Symbols, Dingbats, Misc Mathematical
// Symbols-A, Supplemental Arrows-A, Braille Patterns, Supplemental
// Arrows-B, Misc Mathematical Symbols-B, Supplemental Math Operators,
// and Misc Symbols and Arrows. None of these belong in a vector-icon UI.
function hasGlyphInBlock(s: string): { found: boolean; samples: string[] } {
  const samples: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i)!;
    if (cp >= 0x2400 && cp <= 0x2BFF) {
      samples.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} (${String.fromCodePoint(cp)})`);
      if (samples.length >= 5) break;
    }
    if (cp > 0xFFFF) i++;
  }
  return { found: samples.length > 0, samples };
}

function renderSidebar(sections: NavSection[]): string {
  // Render the nav as plain semantic markup (nav/section/ul/li) so the
  // assertion sees only what would actually paint. Icons are React
  // components — they render to <svg>, never glyph characters.
  return renderToStaticMarkup(
    createElement('nav', { 'aria-label': 'sidebar' },
      sections.map((s, i) =>
        createElement('section', { key: i, 'aria-labelledby': `sec-${i}` },
          createElement('h3', { id: `sec-${i}` }, s.label),
          createElement('ul', null,
            s.items.map(item =>
              createElement('li', { key: item.id, 'data-testid': `nav-${item.id}` },
                createElement(item.Icon, { size: 16 }),
                createElement(Fragment, null, item.label),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

for (const flags of [
  { name: 'regular user', flags: { isSuperAdmin: false, isTenantAdmin: false } },
  { name: 'tenant admin', flags: { isSuperAdmin: false, isTenantAdmin: true } },
  { name: 'super admin',  flags: { isSuperAdmin: true,  isTenantAdmin: true } },
]) {
  test(`rendered sidebar (${flags.name}) contains no U+2400-U+2BFF glyphs`, () => {
    const html = renderSidebar(buildNavSections(flags.flags));
    const { found, samples } = hasGlyphInBlock(html);
    assert.equal(
      found, false,
      `Rendered sidebar must not contain U+2400-U+2BFF block glyphs.\n` +
      `Use lucide-react components instead. Sample offenders: ${samples.join(', ')}\n` +
      `Rendered HTML:\n${html}`,
    );
    // Sanity: the renderer actually produced section labels.
    assert.ok(html.includes('Launch'), 'sidebar should always show Launch section');
  });
}

test('rendered sidebar emits an <svg> tag for every nav item (vector icons present)', () => {
  const html = renderSidebar(buildNavSections({ isSuperAdmin: true, isTenantAdmin: true }));
  const svgCount = (html.match(/<svg/g) || []).length;
  const liCount = (html.match(/<li/g) || []).length;
  assert.equal(svgCount, liCount, `expected one <svg> per nav <li>, got svg=${svgCount}, li=${liCount}`);
});
