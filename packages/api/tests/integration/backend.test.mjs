import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createChatApi, watchChanges } from '../../src/index.ts';

// Supply three disposable, confirmed test users. No admin key or fixture creation here.
// The SQL authorization suite separately tests expiration and hostile direct writes.
const usersFile = process.env.QR_CHAT_TEST_USERS_FILE;
if (!usersFile) throw new Error('Set QR_CHAT_TEST_USERS_FILE to a JSON array of three disposable test users ({id,email,password}).');
const users = JSON.parse(readFileSync(usersFile, 'utf8'));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key && users.length >= 3, 'Public Supabase configuration and three test users are required');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) { if (await check()) return; await delay(100); }
  assert.fail(label);
}

test('Supabase clients share authorized data, serialize joins, paginate, and recover', { timeout: 180000 }, async (t) => {
  const actors = [];
  t.after(async () => {
    for (const { api, client } of actors) {
      for (const friend of await api.friends()) await api.removeFriend(friend.id).catch(() => {});
      await api.leaveGroup();
      await client.removeAllChannels();
    }
  });
  for (const user of users.slice(0, 3)) {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error, data } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    assert.equal(error, null, error?.message);
    assert.equal(data.user.id, user.id);
    const api = createChatApi(client);
    actors.push({ client, api, id: user.id });
    await api.saveProfile({ display_name: `QA ${actors.length}` });
  }
  const [alice, bob, eve] = actors;
  const code = `qrchat-integration-${alice.id}`;
  let group;
  await t.test('simultaneous joins resolve to one room', async () => {
    const rooms = await Promise.all([alice.api.joinGroup(code), bob.api.joinGroup(code)]);
    assert.equal(rooms[0].group_id, rooms[1].group_id);
    group = rooms[0].group_id;
    assert.equal((await alice.api.members(group)).length, 2);
    await Promise.all([alice.api.joinGroup(code), alice.api.joinGroup(`${code}-other`), alice.api.joinGroup(code)]);
    const membership = await alice.api.currentMembership();
    assert.ok(membership, 'exactly one membership survives serialized switches');
    await alice.api.joinGroup(code);
  });
  await t.test('RLS rejects outsider reads and sender spoofing', async () => {
    await assert.rejects(eve.api.sendGroupMessage(group, 'outsider'));
    assert.equal((await eve.api.groupMessages(group)).items.length, 0);
    const forged = await alice.client.from('group_messages').insert({ group_id: group, sender_id: bob.id, body: 'forged' });
    assert.ok(forged.error);
    assert.equal((await eve.client.from('profiles').select('id').eq('id', alice.id)).data.length, 0);
  });
  await t.test('shared messages paginate without overlap while new messages arrive', async () => {
    const inserted = await alice.client.from('group_messages').insert(Array.from({ length: 55 }, (_, i) => ({ group_id: group, sender_id: alice.id, body: `page message ${i}` })));
    assert.equal(inserted.error, null);
    const first = await bob.api.groupMessages(group);
    assert.equal(first.items.length, 50);
    await alice.api.sendGroupMessage(group, '<script>literal text</script>');
    const second = await bob.api.groupMessages(group, { before: first.nextCursor });
    assert.equal(second.items.length, 5);
    assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 55);
    assert.equal(second.nextCursor, null);
  });
  await t.test('friend acceptance gates DMs and removal revokes them', async () => {
    await assert.rejects(alice.api.requestFriend(eve.id));
    const friendship = await alice.api.requestFriend(bob.id);
    await assert.rejects(alice.api.acceptFriend(friendship));
    await assert.rejects(eve.api.acceptFriend(friendship));
    await assert.rejects(alice.api.sendDirectMessage(friendship, 'pending'));
    await bob.api.acceptFriend(friendship);
    await alice.api.sendDirectMessage(friendship, 'private hello');
    assert.equal((await bob.api.directMessages(friendship)).items[0].body, 'private hello');
    assert.equal((await eve.api.directMessages(friendship)).items.length, 0);
    await assert.rejects(eve.api.sendDirectMessage(friendship, 'outside'));
    await bob.api.removeFriend(friendship);
    assert.equal((await alice.api.directMessages(friendship)).items.length, 0);
    await assert.rejects(alice.api.sendDirectMessage(friendship, 'removed'));
  });
  await t.test('filtered Realtime delivers changes and refetches missed messages after reconnect', async () => {
    let bodies = []; let connected = false;
    // Long polling interval ensures live delivery actually comes from Realtime.
    const watcher = watchChanges(bob.client, [{ table: 'group_messages', column: 'group_id', id: group }], async () => {
      bodies = (await bob.api.groupMessages(group)).items.map((row) => row.body);
    }, (state) => { connected = state === 'connected'; }, { pollMs: 60000, retryMs: 200 });
    try {
      await eventually(() => connected, 'channel must subscribe');
      await alice.api.sendGroupMessage(group, 'live delivery');
      await eventually(() => bodies.includes('live delivery'), 'Realtime failed to deliver');
      bob.client.realtime.disconnect();
      connected = false;
      await alice.api.sendGroupMessage(group, 'while disconnected');
      bob.client.realtime.connect();
      await eventually(() => connected && bodies.includes('while disconnected'), 'reconnect must recover missed data');
    } finally { watcher.stop(); }
  });
  await t.test('leaving immediately revokes access and sign-out ends the session', async () => {
    await eve.api.leaveGroup();
    assert.equal(await eve.api.currentMembership(), null);
    await eve.api.signOut();
    await assert.rejects(eve.api.profile());
    // Remove signed-out actor from cleanup: it has no test rows or channels.
    actors.pop();
  });
});
