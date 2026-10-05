import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChatSnapshot, loadDirectSnapshot, emptySnapshot } from '../src/snapshot.ts';
const row = id => ({ id, sender_id: 'self', profiles: { display_name: 'Andy', avatar_url: '/photo' }, body: `message ${id}`, created_at: '2026-01-01T12:00:00Z' });
function fixture(count = 1) {
  const calls = [];
  const overview = { userId: 'self', profile: { display_name: 'Andy' }, membership: { group_id: 'room', expires_at: '2027-01-01', groups: { id: 'room', code_key: 'Cafe', name: null } }, members: [], friends: Array.from({ length: count }, (_, i) => ({ id: `friend-${i}`, accepted_at: 'yes' })), directPreviews: {}, groupHeadIds: [3, 2] };
  const access = { userId: 'self', membership: overview.membership, acceptedConnectionIds: overview.friends.map(friend => friend.id) };
  const api = { userId: async () => 'self', overview: async () => { calls.push('overview'); return overview; }, access: async () => { calls.push('access'); return access; }, groupMessages: async (_id, { before }) => { calls.push(before); return before ? { items: [row(1)], nextCursor: null } : { items: [row(3), row(2)], nextCursor: 2 }; }, directMessages: async (_id, options) => api.groupMessages(_id, options) };
  return { api, overview, access, calls };
}
test('bootstrap batches previews for 0, 1, and 100 friends with no per-friend queries', async () => {
  for (const count of [0, 1, 100]) {
    const { api, calls } = fixture(count); const snapshot = await loadChatSnapshot(api, { groupId: '', count: 1 });
    assert.deepEqual(calls, ['overview', undefined, 'access']);
    assert.equal(Object.keys(snapshot.directPreviews).length, count);
    assert.equal(snapshot.group.venue.nameMissing, true);
    assert.equal(snapshot.group.messages[0].avatarUrl, '/photo');
  }
  assert.deepEqual(emptySnapshot.directPreviews, {});
});
test('bootstrap preserves chronology and group switching resets pagination', async () => {
  const { api } = fixture();
  assert.deepEqual((await loadChatSnapshot(api, { groupId: 'room', count: 2 })).group.messages.map(row => row.id), ['1', '2', '3']);
  assert.deepEqual((await loadChatSnapshot(api, { groupId: 'other', count: 8 })).group.messages.map(row => row.id), ['2', '3']);
});
test('membership and friendship removed during loading cannot publish private bodies', async () => {
  const { api, access } = fixture(); api.groupMessages = async () => { access.membership = null; access.acceptedConnectionIds = []; return { items: [row(1)], nextCursor: null }; };
  const snapshot = await loadChatSnapshot(api, { groupId: '', count: 1 });
  assert.equal(snapshot.group, null); assert.deepEqual(snapshot.directPreviews, {}); assert.deepEqual(snapshot.friends, []);
});
test('account switches and access-check failures reject private snapshots', async () => {
  const { api, access } = fixture(); access.userId = 'other';
  await assert.rejects(loadChatSnapshot(api, { groupId: '', count: 1 }), /sign in/);
  api.access = async () => { throw new Error('Offline'); };
  await assert.rejects(loadChatSnapshot(api, { groupId: '', count: 1 }), /Offline/);
});
test('direct reads require accepted access before and after message loading', async () => {
  const { api, access } = fixture();
  assert.deepEqual((await loadDirectSnapshot(api, 'friend-0', 2)).messages.map(row => row.id), [1, 2, 3]);
  api.directMessages = async () => { access.acceptedConnectionIds = []; return { items: [row(1)], nextCursor: null }; };
  await assert.rejects(loadDirectSnapshot(api, 'friend-0'), /no longer available/);
});
