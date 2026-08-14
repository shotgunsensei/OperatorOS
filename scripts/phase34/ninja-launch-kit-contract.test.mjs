import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('pinned Ninja Launch Kit catalog compiles to exactly 20 templates and nine visual promos', () => {
  const output = execFileSync(process.execPath, ['scripts/phase34/compile-ninja-launch-kit-source.mjs'], { encoding: 'utf8' });
  assert.match(output, /20 templates, 9 visual promos/);
  const generated = readFileSync('apps/api/src/generated/ninja-launch-kit-source-catalog.ts', 'utf8');
  assert.match(generated, /"templates": 20/);
  assert.match(generated, /"visualPromos": 9/);
  assert.equal((generated.match(/"slug":/g) ?? []).length, 20);
  assert.equal((generated.match(/"dimensions":/g) ?? []).length, 9);
});

test('Phase 34 catalog is compiled only from the pinned read-only source evidence', () => {
  const compiler = readFileSync('scripts/phase34/compile-ninja-launch-kit-source.mjs', 'utf8');
  assert.match(compiler, /apps.*modules.*ninja-launch-kit.*source/);
  assert.match(compiler, /expected 20 templates/);
  assert.match(compiler, /expected 9 briefs/);
  assert.doesNotMatch(compiler, /writeFile\(templatePath|writeFile\(visualPath/);
});
