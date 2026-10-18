import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state } from './support/native-harness.mjs';

const { default: Business } = await import('../src/app/(app)/business.tsx');
const place = { id: 'p1', owner_id: 'me', group_id: 'g1', code: 'cafecentr2', name: 'My venue', link_url: null, menu_path: null, menu_url: null, created_at: '2026-10-18T00:00:00Z', deleted_at: null };

function businessApi() {
  const calls = [];
  state.auth.api = {
    ...state.auth.api,
    isBusiness: async () => true,
    places: async () => [place],
    updatePlace: async (...args) => { calls.push(args); return place; },
  };
  return calls;
}

test('a link without https:// is refused before anything is saved', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  const calls = businessApi();
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  await screen.type('Link', 'example.com');
  await screen.press('Save changes');
  assert.equal(calls.length, 0);
  assert.match(screen.text(), /Enter a link that starts with https:\/\//);
  await screen.type('Link', 'https://example.com');
  assert.doesNotMatch(screen.text(), /Enter a link that starts with/);
  await screen.press('Save changes');
  assert.equal(calls[0][1].link, 'https://example.com');
});

test('Share QR shares the venue QR as a PNG file', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  businessApi();
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  await screen.press('Share QR');
  const [uri, bytes] = state.written;
  assert.equal(uri, 'file:///cache/My-venue-qr.png');
  assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(state.shared[0], uri);
  assert.equal(state.shared[1].mimeType, 'image/png');
  assert.doesNotMatch(screen.text(), /Saving…/);
});
