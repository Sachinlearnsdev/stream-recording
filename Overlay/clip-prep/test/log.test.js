import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/log.js';

test('createLogger: stores entries with level + message', () => {
  const log = createLogger({ capacity: 10, silent: true });
  log.info('hello');
  log.warn('uh oh');
  const entries = log.recent(10);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, 'info');
  assert.equal(entries[0].message, 'hello');
  assert.equal(entries[1].level, 'warn');
});

test('createLogger: capacity bounds the buffer', () => {
  const log = createLogger({ capacity: 3, silent: true });
  for (let i = 0; i < 5; i++) log.info(`msg ${i}`);
  const entries = log.recent(10);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].message, 'msg 2');
  assert.equal(entries[2].message, 'msg 4');
});

test('createLogger: recent(N) limits returned entries', () => {
  const log = createLogger({ capacity: 100, silent: true });
  for (let i = 0; i < 10; i++) log.info(`msg ${i}`);
  const entries = log.recent(3);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].message, 'msg 7');
});
