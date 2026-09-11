const fs = require('node:fs');
const ts = require('typescript');
const path = 'apps/api/src/routes/callcommand-commercial-routes.ts';
let source = fs.readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const marker = '  app.post(`${base}/commercial/numbers/provision`, { preHandler: admins }, async (request, reply) => {';
const start = source.indexOf(marker);
const end = source.indexOf('\n  app.post(`${base}/commercial/numbers/connect`', start);
if (start < 0 || end < 0) throw Error('Provision route missing');
let block = source.slice(start, end);
block = block.replace(marker, 'async function provisionManagedNumber(request: FastifyRequest, value: Row): Promise<{ statusCode: number; body: Row }> {');
block = block.replace('      const value = body(request);\n', '');
block = block.replace(/\n  \}\);\s*$/, '\n}\n');
block = block.replace('      return fail(reply, error);', '      throw error;');
const ast = ts.createSourceFile('refactor.ts', block, ts.ScriptTarget.Latest, true);
const edits = [];
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'send') {
    const code = node.expression.expression;
    if (ts.isCallExpression(code) && code.expression.getText(ast) === 'reply.code') {
      edits.push({ start: node.getStart(ast), end: node.end, text: `{ statusCode: ${code.arguments[0].getText(ast)}, body: ${node.arguments[0].getText(ast)} }` });
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
for (const e of edits.sort((a,b) => b.start-a.start)) block = block.slice(0,e.start)+e.text+block.slice(e.end);
if (/reply\./.test(block)) throw Error('Unconverted reply');
source = source.slice(0,start) + `  app.post(\`\${base}/commercial/numbers/provision\`, { preHandler: admins }, async (request, reply) => {
    try {
      const result = await serializeNumberPurchase(request, () => provisionManagedNumber(request, body(request)));
      return reply.code(result.statusCode).send(result.body);
    } catch (error) { return fail(reply, error); }
  });
` + source.slice(end);
const registration = source.indexOf('export async function registerCallCommandCommercialRoutes');
source = source.slice(0,registration) + block + `
async function serializeNumberPurchase<T>(request: FastifyRequest, operation: () => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    // Try-lock avoids consuming the whole connection pool with waiting requests.
    const lock = await tx.execute(sql\`SELECT pg_try_advisory_xact_lock(hashtextextended(\${\`callcommand-number-purchase:\${tenant(request)}\`},0)) AS acquired\`);
    if (!(lock.rows[0] as Row)?.acquired) throw new CallCommandCommercialError('Another number is being set up. Please wait a moment.', 'CALLCOMMAND_NUMBER_PURCHASE_BUSY', 409);
    return operation();
  });
}

` + source.slice(registration);
fs.writeFileSync(path,source);
