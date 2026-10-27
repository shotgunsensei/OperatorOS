import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { csvCell as snapProofCsvCell } from '../src/lib/snapproofos.js';

const source = readFileSync(new URL('../src/routes/ninja-launch-kit-routes.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true);
const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['launchExport','launchCsvCell'].includes(node.name?.text ?? '')).map(node => node.getText(ast));
const compiled = ts.transpileModule(declarations.join('\n') + '\nexports.render = launchExport;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} as Record<string, any> }; runInNewContext(compiled, { module, exports: module.exports });
function render(title: string) { return module.exports.render({ selected: { title: 'Fixture launch' }, readiness: {}, phases: [], milestones: [], tasks: [{ title, status: 'todo', required: true }], artifacts: [{ title, status: 'draft', required: false }] }, 'csv').content as string; }
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i+1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row=[]; cell=''; }
    else cell += c;
  }
  assert.equal(quoted, false, 'CSV quotes must be balanced'); if (cell || row.length) { row.push(cell); rows.push(row); } return rows;
}
test('Deploy Ops CSV emits spreadsheet formulas as literal text', () => {
  for (const title of ['=1+1','+SUM(1,1)','-1+1','@SUM(1,1)','  =1+1','\t=1+1','\r\n=1+1']) {
    const rows = parseCsv(render(title)); assert.equal(rows.length, 3); for (const row of rows.slice(1)) { assert.equal(row.length, 4); assert.equal(row[1], "'"+title); }
  }
});
test('Deploy Ops CSV round-trips quotes, delimiters, newlines and ordinary titles', () => {
  for (const title of ['Review "ready", now','Line one\nLine two','Ordinary campaign']) {
    const rows = parseCsv(render(title)); assert.equal(rows.length, 3); assert.deepEqual(rows[0], ['type','title','status','required']);
    assert.equal(rows[1][1], title); assert.equal(rows[2][1], title); assert.equal(rows[1].length, 4); assert.equal(rows[2].length, 4);
  }
});


test('SnapProof CSV neutralizes formula text while preserving numeric negatives and normal values', () => {
  for (const value of ['=1+1','+SUM(1,1)','-1+1','@SUM(1,1)','  =1+1','\t=1+1','\r\n=1+1']) assert.equal(parseCsv(snapProofCsvCell(value))[0][0], "'"+value);
  for (const value of [-42, 0, true, 'Ordinary title', 'Review "ready", now', 'Line one\nLine two', new Date('2026-10-20T12:00:00Z')]) assert.equal(parseCsv(snapProofCsvCell(value))[0][0], String(value));
});
