import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapQrCode, messageAge, resolveQrPageName } from '../src/index.ts';

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

test('QR page metadata resolves venue titles while rejecting generic, technical, and conflicting names', () => {
  const metadata = (overrides = {}) => ({
    structuredData: [], openGraphTitles: [], pageTitles: [], siteNames: [], ...overrides,
  });
  assert.equal(resolveQrPageName(metadata({
    openGraphTitles: ['Happy - Menu'], siteNames: ['Toast'],
  })), 'Happy');
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['Menu | Happy'] })), 'Happy');
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['Home page'] })), null);
  assert.equal(resolveQrPageName(metadata({ openGraphTitles: ['https://happy.example/menu'] })), null);
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['happy.example/menu'] })), null);
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['84291'] })), null);
  assert.equal(resolveQrPageName(metadata({
    openGraphTitles: ['Happy Cafe'], pageTitles: ['Different Place'],
  })), null);
  assert.equal(resolveQrPageName(metadata({
    structuredData: [{ types: ['https://schema.org/Restaurant'], names: ['Happy Cafe'] }],
    openGraphTitles: ['Happy Cafe - Menu'],
  })), 'Happy Cafe');
});
