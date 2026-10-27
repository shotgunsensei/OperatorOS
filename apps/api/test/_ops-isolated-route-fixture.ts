import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { PgDialect } from 'drizzle-orm/pg-core';
import ts from 'typescript';

const installed = createRequire(import.meta.url);

/** No application bootstrap, environment-file loading, server or provider. */
export function loadOpsRoute(filename: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(`../src/routes/${filename}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  runInNewContext(output, { exports: module.exports, module, require: (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('.')) throw new Error(`Unprovided isolated route dependency: ${name}`);
    return installed(name);
  }, URLSearchParams, Date, Buffer }, { filename });
  return module.exports;
}

export function compileOpsSql(query: Parameters<PgDialect['sqlToQuery']>[0]) {
  return new PgDialect().sqlToQuery(query);
}

/** A deliberately small fixture interpreter, not a PostgreSQL substitute.
 * It evaluates the actual parameterized SELECT's AND/OR, =, IN and IS NULL
 * predicates over synthetic records. Unsupported grammar fails explicitly.
 * Exact actual-SQL SQLite proof is maintained separately for Node 24. */
export function opsSelectMatches(query: ReturnType<typeof compileOpsSql>, row: Record<string, unknown>): boolean {
  const where = /\bWHERE\s+([\s\S]*?)(?:\bORDER BY\b|\bLIMIT\b|$)/i.exec(query.sql)?.[1];
  if (!where) throw new Error('A scoped SELECT predicate is required');
  const pattern = /\s*(\$\d+|'(?:''|[^'])*'|[a-z_][a-z_0-9.]*|=|\(|\)|,)/iy;
  const tokens: string[] = []; let offset = 0;
  while (offset < where.trimEnd().length) {
    pattern.lastIndex = offset; const token = pattern.exec(where);
    if (!token) throw new Error(`Unsupported fixture SQL at ${where.slice(offset, offset + 30)}`);
    tokens.push(token[1]); offset = pattern.lastIndex;
  }
  let index = 0;
  const is = (value: string) => tokens[index]?.toUpperCase() === value;
  function take(value: string) { if (!is(value)) throw new Error(`Expected ${value}`); index++; }
  function operand(): unknown {
    const value = tokens[index++];
    if (!value) throw new Error('Missing fixture operand');
    if (value.startsWith('$')) return query.params[Number(value.slice(1)) - 1];
    if (value.startsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    if (value.toUpperCase() === 'NULL') return null;
    if (value.toUpperCase() === 'TRUE') return true;
    if (value.toUpperCase() === 'FALSE') return false;
    const column = Object.hasOwn(row, value) ? value : value.split('.').at(-1)!;
    if (!Object.hasOwn(row, column)) throw new Error(`Unprovided fixture column: ${value}`);
    return row[column];
  }
  function atom(): boolean {
    if (is('(')) { index++; const value = or(); take(')'); return value; }
    if (is('NOT')) { index++; return !atom(); }
    const left = operand();
    if (is('=')) { index++; const right = operand(); return left != null && right != null && left === right; }
    if (is('IS')) { index++; const negate = is('NOT'); if (negate) index++; take('NULL'); return negate ? left != null : left == null; }
    if (is('IN')) {
      index++; take('('); const values = [operand()];
      while (is(',')) { index++; values.push(operand()); } take(')');
      return left != null && values.includes(left);
    }
    return Boolean(left);
  }
  function and(): boolean { let value = atom(); while (is('AND')) { index++; const right = atom(); value = value && right; } return value; }
  function or(): boolean { let value = and(); while (is('OR')) { index++; const right = and(); value = value || right; } return value; }
  const result = or();
  if (index !== tokens.length) throw new Error('Unsupported remaining fixture SQL');
  return result;
}
