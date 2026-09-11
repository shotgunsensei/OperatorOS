import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import Fastify from 'fastify';
import { serveUI } from '../src/ui.js';

const hostile = '\"><img src=x onerror=alert(1)></script><script>alert(2)</script>\'&';

async function documentAt(path: string) {
  const app = Fastify();
  serveUI(app);
  try {
    const response = await app.inject({ method: 'GET', url: path });
    assert.equal(response.statusCode, 200);
    return response.body;
  } finally { await app.close(); }
}

test('legacy detail routes serialize URL parameters without script breakout', async () => {
  for (const route of ['/ui/workspace/', '/ui/task/']) {
    const body = await documentAt(route + encodeURIComponent(hostile));
    assert.ok(!body.includes(hostile));
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert.equal(scripts.length, 2);
    for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
    assert.ok(scripts[1].includes('\\u003c'));
  }
});

test('legacy lists render untrusted record fields as text and encode link IDs', async () => {
  for (const path of ['/ui', '/ui/tasks', '/ui/profiles']) {
    const body = await documentAt(path);
    const elements = new Map<string, { innerHTML: string; appendChild: () => void }>();
    const record = { id: hostile, gitUrl: hostile, gitRef: hostile, profileId: hostile, status: hostile, title: hostile, workspaceId: hostile, resultSummary: hostile, createdAt: '2026-09-09', name: hostile, image: hostile, description: hostile, verifyCommands: [{ name: hostile, label: hostile, commands: [hostile] }] };
    const context = vm.createContext({
      document: {
        getElementById(id: string) { if (!elements.has(id)) elements.set(id, { innerHTML: '', appendChild() {} }); return elements.get(id); },
        createElement() { return {}; },
      },
      fetch: async () => ({ json: async () => ({ workspaces: [record], tasks: [record], profiles: [record] }) }),
    });
    for (const match of body.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
    await new Promise(resolve => setImmediate(resolve));
    const markup = [...elements.values()].map(element => element.innerHTML).join('');
    assert.ok(markup.includes('&lt;img'), path);
    assert.doesNotMatch(markup, /<img|<script|onclick="runTask\('/);
    assert.ok(!markup.includes(hostile));
    if (path !== '/ui/profiles') assert.ok(markup.includes('%3Cimg'), path);
  }
});
