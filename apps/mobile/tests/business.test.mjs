import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state } from './support/native-harness.mjs';

const { default: Business } = await import('../src/app/(app)/business.tsx');
const place = { id: 'p1', owner_id: 'me', group_id: 'g1', code: 'cafecentr2', name: 'My venue', link_url: null, menu_path: null, menu_url: null, photo_path: null, photo_url: null, created_at: '2026-10-18T00:00:00Z', deleted_at: null };

function businessApi(places = [place]) {
  const calls = [];
  state.auth.api = {
    ...state.auth.api,
    isBusiness: async () => true,
    places: async () => places,
    createPlace: async () => place,
    updatePlace: async (...args) => { calls.push(args); return place; },
  };
  return calls;
}

test('a link without https:// is refused before anything is saved', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  const calls = businessApi();
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  await screen.type('Menu link', 'example.com');
  await screen.press('Save changes');
  assert.equal(calls.length, 0);
  assert.match(screen.text(), /Enter a link that starts with https:\/\//);
  await screen.type('Menu link', 'https://example.com');
  assert.doesNotMatch(screen.text(), /Enter a link that starts with/);
  await screen.press('Save changes');
  assert.deepEqual(calls[0][1], { name: 'My venue', link: 'https://example.com', menu: null, photo: undefined });
});

test('the menu is a link or a PDF: the toggle shows only the active option', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  const calls = businessApi();
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  const shown = (label) => screen.root.findAll((node) => node.props?.accessibilityLabel === label).length > 0;
  assert.equal(shown('Menu link'), true);
  assert.equal(shown('Upload menu (PDF)'), false);
  await screen.type('Menu link', 'https://example.com');
  await screen.press('PDF');
  assert.equal(shown('Menu link'), false);
  assert.equal(shown('Upload menu (PDF)'), true);
  assert.match(screen.text(), /max 10 MB/);
  await screen.press('Link');
  assert.doesNotMatch(screen.text(), /max 10 MB/);
  assert.equal(shown('Menu link'), true);
  await screen.press('PDF');
  await screen.type('Place name', 'My bar');
  await screen.press('Save changes');
  assert.deepEqual(calls[0][1], { name: 'My bar', link: '', menu: undefined, photo: undefined });
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

test('Save changes stays disabled until something changes', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  businessApi();
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  await assert.rejects(screen.press('Save changes'), /Disabled button/);
  await screen.type('Place name', 'My bar');
  await screen.type('Place name', 'My venue');
  await assert.rejects(screen.press('Save changes'), /Disabled button/);
  await screen.type('Menu link', 'https://example.com');
  await screen.press('Save changes');
});

test('a picked photo is passed when a place is created', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  const calls = businessApi();
  const screen = await render(t, Business);
  await screen.press('Add a place');
  assert.doesNotMatch(screen.text(), /Remove photo/);
  await screen.type('Place name', 'New bar');
  state.pickerResult = { canceled: false, assets: [{ uri: 'file:///source.png', width: 1200, height: 800 }] };
  await screen.press('Add place photo');
  assert.match(screen.text(), /Remove photo/);
  await screen.press('Create place');
  const { photo } = calls[0][1];
  assert.equal(photo.uploadId, '22222222-2222-4222-8222-222222222222');
  assert.equal(photo.data.byteLength, 4);
});

test('removing an existing photo is only sent on Save changes', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  const calls = businessApi([{ ...place, photo_path: 'me/p.jpg', photo_url: 'https://cdn.example/p.jpg' }]);
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  assert.equal(calls.length, 0);
  await screen.press('Remove photo');
  assert.doesNotMatch(screen.text(), /Remove photo/);
  await screen.press('Save changes');
  assert.equal(calls[0][1].photo, null);
});

test('a saved PDF opens from the View button inside the Replace PDF pill', async (t) => {
  reset(); process.env.EXPO_OS = 'ios';
  const calls = businessApi([{ ...place, menu_path: 'me/m.pdf', menu_url: 'https://cdn.example/m.pdf' }]);
  const screen = await render(t, Business);
  await screen.press('Edit My venue');
  assert.match(screen.text(), /Replace PDF/);
  await screen.press('View current menu');
  assert.deepEqual(state.opened, ['https://cdn.example/m.pdf']);
  assert.equal(calls.length, 0);
});
