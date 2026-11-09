import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { integrationConnectInput, landingPageInput, offerInput, parsePhase31, reportInput, taskInput, templateInput } from '../src/lib/brandforgeos-phase31.js';
import { pulseDeskId } from '../src/lib/pulsedesk-service-desk.js';
import { utf16Length } from '../src/lib/zod-string-length.js';

// Evaluate only named, pure schema declarations from the actual route source.
// No route imports, database initialization, providers, or network are executed.
function schemas(file: string, names: string[], dependencies: Record<string, unknown> = {}): Record<string, z.ZodType> {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const statements = names.map(name => {
    const statement = source.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name));
    assert.ok(statement, `Missing schema declaration ${file}:${name}`);
    return statement.getText(source).replace(/^export\s+/, '');
  });
  const javascript = ts.transpileModule(`${statements.join('\n')}\nresult = { ${names.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { z, utf16Length, ...dependencies, result: {} };
  runInNewContext(javascript, sandbox, { timeout: 1000 });
  return sandbox.result;
}

const directory = schemas('routes/directory-routes.ts', ['idSchema', 'organizationSchema', 'contactSchema', 'contactUpdateSchema', 'addressSchema', 'siteSchema']);
const context = schemas('lib/customer-workspace.ts', ['directoryContextSchema']);
const workspace = schemas('routes/customer-workspace-routes.ts', ['uuid', 'listQuery', 'actionBody'], context);
const messenger = schemas('routes/tenant-messenger-routes.ts', ['uuid', 'clientMessageId', 'sendMessageBody', 'updateMessageBody', 'deleteMessageQuery', 'createConversationBody']);

test('UTF-16 limits preserve emoji, surrogate and exact-length acceptance', () => {
  const lengthSchema = z.string().superRefine(utf16Length(2, 4));
  for (const value of ['😀', '😀😀', '\ud800\ud800', 'abcd']) assert.equal(lengthSchema.safeParse(value).success, true);
  for (const value of ['a', '\ud800', '😀😀a', 'abcde']) assert.equal(lengthSchema.safeParse(value).success, false);
  assert.ok(directory.organizationSchema.safeParse({ name: ' 😀 ' }).success);
  const address = { line1: '😀', city: 'City', region: 'Region', postalCode: '😀', countryCode: '😀' };
  assert.ok(directory.addressSchema.safeParse(address).success);
  assert.equal(directory.addressSchema.safeParse({ ...address, countryCode: '😀a' }).success, false);
  for (const sample of ['😀', '\ud800']) {
    const textAt = (limit: number) => sample.repeat(limit / sample.length);
    assert.ok(offerInput.safeParse({ name: textAt(160) }).success);
    assert.equal(offerInput.safeParse({ name: `${textAt(160)}a` }).success, false);
    assert.ok(directory.contactSchema.safeParse({ firstName: textAt(100) }).success);
    assert.equal(directory.contactSchema.safeParse({ firstName: `${textAt(100)}a` }).success, false);
    assert.ok(workspace.listQuery.safeParse({ search: textAt(200) }).success);
    assert.equal(workspace.listQuery.safeParse({ search: `${textAt(200)}a` }).success, false);
    const body = { body: textAt(4000), clientMessageId: 'synthetic-1' };
    assert.ok(messenger.sendMessageBody.safeParse(body).success);
    const invalid = messenger.sendMessageBody.safeParse({ ...body, body: `${body.body}a` });
    assert.equal(invalid.success, false);
    if (!invalid.success) { assert.equal(invalid.error.issues[0].code, 'too_big'); assert.deepEqual(invalid.error.issues[0].path, ['body']); }
    const conversation = { title: textAt(120), participantUserIds: ['10000000-0000-4000-8000-000000000001'] };
    assert.ok(messenger.createConversationBody.safeParse(conversation).success);
    assert.equal(messenger.createConversationBody.safeParse({ ...conversation, title: `${conversation.title}a` }).success, false);
  }
});

test('all migrated identifier validators preserve Zod 3 hex UUID acceptance', () => {
  const accepted = [
    '10000000-0000-4000-8000-000000000001',
    'ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB',
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '10000000-0000-0000-0000-000000000001',
  ];
  for (const value of accepted) {
    assert.equal(directory.idSchema.parse(value), value);
    assert.equal(workspace.uuid.parse(value), value);
    assert.equal(messenger.uuid.parse(value), value);
    assert.equal(offerInput.parse({ name: 'Offer', brandId: value }).brandId, value);
    assert.equal(pulseDeskId(value, 'ticketId'), value);
    assert.ok(context.directoryContextSchema.safeParse({ organizationId: value, siteId: null, contactId: null, revision: 'a'.repeat(64) }).success);
  }
  for (const value of ['not-a-uuid', '10000000000040008000000000000001', 'g0000000-0000-4000-8000-000000000001', `${accepted[0]}x`]) {
    for (const schema of [directory.idSchema, workspace.uuid, messenger.uuid]) assert.equal(schema.safeParse(value).success, false);
    assert.equal(offerInput.safeParse({ name: 'Offer', brandId: value }).success, false);
    assert.throws(() => pulseDeskId(value, 'ticketId'));
  }
  assert.equal(offerInput.parse({ name: 'Offer', brandId: null }).brandId, null);
  assert.equal(Object.hasOwn(offerInput.parse({ name: 'Offer' }), 'brandId'), false);
});

test('BrandForge defaults, trimming, records and strict error envelope stay intact', () => {
  const first = integrationConnectInput.parse({});
  assert.deepEqual(first, { mode: 'disabled', publicConfig: {}, callbackReady: false });
  first.publicConfig.changed = true;
  assert.deepEqual(integrationConnectInput.parse({}).publicConfig, {});
  const report = reportInput.parse({ name: '  Review  ' });
  assert.equal(report.name, 'Review');
  assert.deepEqual(report.branding, {});
  assert.equal(report.sections.length, 0);
  report.branding.companyName = 'Synthetic mutation';
  report.sections.push('Synthetic mutation');
  const nextReport = reportInput.parse({ name: 'Review' });
  assert.deepEqual(nextReport.branding, {});
  assert.deepEqual(nextReport.sections, []);
  const template = templateInput.parse({ name: 'Template' });
  template.tags.push('Synthetic mutation');
  assert.deepEqual(templateInput.parse({ name: 'Template' }).tags, []);
  const content = { count: 2, nested: { flag: true }, list: [null, 'text'] };
  assert.deepEqual(landingPageInput.parse({ title: 'Page', slug: 'page', content }).content, content);
  assert.deepEqual(taskInput.parse({ title: 'Task' }), { title: 'Task', status: 'todo', priority: 'medium', sortOrder: 0 });
  assert.throws(() => parsePhase31(offerInput, { name: '' }), error => {
    assert.equal((error as { code: string }).code, 'BRANDFORGE_INPUT_INVALID');
    assert.equal((error as { statusCode: number }).statusCode, 400);
    assert.equal((error as { field: string }).field, 'name');
    return true;
  });
  assert.equal(integrationConnectInput.safeParse({ secret: 'synthetic' }).success, false);
});

test('actual directory email schemas preserve trim, optional, nullable and partial semantics', () => {
  for (const email of ['person@example.test', 'person+tag@example.test', "o'brien@example.test"]) {
    const parsed = directory.contactSchema.parse({ firstName: '  Person  ', email: ` ${email} ` }) as { firstName: string; email: string };
    assert.equal(parsed.firstName, 'Person');
    assert.equal(parsed.email, email);
  }
  for (const email of ['person..name@example.test', '.person@example.test', 'person@example', 'person@-example.test']) assert.equal(directory.contactSchema.safeParse({ firstName: 'Person', email }).success, false);
  assert.ok(directory.contactSchema.safeParse({ firstName: 'Person', email: null }).success);
  assert.ok(directory.contactUpdateSchema.safeParse({ expectedVersion: 1 }).success);
});

test('actual query coercion and error paths remain stable with safe integer bounds', () => {
  const parsed = workspace.listQuery.parse({ limit: '30', offset: '2' }) as { limit: number; offset: number };
  assert.equal(parsed.limit, 30);
  assert.equal(parsed.offset, 2);
  assert.equal((workspace.listQuery.parse({}) as { limit: number }).limit, 30);
  for (const value of [{ limit: 101 }, { offset: -1 }, { search: 'x'.repeat(201) }, { unexpected: true }]) assert.equal(workspace.listQuery.safeParse(value).success, false);
  const invalid = messenger.updateMessageBody.safeParse({ body: 'message', expectedVersion: Number.MAX_SAFE_INTEGER + 1 });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(invalid.error.issues[0].path, ['expectedVersion']);
  assert.ok(messenger.updateMessageBody.safeParse({ body: 'message', expectedVersion: Number.MAX_SAFE_INTEGER }).success);
  assert.ok(messenger.deleteMessageQuery.safeParse({ expectedVersion: '1' }).success);
  assert.equal(messenger.sendMessageBody.safeParse({ body: 'message', clientMessageId: 'synthetic-1', tenantId: 'untrusted' }).success, false);
});

test('GHSA-mrhx-c7xc-m3w5: oversized collections stop before parsing elements', () => {
  let visits = 0;
  const element = z.string().superRefine(() => { visits += 1; });
  // Tiny inputs prove the early bound check without a resource-exhaustion payload.
  const cases = [
    { schema: z.array(element).max(1), input: ['a', 'b'] },
    { schema: z.map(element, element).max(1), input: new Map([['a', 'a'], ['b', 'b']]) },
    { schema: z.set(element).max(1), input: new Set(['a', 'b']) },
  ];
  for (const { schema, input } of cases) {
    visits = 0;
    const result = schema.safeParse(input);
    assert.equal(result.success, false);
    assert.equal(visits, 0);
    if (!result.success) assert.equal(result.error.issues[0].code, 'too_big');
  }
});
