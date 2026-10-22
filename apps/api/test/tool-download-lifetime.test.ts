import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { reserveToolDownload } from '../src/lib/tool-download-lifetime.js';

const raw = () => Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false }) as unknown as Pick<ServerResponse, 'once' | 'destroyed' | 'writableFinished'>;
test('aborted replies cannot release retained validation buffers before handler settlement', () => {
  const first = raw(), second = raw(), third = raw();
  const settleFirst = reserveToolDownload(first)!, settleSecond = reserveToolDownload(second)!;
  (first as unknown as EventEmitter).emit('close'); (second as unknown as EventEmitter).emit('close');
  assert.equal(reserveToolDownload(third), null);
  settleFirst(); const settleThird = reserveToolDownload(third); assert.ok(settleThird);
  assert.equal(reserveToolDownload(raw()), null);
  settleSecond(); settleThird(); (third as unknown as EventEmitter).emit('finish');
});
test('a settled handler retains its reservation while a slow response still owns its buffer', () => {
  const first = raw(), second = raw(), third = raw();
  const settleFirst = reserveToolDownload(first)!, settleSecond = reserveToolDownload(second)!;
  settleFirst(); settleSecond(); assert.equal(reserveToolDownload(third), null);
  (first as unknown as EventEmitter).emit('finish'); const settleThird = reserveToolDownload(third)!; assert.ok(settleThird);
  (first as unknown as EventEmitter).emit('close'); // Duplicate terminal events cannot double-release.
  assert.equal(reserveToolDownload(raw()), null);
  (second as unknown as EventEmitter).emit('finish'); settleThird(); (third as unknown as EventEmitter).emit('close');
});
