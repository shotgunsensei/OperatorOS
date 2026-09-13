import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const review = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(review, name), 'utf8');
const findingText = read('FINDINGS.md');
const findings = [...findingText.matchAll(/^### (F\d{2}) — (P[123])[^\n]*\n([\s\S]*?)(?=^### |^## Disposition|$(?![\s\S]))/gm)]
  .map(match => ({ id: match[1], priority: match[2], title: match[0].split('\n')[0].replace(/^### /, ''),
    phases: [...new Set((match[3].match(/P\d{2}/g) ?? []))] }));
const phaseIds = [...read('PHASE_PROMPTS.md').matchAll(/^## (P\d{2}) —/gm)].map(m => m[1]);
const opportunityIds = [...read('VALUE_OPPORTUNITIES.md').matchAll(/^## (E\d{2}) —/gm)].map(m => m[1]);
assert.equal(findings.length, 35);
assert.equal(new Set(findings.map(x => x.id)).size, 35);
assert.equal(phaseIds.length, 28);
assert.equal(opportunityIds.length, 16);
for (const item of findings) {
  assert.ok(item.phases.length, `${item.id} must have an execution phase`);
  item.phases.forEach(p => assert.ok(phaseIds.includes(p), `Unknown phase ${p}`));
}
const brokenLinks = [];
for (const name of ['README.md', 'FINDINGS.md', 'PHASE_PROMPTS.md', 'VALUE_OPPORTUNITIES.md', 'ACCEPTANCE_MATRIX.md']) {
  for (const match of read(name).matchAll(/\[[^\]\n]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^https?:|^app:|^codex:/.test(target)) continue;
    if (!fs.existsSync(path.resolve(review, target))) brokenLinks.push({ file: name, target });
  }
}
assert.deepEqual(brokenLinks, []);
const counts = findings.reduce((a, x) => ({ ...a, [x.priority]: (a[x.priority] ?? 0) + 1 }), {});
const result = { sourceCommit: 'fe7f1711428e10daefc9b56d15b8e6a73289dadc',
  findings: findings.sort((a,b) => a.id.localeCompare(b.id)), priorities: counts, phaseIds, opportunityIds,
  validation: { uniqueFindings: findings.length, uniquePhases: phaseIds.length, uniqueOpportunities: opportunityIds.length, brokenLocalLinks: 0 },
  note: 'Document consistency validation only; not product tests or security certification.' };
fs.writeFileSync(path.join(review, 'review-index.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.validation));
console.log(JSON.stringify(counts));
