import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCode } from '../src/lib/chat-view.ts';
test('QR keys remain case-sensitive; only our deep links are unwrapped', () => {
  const origin = 'https://qr.example';
  assert.equal(resolveCode(' room-a ', origin).codes[0], 'room-a');
  assert.equal(resolveCode('https://qr.example/chats?code=Room%26a', origin).codes[0], 'Room&a');
  assert.equal(resolveCode('https://other.example/?code=Room', origin).codes[0], 'https://other.example/?code=Room');
  assert.throws(() => resolveCode(' ', origin));
});
