import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapQrCode, messageAge } from '../src/index.ts';

test('QR handoffs preserve case, unicode, and URL-like opaque keys across clients', () => {
  assert.equal(unwrapQrCode('https://chat.example/chats?code=Room%26A', 'https://chat.example'), 'Room&A');
  assert.equal(unwrapQrCode('https://other.example/?code=Room', 'https://chat.example'), 'https://other.example/?code=Room');
  assert.equal(unwrapQrCode('https://chat.example.attacker.test/?code=Room', 'https://chat.example'), 'https://chat.example.attacker.test/?code=Room');
  assert.equal(unwrapQrCode('Room-α', ''), 'Room-α');
  assert.equal(unwrapQrCode('https://chat.example/?code=', 'https://chat.example'), '');
});
test('message age handles boundaries and clocks ahead of the device', () => {
  const now = 200_000_000;
  for (const [minutes, expected] of [[-1, 'Now'], [0, 'Now'], [1, '1m'], [59, '59m'], [60, '1h'], [1439, '23h'], [1440, '1d']]) {
    assert.equal(messageAge(now - minutes * 60000, now), expected);
  }
});
