import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCode } from '../src/lib/chat-view.ts';
test('QR keys remain case-sensitive; only our deep links are unwrapped', () => {
  const origin = 'https://qr.example';
  assert.equal(resolveCode(' room-a ', origin).codes[0], 'room-a');
  assert.equal(resolveCode('https://qr.example/chats?code=Room%26a', origin).codes[0], 'Room&a');
  assert.equal(resolveCode('https://other.example/?code=Room', origin).codes[0], 'https://other.example', 'queries never reach a group key');
  assert.equal(resolveCode('https://user:pw@Other.example/t/4/?ticket=9#x', origin).codes[0], 'https://other.example/t/4', 'credentials, query and fragment are dropped');
  for (const private_ of ['WIFI:T:WPA;S:home;P:secret;;', 'BEGIN:VCARD\nFN:Ann', 'mailto:ann@example.com', 'otpauth://totp/x?secret=1']) {
    assert.throws(() => resolveCode(private_, origin), private_);
  }
  assert.throws(() => resolveCode(' ', origin));
});
