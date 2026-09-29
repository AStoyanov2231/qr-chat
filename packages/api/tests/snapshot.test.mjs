import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChatSnapshot, loadDirectSnapshot } from '../src/snapshot.ts';

function fixture() {
  const membership = { group_id: 'room', expires_at: '2027-01-01T00:00:00Z', qr_groups: { id: 'room', qr_codes: { code_key: 'Cafe-A', display_name: null } } };
  const calls = [];
  const message = (id) => ({ id, sender_id: 'self', profiles: { display_name: 'Andy' }, body: `message ${id}`, created_at: '2026-01-01T12:00:00Z' });
  const api = {
    userId: async () => 'self', profile: async () => ({ display_name: 'Andy', avatar_url: null }),
    currentMembership: async () => membership, friends: async () => [{ id: 'friend', accepted_at: 'yes' }],
    members: async () => [{ user_id: 'self', profiles: { display_name: 'Andy' } }],
    groupMessages: async (_id, { before }) => { calls.push(before); return before ? { items: [message(1)], nextCursor: null } : { items: [message(3), message(2)], nextCursor: 2 }; },
    directMessages: async (_id, { before }) => before ? { items: [message(1)], nextCursor: null } : { items: [message(3), message(2)], nextCursor: 2 },
  };
  return { api, calls, membership };
}
test('shared snapshot paginates chronologically and preserves membership independently of member list', async () => {
  const { api, calls } = fixture();
  api.members = async () => [];
  const snapshot = await loadChatSnapshot(api, { groupId: 'room', count: 2 });
  assert.equal(snapshot.session.name, 'Andy');
  assert.deepEqual(snapshot.group.messages.map((m) => m.id), ['1', '2', '3']);
  assert.deepEqual(calls, [undefined, 2]);
  assert.equal(snapshot.group.nextCursor, null);
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
test('account switches cannot publish the previous identity snapshot', async () => {
  const { api } = fixture();
  let call = 0;
  api.userId = async () => ++call === 1 ? 'self' : 'other';
  await assert.rejects(loadChatSnapshot(api, { groupId: '', count: 1 }), /sign in again/);
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
