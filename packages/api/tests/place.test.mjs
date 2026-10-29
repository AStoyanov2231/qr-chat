import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../src/index.ts';

const id = '11111111-1111-4111-8111-111111111111';
const placeId = '22222222-2222-4222-8222-222222222222';
const uploadId = '33333333-3333-4333-8333-333333333333';
const photo = { uploadId, data: new Uint8Array([255, 216, 255, 1]).buffer };

function fixture(stored) {
  const calls = [];
  const replies = { rpc: () => ({ data: { id: placeId, ...stored }, error: null }) };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id } } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: stored, error: null }) }) }) }),
    rpc: async (name, args) => { calls.push([name, args]); return replies.rpc(); },
    storage: { from: (bucket) => ({
      upload: async (path) => { calls.push(['upload', bucket, path]); return { data: { path }, error: null }; },
      remove: async (paths) => { calls.push(['remove', bucket, paths]); return { data: [], error: null }; },
      getPublicUrl: (path) => ({ data: { publicUrl: path } }),
    }) },
  };
  return { api: createChatApi(client), calls, replies };
}
// The editor's snapshot is older than what another device saved since.
const snapshot = { id: placeId, menu_path: `${id}/old.pdf`, photo_path: null };

test('a save keeps the stored menu, not the snapshot, and removes only the stored photo it replaces', async () => {
  const f = fixture({ menu_path: `${id}/newer.pdf`, photo_path: `${id}/newer.jpg` });
  await f.api.updatePlace(snapshot, { name: 'Bar', link: '', photo });
  const [, args] = f.calls.find(([name]) => name === 'update_place');
  assert.equal(args.p_menu_path, `${id}/newer.pdf`);
  assert.equal(args.p_photo_path, `${id}/${uploadId}.jpg`);
  assert.deepEqual(f.calls.filter(([op]) => op === 'remove'), [['remove', 'venue-photos', [`${id}/newer.jpg`]]]);
});

test('a rejected save removes its upload; a lost response keeps it', async () => {
  const f = fixture({ menu_path: null, photo_path: null });
  f.replies.rpc = () => ({ data: null, error: { code: 'P0001', message: 'This place is no longer available' } });
  await assert.rejects(f.api.updatePlace(snapshot, { name: 'Bar', link: '', photo }));
  assert.deepEqual(f.calls.at(-1), ['remove', 'venue-photos', [`${id}/${uploadId}.jpg`]]);
  f.calls.length = 0;
  f.replies.rpc = () => ({ data: null, error: { code: '', message: 'FetchError: offline' } });
  await assert.rejects(f.api.updatePlace(snapshot, { name: 'Bar', link: '', photo }));
  assert.equal(f.calls.some(([op]) => op === 'remove'), false);
});

test('deleting a place removes its menu and photo', async () => {
  const f = fixture({ menu_path: `${id}/m.pdf`, photo_path: `${id}/p.jpg` });
  await f.api.deletePlace(placeId);
  assert.deepEqual(f.calls, [['delete_place', { p_place_id: placeId }], ['remove', 'venue-menus', [`${id}/m.pdf`]], ['remove', 'venue-photos', [`${id}/p.jpg`]]]);
});
