/**
 * Gate 3 follow-up — No Unicode emoji glyphs in page source files.
 *
 * The original `unicode-glyph.test.tsx` only renders the role-aware sidebar.
 * This sibling test widens coverage to every page component under
 * `apps/web/src/components/pages/*.tsx`. We use a static source-file scan
 * (rather than `renderToStaticMarkup`) because real page components depend
 * on QueryClient/Auth/Tenant providers, fetch data on mount, and would
 * require an unreliable provider-stub matrix to render headlessly. A source
 * scan is more deterministic and catches the same offenders the rendered
 * test would, modulo the documented allow-list below.
 *
 * Scope: characters in the Unicode block U+2400-U+2BFF (Control Pictures,
 * Box Drawing, Block Elements, Geometric Shapes, Misc Symbols, Dingbats,
 * Misc Math, Supplemental Arrows, Braille, Misc Symbols and Arrows). None
 * of these belong in a vector-icon UI.
 *
 * Allow-list: a small set of pages still contain glyphs that are tracked
 * for cleanup in a separate task. Each entry must explain *why* it is on
 * the list. Adding a new entry requires a code-review acknowledgement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PAGES_DIR = resolve(__dirname, '../../web/src/components/pages');

// Files explicitly allowed to contain U+2400-U+2BFF characters. Each
// entry MUST link to a follow-up task / explanation, AND pin the exact
// set of allowed code points so a maintainer can't silently introduce a
// *new kind* of glyph. Removing or replacing all glyphs in an
// allow-listed file is also a failure (so we remember to drop the entry).
//
// `allowedCodepoints` is the sorted, unique set of code points (as
// 'U+XXXX' strings) the file is currently allowed to contain. Reshuffling
// occurrences is fine; introducing a new code point is not.
interface AllowEntry {
  reason: string;
  allowedCodepoints: string[];
}

const ALLOW_LIST: Record<string, AllowEntry> = {};

function findOffenders(source: string): { line: number; col: number; cp: string; ch: string }[] {
  const offenders: { line: number; col: number; cp: string; ch: string }[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const cp = line.codePointAt(j)!;
      if (cp >= 0x2400 && cp <= 0x2BFF) {
        offenders.push({
          line: i + 1,
          col: j + 1,
          cp: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
          ch: String.fromCodePoint(cp),
        });
      }
      if (cp > 0xFFFF) j++;
    }
  }
  return offenders;
}

const pageFiles = readdirSync(PAGES_DIR).filter(f => /\.tsx?$/.test(f));

assert.ok(pageFiles.length > 0, `expected to find page files in ${PAGES_DIR}`);

// Integrity guard: every ALLOW_LIST key must correspond to a real page
// file under PAGES_DIR. Stops stale entries from accumulating after a
// page is renamed or deleted.
test('ALLOW_LIST contains no stale entries', () => {
  const knownFiles = new Set(pageFiles);
  const stale = Object.keys(ALLOW_LIST).filter(k => !knownFiles.has(k));
  assert.deepEqual(
    stale, [],
    `ALLOW_LIST has entries that no longer exist under ${PAGES_DIR}: ` +
    `${stale.join(', ')}. Remove them.`,
  );
});

for (const file of pageFiles) {
  test(`page ${file} has no U+2400-U+2BFF glyphs in source`, () => {
    const allow = ALLOW_LIST[file];
    const source = readFileSync(join(PAGES_DIR, file), 'utf8');
    const offenders = findOffenders(source);
    const actualCps = Array.from(new Set(offenders.map(o => o.cp))).sort();

    if (allow) {
      // Allow-listed files: pin the *set* of allowed code points so a
      // new kind of glyph fails the test, while reshuffling existing
      // ones (e.g., moving a divider) is tolerated.
      const expectedCps = [...allow.allowedCodepoints].sort();

      // 1) File must still contain at least one glyph; otherwise the
      // entry is obsolete and the maintainer should remove it.
      assert.ok(
        offenders.length > 0,
        `${file} is on the allow-list ("${allow.reason}") but no longer ` +
        `contains any U+2400-U+2BFF glyphs. Please remove its entry from ` +
        `ALLOW_LIST in apps/api/test/unicode-glyph-pages.test.ts.`,
      );

      // 2) The set of code points present must exactly match what's
      // pinned. New code points = silent regression we want to catch.
      // Missing code points = the maintainer cleaned partially without
      // updating the pin, which we also want surfaced.
      assert.deepEqual(
        actualCps, expectedCps,
        `${file} allow-listed code points drifted.\n` +
        `  expected: [${expectedCps.join(', ')}]\n` +
        `  actual:   [${actualCps.join(', ')}]\n` +
        `If you added a new glyph type, replace it with a lucide-react ` +
        `icon. If you removed one, update the allow-list pin to match ` +
        `(or remove the entry if the file is now clean).`,
      );
      return;
    }

    assert.equal(
      offenders.length, 0,
      `${file} contains ${offenders.length} U+2400-U+2BFF glyph(s):\n` +
      offenders.slice(0, 8).map(o =>
        `  L${o.line}:${o.col}  ${o.cp}  ${o.ch}`
      ).join('\n') +
      `\n\nReplace with a lucide-react icon component, or add the file to ` +
      `ALLOW_LIST with a documented reason.`,
    );
  });
}
