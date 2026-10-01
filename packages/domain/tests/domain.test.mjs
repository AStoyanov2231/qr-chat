import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unwrapQrCode,
  messageAge,
  groupAccessIndicator,
  directMessagePreview,
  directConversationTime,
  groupInitials,
  resolveQrPageName,
} from '../src/index.ts';

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

test('group access indicator displays a clamped 24-hour countdown without deciding membership access', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  assert.deepEqual(groupAccessIndicator('2026-10-01T18:00:00Z', now), {
    state: 'remaining', progress: 0.75, label: '18h left', accessibilityLabel: 'Your group access ends in 18 hours.',
  });
  assert.deepEqual(groupAccessIndicator('2026-10-01T00:17:00Z', now), {
    state: 'remaining', progress: 17 / 1440, label: '17m left', accessibilityLabel: 'Your group access ends in 17 minutes.',
  });
  assert.deepEqual(groupAccessIndicator('2026-10-01T00:00:59Z', now), {
    state: 'remaining', progress: 59 / 86_400, label: 'Under 1m left', accessibilityLabel: 'Your group access ends in less than one minute.',
  });
  assert.equal(groupAccessIndicator('2026-10-02T12:00:00Z', now).progress, 1, 'remaining time above 24 hours clamps at a full ring');
  assert.deepEqual(groupAccessIndicator(null, now), {
    state: 'unknown', progress: null, label: 'Time unavailable', accessibilityLabel: 'Group access time is unavailable.',
  });
  assert.equal(groupAccessIndicator('not-a-date', now).state, 'unknown');
  assert.equal(groupAccessIndicator('2026-10-01T18:00:00Z', Number.NaN).state, 'unknown');
  assert.deepEqual(groupAccessIndicator('2026-10-01T00:00:00Z', now), {
    state: 'ended', progress: 0, label: 'Access ended', accessibilityLabel: 'Your group access has ended.',
  });
  assert.equal(groupAccessIndicator('2026-09-30T23:59:59.999Z', now).state, 'ended', 'past expiries never show a live countdown');
});

test('direct message previews never claim an unknown sender is the current user', () => {
  assert.equal(directMessagePreview(null, 'self'), 'Say hello');
  assert.equal(directMessagePreview({ body: 'Hi', sender_id: 'self' }, 'self'), 'You: Hi');
  assert.equal(directMessagePreview({ body: 'Hi', sender_id: 'friend' }, 'self'), 'Hi');
  assert.equal(directMessagePreview({ body: 'Hi', sender_id: null }, null), 'Hi');
});

test('direct conversation time uses the first finite message or friendship timestamp', () => {
  const requestedAt = '2026-01-01T00:00:00Z';
  const acceptedAt = '2026-01-02T00:00:00Z';
  assert.equal(directConversationTime({ created_at: '2026-01-03T00:00:00Z' }, acceptedAt, requestedAt), Date.parse('2026-01-03T00:00:00Z'));
  assert.equal(directConversationTime({ created_at: 'invalid' }, acceptedAt, requestedAt), Date.parse(acceptedAt));
  assert.equal(directConversationTime(null, 'invalid', requestedAt), Date.parse(requestedAt));
  assert.equal(directConversationTime({ created_at: '1970-01-01T00:00:00Z' }, acceptedAt, requestedAt), 0);
  assert.equal(directConversationTime(null, 'invalid', 'invalid'), 0);
});

test('group initials use the first two Unicode word tokens', () => {
  assert.equal(groupInitials('Brew & Chat'), 'BC');
  assert.equal(groupInitials('Кафе № 2'), 'К2');
  assert.equal(groupInitials('   '), '');
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
