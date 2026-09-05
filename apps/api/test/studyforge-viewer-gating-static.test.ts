import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test('StudyForge derives tenant viewer capability and threads it through both workspaces', () => {
  const routeShell = read('apps/web/src/components/module-shells/StudyForgeRouteShell.tsx');
  const shell = read('apps/web/src/components/module-shells/StudyForgeShell.tsx');
  const complete = read('apps/web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx');

  assert.match(routeShell, /useModuleAccessLevel/);
  assert.match(routeShell.replace(/\s+/g, ''), /moduleAccessLevel==='user'\|\|moduleAccessLevel==='manager'/);
  assert.match(routeShell, /canWrite=\{canWriteModule\}/);
  assert.match(shell, /canWrite = true/);
  assert.match(shell, /StudyForgeCompleteWorkspace[\s\S]{0,180}canWrite=\{canWrite\}/);
  assert.ok((shell.match(/canWrite=\{canWrite\}/g) ?? []).length >= 7);
  assert.match(complete, /canWrite = true/);
  assert.ok((complete.match(/canWrite=\{canWrite\}/g) ?? []).length >= 7);
});

test('legacy persisted learning activity requires module write access', () => {
  const routes = read('apps/api/src/routes/studyforge-routes.ts');
  assert.match(routes, /quizzes\/:id\/attempts', \{ preHandler: writeGuards \}/);
  assert.match(routes, /cards\/:id\/reviews', \{ preHandler: writeGuards \}/);
  assert.match(routes, /plan-sessions\/:id', \{ preHandler: writeGuards \}/);
});

test('StudyForge viewers receive a clear notice and legacy mutation controls stay inert', () => {
  const source = read('apps/web/src/components/module-shells/StudyForgeShell.tsx');
  const mutate = section(source, 'const mutate = async', 'const navigate =');

  assert.match(source, /data-testid="studyforge-read-only"/);
  assert.match(source, /data-can-write=\{canWrite \? 'true' : 'false'\}/);
  assert.match(mutate, /if \(!canWrite\)/);
  assert.match(mutate, /READ_ONLY_MESSAGE/);
  assert.match(source, /button-studyforge-subject-create" disabled=\{busy \|\| !canWrite\}/);
  assert.match(source, /button-studyforge-source-create" disabled=\{busy \|\| !canWrite/);
  assert.match(source, /input disabled=\{!canWrite\} type="file"/);
  assert.match(source, /button-studyforge-generation-create" disabled=\{busy \|\| !canWrite/);
  assert.match(source, /function lifecycle[\s\S]{0,500}<button disabled=\{!canWrite\}/);
  assert.match(source, /Edit card<\/button>/);
  assert.match(source, /Edit question<\/button>/);
  assert.match(source, /Edit session<\/button>/);
  assert.ok((source.match(/disabled=\{busy \|\| !canWrite/g) ?? []).length >= 8);
  assert.match(source, /button-studyforge-quiz-submit-[\s\S]{0,100}disabled=\{busy \|\| !canWrite/);
  const cards = section(source, 'function CardEditor', 'function Quizzes');
  assert.match(cards, /disabled=\{busy \|\| !canWrite\}/);
  assert.match(cards, /moduleShellApi\.studyforge\.reviewCard/);

  // Refresh, navigation, local answer selection, and authorized exports remain read operations.
  assert.match(source, /onClick=\{\(\) => void load\(\)\} disabled=\{busy\}/);
  assert.match(source, /onClick=\{\(\) => navigate\(id\)\}/);
  assert.match(source, /type="radio" name=\{question\.id\}[\s\S]{0,180}setAnswers/);
  assert.match(source, /href="\/api\/modules\/studyforge-ai\/export\?format=json"/);
  assert.match(source, /href="\/api\/modules\/studyforge-ai\/export\?format=csv"/);
});

test('complete-set viewers can study locally but cannot persist set, session, quiz, plan, or countdown changes', () => {
  const source = read('apps/web/src/components/module-shells/StudyForgeCompleteWorkspace.tsx');
  const act = section(source, 'const act = async', 'const open = async');
  const rate = section(source, 'const rate = useCallback', 'useEffect(() => {');

  assert.match(source, /data-testid="studyforge-complete-read-only"/);
  assert.match(source, /data-can-write=\{canWrite \? 'true' : 'false'\}/);
  assert.match(act, /if \(!canWrite\)/);
  assert.match(act, /READ_ONLY_MESSAGE/);
  assert.match(rate, /!card \|\| busy \|\| !canWrite/);
  assert.match(source, /event\.key === '1'\) void rate\('learning'\)/);
  assert.match(source, /event\.key === '2'\) void rate\('known'\)/);
  assert.ok((source.match(/disabled=\{busy \|\| !canWrite/g) ?? []).length >= 10);
  assert.match(source, /Submit and review<\/button>/);
  const plan = section(source, 'function Plan(', 'function Countdowns');
  assert.match(plan, /disabled=\{busy \|\| !canWrite\}/);
  assert.match(plan, /moduleShellApi\.studyforge\.completePlanItem/);
  const countdowns = section(source, 'function Countdowns', 'function Account');
  assert.match(countdowns, /moduleShellApi\.studyforge\.createCountdown/);
  assert.match(countdowns, /moduleShellApi\.studyforge\.deleteCountdown/);
  assert.ok((countdowns.match(/disabled=\{busy \|\| !canWrite/g) ?? []).length >= 2);

  // Opening saved sets, revealing and browsing cards, choosing draft quiz answers,
  // reading review material, and downloading allowed exports stay available.
  assert.match(source, /onClick=\{\(\) => void open\(set\.id\)\} disabled=\{busy\}/);
  assert.match(source, /<button onClick=\{\(\) => setFlipped/);
  assert.match(source, /onClick=\{\(\) => setIndex\(\(value\) => Math\.max/);
  assert.match(source, /type="radio" name=\{question\.id\}[\s\S]{0,180}setAnswers/);
  assert.match(source, /<Review set=\{set\} \/>/);
  assert.match(source, /export\?format=json/);
  assert.match(source, /export\?format=csv/);
});
