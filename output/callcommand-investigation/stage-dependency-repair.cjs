const { readFileSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = 'C:/Dev/OperatorOS';
const candidate = 'C:/Dev/OperatorOS-callcommand-release';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('diff', '--cached', '--name-only')) throw new Error('Index must be empty');
const files = ['apps/web/package.json', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'apps/api/test/phase15-release-identity.test.ts', 'docs/CURRENT_RELEASE_GATE.md', 'docs/IMPLEMENTATION_STATUS.md'];
for (const file of ['docs/CURRENT_RELEASE_GATE.md', 'docs/IMPLEMENTATION_STATUS.md']) {
  const original = execFileSync('git', ['show', `HEAD:${file}`], {cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  const updated = readFileSync(`${candidate}/${file}`, 'utf8').replace(/\r\n/g,'\n');
  const working = readFileSync(`${root}/${file}`, 'utf8').replace(/\r\n/g,'\n');
  const oldEnd = original.indexOf('\n## ', original.indexOf('\n## ') + 1);
  const newEnd = updated.indexOf('\n## ', updated.indexOf('\n## ') + 1);
  const oldPrefix = original.slice(0, oldEnd);
  if (!working.startsWith(oldPrefix)) throw new Error(`Unexpected shared document prefix: ${file}`);
  writeFileSync(`${root}/${file}`, updated.slice(0,newEnd) + working.slice(oldEnd));
}
for (const file of files) {
  const hash = git('hash-object', '-w', '--path', file, `${candidate}/${file}`);
  git('update-index', '--add', '--cacheinfo', '100644', hash, file);
}
process.stdout.write(git('diff', '--cached', '--stat') + '\n');
