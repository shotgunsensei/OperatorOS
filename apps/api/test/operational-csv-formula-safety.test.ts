import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise each actual private encoder without loading database/provider imports.
function encoder(filename: string): (value: unknown) => string {
  const source = readFileSync(new URL(`../src/routes/${filename}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
  const declaration = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'csvCell');
  assert.ok(declaration, 'Actual CSV encoder remains available for regression coverage');
  const code = ts.transpileModule(`${declaration.getText(ast)}\nexports.encode = csvCell;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { encode: undefined as unknown as (value: unknown) => string };
  runInNewContext(code, { exports: result, Date });
  return result.encode;
}

for (const filename of ['tradeflowkit-routes.ts','techdeck-routes.ts']) {
  test(`${filename} neutralizes string formulas while retaining CSV escaping and numeric values`, () => {
    const csv = encoder(filename);
    for (const value of ['=1+1','+1+1','-1+1','@SUM(1,2)',' \t=1+1','\r\n@SUM(1,2)']) {
      assert.equal(csv(value), `"'${value.replaceAll('"', '""')}"`);
    }
    assert.equal(csv(-42), '"-42"');
    assert.equal(csv(0), '"0"');
    assert.equal(csv(null), '""');
    assert.equal(csv('Name, "quoted"\nsecond line'), '"Name, ""quoted""\nsecond line"');
    assert.equal(csv('Ordinary text'), '"Ordinary text"');
  });
}

test('TradeFlow date export keeps its existing ISO representation', () => {
  assert.equal(encoder('tradeflowkit-routes.ts')(new Date('2026-10-27T00:00:00.000Z')), '"2026-10-27T00:00:00.000Z"');
});
