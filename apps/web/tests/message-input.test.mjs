import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { nearBottom, sendsOnEnter } from '../src/lib/message-input.ts';

test('Enter sends; Shift+Enter and IME composition do not', () => {
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: false }), true);
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: true }), false);
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true } }), false);
  assert.equal(sendsOnEnter({ key: 'a', shiftKey: false }), false);
});

test('only a reader near the end follows new messages', () => {
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 450 }), true);
  assert.equal(nearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 450 }), false);
});

test('message text keeps its line breaks', async () => {
  const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.message-stream article p \{\s*white-space: pre-wrap;/);
});
