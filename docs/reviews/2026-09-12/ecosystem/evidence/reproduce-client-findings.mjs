// Executes extracted current-source expressions with synthetic collaborators.
// These are defect reproduction probes, NOT passing product acceptance tests.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';

const root = 'C:/Dev/OperatorOS/';
const observations = [];
function parse(path) {
  const text = fs.readFileSync(root + path, 'utf8');
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function matching(source, predicate) {
  const hits = [];
  const walk = node => { if (predicate(node)) hits.push(node); ts.forEachChild(node, walk); };
  walk(source); return hits;
}
function execute(expression, context) {
  const js = ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(js, context, { timeout: 1000 });
}

const paymentPath = 'apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx';
const paymentSource = parse(paymentPath);
const [paymentHandler] = matching(paymentSource, n => ts.isArrowFunction(n)
  && n.getText(paymentSource).includes("window.prompt('Payment reference (optional)')"));
assert.ok(paymentHandler, 'Locate actual production onClick handler');
let calls = 0;
const click = execute(paymentHandler.getText(paymentSource), {
  window: { prompt: () => null }, invoice: { id: 'synthetic-invoice', version: 1 },
  run: fn => fn(), moduleShellApi: { tradeflowkit: { payInvoice: () => { calls++; return Promise.resolve({}); } } },
});
click();
assert.equal(calls, 1);
observations.push({ finding: 'F01', observed: 'Cancel (null) invokes payInvoice once', kind: 'executed actual extracted callback; no HTTP or database call' });

const domainPath = 'apps/torqueshed-native/src/lib/queue-domain.ts';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + domainPath, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports }, { timeout: 1000 });
const remaining = exports.applyQueueOutcome([{ id: 'offline-photo', attempts: 0 }], 'offline-photo', { kind: 'permanent', error: 'HTTP 409 conflict' });
assert.equal(remaining.length, 0);
observations.push({ finding: 'F03', observed: 'Permanent failure removes sole queued item', kind: 'executed actual queue-domain module; no device storage touched' });

const torquePath = 'apps/web/src/components/module-shells/TorqueShedRestorationPanels.tsx';
const torqueSource = parse(torquePath);
const defaultChecked = matching(torqueSource, n => ts.isJsxAttribute(n) && n.name.getText(torqueSource) === 'defaultChecked')
  .find(n => n.getText(torqueSource).includes('settings[name]'));
assert.ok(defaultChecked);
const checked = execute(defaultChecked.initializer.expression.getText(torqueSource), {
  name: 'discoverable', settings: { profileDiscoverable: false, reducedMotion: false },
});
assert.equal(checked, true);
observations.push({ finding: 'F08', observed: 'Saved profileDiscoverable=false renders discoverability checkbox true', kind: 'executed actual JSX value expression with server-shaped settings' });

const snapPath = 'apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx';
const snapSource = parse(snapPath);
const team = matching(snapSource, n => ts.isVariableDeclaration(n) && n.name.getText(snapSource) === 'needsTeam')[0];
assert.ok(team);
const shouldFetchTeam = execute(team.initializer.getText(snapSource), { tab: 'team' });
assert.equal(shouldFetchTeam, false);
observations.push({ finding: 'F05', observed: 'Team route computes needsTeam=false', kind: 'executed actual fetch-condition expression' });

const result = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  capturedAt: new Date().toISOString(), probes: observations.length, reproduced: observations.length,
  limitations: 'Expression probes substantiate source behavior; they are not authenticated browser E2E or a security audit.', observations };
fs.writeFileSync(new URL('./client-reproductions.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
