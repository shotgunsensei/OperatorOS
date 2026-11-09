import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const apiRequire = createRequire(join(process.cwd(), 'apps', 'api', 'package.json'));
const { ImapFlow } = apiRequire('imapflow');
const { simpleParser } = apiRequire('mailparser');

test('maintained IMAP client preserves the adapter method contract without opening sockets', () => {
  assert.equal(apiRequire('imapflow/package.json').version, '1.7.8');
  for (const method of ['connect', 'getMailboxLock', 'status', 'search', 'fetchOne', 'messageFlagsAdd', 'logout', 'close']) {
    assert.equal(typeof ImapFlow.prototype[method], 'function', method);
  }
});

test('maintained MIME parser preserves bounded offline operational-email parsing', async () => {
  assert.equal(apiRequire('mailparser/package.json').version, '3.14.2');
  const message = await simpleParser(Buffer.from([
    'From: Operations <requester@example.invalid>',
    'To: Facilities <facilities@example.invalid>',
    'Subject: Synthetic equipment request',
    'Message-ID: <offline-regression@example.invalid>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="synthetic-boundary"',
    '',
    '--synthetic-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Synthetic operational message. No delivery requested.',
    '--synthetic-boundary',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Synthetic operational message. No delivery requested.</p>',
    '--synthetic-boundary--',
  ].join('\r\n')), { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  assert.equal(message.subject, 'Synthetic equipment request');
  assert.equal(message.from.value[0].address, 'requester@example.invalid');
  assert.match(message.text, /Synthetic operational message/);
  assert.equal(message.attachments.length, 0);
  assert.equal(message.messageId, '<offline-regression@example.invalid>');
});
