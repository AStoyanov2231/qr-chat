import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySnapshot, loadChatSnapshot, loadDirectSnapshot } from '../src/snapshot.ts';

test('empty snapshots initialize direct previews', () => {
  assert.deepEqual(emptySnapshot.directPreviews, {});
});

function fixture() {
  const membership = { group_id: 'room', expires_at: '2027-01-01T00:00:00Z', qr_groups: { id: 'room', qr_codes: { code_key: 'Cafe-A', display_name: null } } };
  const calls = [];
  const directCalls = [];
  const message = (id) => ({ id, sender_id: 'self', profiles: { display_name: 'Andy' }, body: `message ${id}`, created_at: '2026-01-01T12:00:00Z' });
  const api = {
    userId: async () => 'self', profile: async () => ({ display_name: 'Andy', avatar_url: null }),
    currentMembership: async () => membership, friends: async () => [{ id: 'friend', accepted_at: 'yes' }],
    members: async () => [{ user_id: 'self', profiles: { display_name: 'Andy' } }],
    groupMessages: async (_id, { before }) => { calls.push(before); return before ? { items: [message(1)], nextCursor: null } : { items: [message(3), message(2)], nextCursor: 2 }; },
    directMessages: async (id, options = {}) => {
      directCalls.push([id, options]);
      return options.before ? { items: [message(1)], nextCursor: null } : { items: [message(3), message(2)], nextCursor: 2 };
    },
  };
  return { api, calls, directCalls, membership };
}
test('shared snapshot paginates chronologically and preserves membership independently of member list', async () => {
  const { api, calls } = fixture();
  api.members = async () => [];
  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 2 });
  assert.equal(snapshot.session.name, 'Andy');
  assert.equal(snapshot.group.venue.name, 'Unnamed chat');
  assert.equal(snapshot.group.venue.nameMissing, true);
  assert.deepEqual(snapshot.group.messages.map((m) => m.id), ['1', '2', '3']);
  assert.deepEqual(calls, [undefined, 2]);
  assert.equal(snapshot.group.nextCursor, null);
});
test('named QR snapshots expose the shared saved name without marking it missing', async () => {
  const { api, membership } = fixture();
  membership.qr_groups.qr_codes.display_name = 'Happy Cafe';
  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 1 });
  assert.equal(snapshot.group.venue.name, 'Happy Cafe');
  assert.equal(snapshot.group.venue.nameMissing, false);
});
test('switching group resets the old conversation pagination budget', async () => {
  const { api, calls } = fixture();
  await loadChatSnapshot(api, { groupId: 'previous', count: 8 });
  assert.deepEqual(calls, [undefined]);
});
test('profile photos are included in group members and message authors', async () => {
  const {api}=fixture();
  const url='https://project.supabase.co/storage/v1/object/public/avatars/self/photo.jpg';
  api.members=async()=>[{user_id:'self',profiles:{display_name:'Andy',avatar_url:url}}];
  api.groupMessages=async()=>({items:[{id:1,sender_id:'self',profiles:{display_name:'Andy',avatar_url:url},body:'Hi',created_at:'2026-09-30'}],nextCursor:null});
  const snapshot=await loadChatSnapshot(api,{groupId:'',count:1});
  assert.equal(snapshot.group.members[0].avatarUrl,url);
  assert.equal(snapshot.group.messages[0].avatarUrl,url);
});
test('leaving during a snapshot cannot publish the previous room messages', async () => {
  const { api, membership } = fixture();
  let call = 0;
  api.currentMembership = async () => ++call === 1 ? membership : null;
  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 1 });
  assert.equal(snapshot.group, null);
  assert.equal(snapshot.expiresAt, null);
});
test('group membership is rechecked after slow direct previews finish', async () => {
  const { api, membership } = fixture();
  let currentMembership = membership;
  api.currentMembership = async () => currentMembership;
  api.directMessages = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    currentMembership = null;
    return { items: [], nextCursor: null };
  };

  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 1 });

  assert.equal(snapshot.group, null);
  assert.equal(snapshot.expiresAt, null);
});
test('account switches cannot publish the previous identity snapshot', async () => {
  const { api } = fixture();
  let call = 0;
  api.userId = async () => ++call === 1 ? 'self' : 'other';
  await assert.rejects(loadChatSnapshot(api, { groupId: '', count: 1 }), /sign in again/);
});
test('chat snapshots fetch one newest DM only for accepted friends', async () => {
  const { api, directCalls } = fixture();
  api.friends = async () => [
    { id: 'accepted', accepted_at: '2026-01-01T00:00:00Z' },
    { id: 'pending', accepted_at: null },
  ];
  api.directMessages = async (id, options) => {
    directCalls.push([id, options]);
    return { items: id === 'accepted' ? [{ id: 3, body: 'newest' }, { id: 2, body: 'older' }] : [], nextCursor: null };
  };

  const snapshot = await loadChatSnapshot(api, { groupId: '', count: 1 });

  assert.deepEqual(directCalls, [['accepted', { limit: 1 }]]);
  assert.deepEqual(snapshot.directPreviews.accepted, { status: 'ready', message: { id: 3, body: 'newest' } });
  assert.equal(snapshot.directPreviews.pending, undefined);
});
test('preview errors are isolated and empty conversations are ready with a null message', async () => {
  const { api } = fixture();
  const friends = [
    { id: 'broken', accepted_at: '2026-01-01T00:00:00Z' },
    { id: 'empty', accepted_at: '2026-01-01T00:00:00Z' },
  ];
  api.friends = async () => friends;
  api.directMessages = async (id, options) => {
    assert.deepEqual(options, { limit: 1 });
    if (id === 'broken') throw new Error('temporary read failure');
    return { items: [], nextCursor: null };
  };

  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 1 });

  assert.deepEqual(snapshot.directPreviews, {
    broken: { status: 'error' },
    empty: { status: 'ready', message: null },
  });
  assert.equal(snapshot.group.venue.name, 'Unnamed chat');
  assert.deepEqual(snapshot.friends, friends);
});
test('removed friendships lose their preview during the final snapshot recheck', async () => {
  const { api } = fixture();
  let friendshipRead = 0;
  api.friends = async () => ++friendshipRead === 1 ? [{ id: 'removed', accepted_at: '2026-01-01T00:00:00Z' }] : [];
  api.directMessages = async () => ({ items: [{ id: 9, body: 'stale' }], nextCursor: null });

  const snapshot = await loadChatSnapshot(api, { groupId: '', count: 1 });

  assert.deepEqual(snapshot.friends, []);
  assert.deepEqual(snapshot.directPreviews, {});
});
test('friendships accepted during loading remain unknown until their preview is fetched', async () => {
  const { api } = fixture();
  let friendshipRead = 0;
  api.friends = async () => ++friendshipRead === 1
    ? [{ id: 'existing', accepted_at: 'yes' }]
    : [{ id: 'existing', accepted_at: 'yes' }, { id: 'new', accepted_at: 'yes' }];
  api.directMessages = async () => ({ items: [], nextCursor: null });

  const snapshot = await loadChatSnapshot(api, { groupId: '', count: 1 });

  assert.deepEqual(snapshot.directPreviews, {
    existing: { status: 'ready', message: null },
    new: { status: 'error' },
  });
});
test('friendship revalidation failure clears successful preview bodies and preserves the rest of the snapshot', async () => {
  const { api } = fixture();
  const friends = [{ id: 'accepted', accepted_at: 'yes' }];
  let friendshipRead = 0;
  api.friends = async () => {
    if (++friendshipRead === 1) return friends;
    throw new Error('friendship state unavailable');
  };
  api.directMessages = async () => ({
    items: [{ id: 9, body: 'private preview', sender_id: 'friend', created_at: '2026-01-01T00:00:00Z', friend_connection_id: 'accepted' }],
    nextCursor: null,
  });

  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 1 });

  assert.deepEqual(snapshot.directPreviews, { accepted: { status: 'error' } });
  assert.deepEqual(snapshot.friends, friends);
  assert.equal(snapshot.group.venue.name, 'Unnamed chat');
});
test('direct preview reads use bounded concurrency', async () => {
  const { api } = fixture();
  api.friends = async () => Array.from({ length: 9 }, (_, index) => ({ id: `friend-${index}`, accepted_at: 'yes' }));
  let active = 0;
  let maximum = 0;
  api.directMessages = async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return { items: [], nextCursor: null };
  };

  await loadChatSnapshot(api, { groupId: '', count: 1 });

  assert.equal(maximum, 4);
});
test('direct messages require an accepted friendship before and after loading', async () => {
  const { api } = fixture();
  const page = await loadDirectSnapshot(api, 'friend', 2);
  assert.deepEqual(page.messages.map((m) => m.id), [1, 2, 3]);
  let call = 0;
  api.friends = async () => ++call === 1 ? [{ id: 'friend', accepted_at: 'yes' }] : [];
  await assert.rejects(loadDirectSnapshot(api, 'friend'), /no longer available/);
  api.friends = async () => [{ id: 'friend', accepted_at: null }];
  api.directMessages = () => assert.fail('Pending friends must not load messages');
  await assert.rejects(loadDirectSnapshot(api, 'friend'), /no longer available/);
});
