import { existsSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findWorkspaceRoot(start: string): string | null {
  let current = resolve(start);
  const root = parse(current).root;
  while (true) {
    if (
      existsSync(resolve(current, 'package.json')) &&
      existsSync(resolve(current, 'pnpm-workspace.yaml'))
    ) {
      return current;
    }
    if (current === root) return null;
    current = dirname(current);
  }
}

export function resolveRepositoryRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const root = findWorkspaceRoot(process.cwd()) ?? findWorkspaceRoot(moduleDirectory);
  if (!root) {
    throw new Error('OperatorOS repository root could not be resolved');
  }
  return root;
}
