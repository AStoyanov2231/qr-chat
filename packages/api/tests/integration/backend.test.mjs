import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createChatApi, createChatStore, createObservedFetch, watchChanges } from '../../src/index.ts';

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
    const requests = [];
    const client = createClient(url, key, { global: { fetch: createObservedFetch(fetch,request=>requests.push(request),()=> 'integration') }, auth: { persistSession: false, autoRefreshToken: false } });
    const { error, data } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    assert.equal(error, null, error?.message);
    assert.equal(data.user.id, user.id);
    const api = createChatApi(client);
    actors.push({ client, api, id: user.id, requests });
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
    const overview = await bob.api.overview();
    assert.equal(overview.userId,bob.id);
    assert.equal(overview.directPreviews[friendship].body,'private hello');
    assert.ok((await bob.api.access()).acceptedConnectionIds.includes(friendship));
    assert.equal((await bob.api.directMessages(friendship)).items[0].body, 'private hello');
    assert.equal((await eve.api.directMessages(friendship)).items.length, 0);
    await assert.rejects(eve.api.sendDirectMessage(friendship, 'outside'));
    await bob.api.removeFriend(friendship);
    assert.equal((await alice.api.overview()).directPreviews[friendship],undefined);
    assert.ok(!(await alice.api.access()).acceptedConnectionIds.includes(friendship));
    assert.equal((await alice.api.directMessages(friendship)).items.length, 0);
    await assert.rejects(alice.api.sendDirectMessage(friendship, 'removed'));
  });
  await t.test('avatar storage rejects writes and deletion outside the authenticated owner folder', async () => {
    const path = `${alice.id}/${randomUUID()}.jpg`;
    const bucket = alice.client.storage.from('avatars');
    // Storage authorization only; rendered image conversion is exercised by UI tests.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    assert.equal((await bucket.upload(path, bytes, { contentType: 'image/jpeg' })).error, null);
    try {
      const outsiderBucket = eve.client.storage.from('avatars');
      assert.ok((await outsiderBucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: true })).error);
      const removal = await outsiderBucket.remove([path]);
      assert.equal(removal.error, null);
      assert.equal(removal.data.length, 0, 'outsider deletion must not remove the owner object');
      const owned = await bucket.list(alice.id);
      assert.equal(owned.error, null);
      assert.ok(owned.data.some(object => `${alice.id}/${object.name}` === path));
      const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      assert.ok((await anonymous.storage.from('avatars').upload(`${alice.id}/${randomUUID()}.jpg`, bytes, { contentType: 'image/jpeg' })).error);
    } finally { assert.equal((await bucket.remove([path])).error, null); }
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
  await t.test('shared store delivers within two seconds, pauses and recovers without remote user lookups', async () => {
    const store = createChatStore(bob.api);
    const close = store.openGroup();
    try {
      await store.start();
      await eventually(()=>store.getState().connection==='connected','shared store must reach replication readiness');
      await delay(300);bob.requests.length=0;
      const started=Date.now();
      await alice.api.sendGroupMessage(group,'shared store live message');
      await eventually(()=>store.getState().snapshot.group?.messages.some(row=>row.text==='shared store live message'),'shared store must publish the live message');
      assert.ok(Date.now()-started<=2000,'controlled healthy delivery must stay within two seconds');
      assert.equal(bob.requests.filter(row=>row.category==='auth').length,0);
      await delay(300);bob.requests.length=0;
      await store.refresh('safety');
      assert.deepEqual(bob.requests.map(row=>row.category),['overview']);
      store.pause();bob.requests.length=0;
      await alice.api.sendGroupMessage(group,'shared store missed message');await delay(300);
      assert.equal(bob.requests.length,0);
      assert.equal(store.getState().snapshot.group,null);
      await store.start();
      assert.ok(store.getState().snapshot.group.messages.some(row=>row.text==='shared store missed message'));
    } finally {close();store.dispose();}
  });
  await t.test('profile edits converge in peer and same-account stores including loaded message authors', async () => {
    const peerStore = createChatStore(bob.api);
    const otherClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await otherClient.auth.signInWithPassword({ email: users[0].email, password: users[0].password });
    assert.equal(login.error, null);
    const sameAccountStore = createChatStore(createChatApi(otherClient));
    const close = peerStore.openGroup();
    try {
      await Promise.all([peerStore.start(), sameAccountStore.start()]);
      await eventually(() => peerStore.getState().connection === 'connected' && sameAccountStore.getState().connection === 'connected', 'profile subscriptions must be ready');
      await alice.api.saveProfile({ display_name: 'Updated live profile' });
      await eventually(() => sameAccountStore.getState().snapshot.session?.name === 'Updated live profile', 'same account must receive its profile edit');
      await eventually(() => peerStore.getState().snapshot.group?.members.some(member => member.id === alice.id && member.name === 'Updated live profile'), 'peer membership must receive profile edit');
      assert.ok(peerStore.getState().snapshot.group.messages.filter(message => message.user === alice.id).every(message => message.name === 'Updated live profile'), 'already loaded messages use the updated author');
    } finally {
      close();peerStore.dispose();sameAccountStore.dispose();
      await otherClient.removeAllChannels();
      await otherClient.auth.signOut({ scope: 'local' });
    }
  });
  await t.test('peer declines and friendship removal invalidate visible stores without polling', async () => {
    const connection = await alice.api.requestFriend(bob.id);
    const store = createChatStore(alice.api, { safetyMs: 120000 });
    try {
      await store.start();
      await eventually(() => store.getState().connection === 'connected', 'deletion subscriptions must be ready');
      assert.ok(store.getState().snapshot.friends.some(row => row.id === connection));
      await bob.api.removeFriend(connection);
      await eventually(() => !store.getState().snapshot.friends.some(row => row.id === connection), 'recipient decline must clear the sender without safety polling');
      const accepted = await alice.api.requestFriend(bob.id);
      await bob.api.acceptFriend(accepted);
      await eventually(() => store.getState().snapshot.friends.some(row => row.id === accepted && row.accepted_at), 'acceptance must converge');
      const close = store.openDirect(accepted);
      await alice.api.sendDirectMessage(accepted, 'removed friendship cache');
      await eventually(() => store.getState().directs[accepted]?.messages.length > 0, 'direct history must be loaded');
      await bob.api.removeFriend(accepted);
      await eventually(() => !store.getState().directs[accepted] && !store.getState().snapshot.friends.some(row => row.id === accepted), 'removal must discard loaded direct messages');
      close();
    } finally { store.dispose(); }
  });
  await t.test('local sign-out clears its session while another session for the account can refresh', async () => {
    const other = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await other.auth.signInWithPassword({ email: users[2].email, password: users[2].password });
    assert.equal(login.error, null);
    await createChatApi(other).signOut();
    assert.equal((await other.auth.getSession()).data.session, null);
    await assert.rejects(createChatApi(other).profile());
    const refreshed = await eve.client.auth.refreshSession();
    assert.equal(refreshed.error, null);
    assert.equal(refreshed.data.user.id, eve.id);
    assert.equal((await eve.api.profile()).id, eve.id);
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
