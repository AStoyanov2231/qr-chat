import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../src/index.ts';
import { displayNameSchema, messageBodySchema } from '@qr-chat/validation';

const id = '11111111-1111-4111-8111-111111111111';
test('hostile inputs are rejected before any network request', async () => {
  const client = new Proxy({}, { get() { throw new Error('Network must not be accessed'); } });
  const api = createChatApi(client);
  for (const code of ['', ' ', 'x'.repeat(513), '\0', null, { code: 'room' }]) await assert.rejects(api.joinGroup(code));
  for (const body of ['', '\n ', '\0', 'x'.repeat(4001), { body: 'x', sender_id: id }]) {
    await assert.rejects(api.sendGroupMessage(id, body));
    await assert.rejects(api.sendDirectMessage(id, body));
  }
  await assert.rejects(api.groupMessages('x),sender_id.neq.null'));
  await assert.rejects(api.groupMessages(id, { before: NaN }));
  await assert.rejects(api.groupMessages(id, { before: Number.MAX_SAFE_INTEGER + 1 }));
  await assert.rejects(api.groupMessages(id, { limit: 101 }));
  await assert.rejects(api.saveProfile({ display_name: 'A', id }));
  await assert.rejects(api.saveProfile({ display_name: 'A', avatar_path: `../${id}/x.jpg` }));
  assert.equal(messageBodySchema.parse('<script>alert(1)</script>'), '<script>alert(1)</script>');
  assert.equal(displayNameSchema.parse('  Alex  '), 'Alex');
});

test('join and leave each call only the authoritative transactional RPC', async () => {
  const calls = [];
  const api = createChatApi({ rpc: async (...args) => { calls.push(args); return { data: [{ group_id: id }], error: null }; } });
  await api.joinGroup(' Room-a ');
  await api.leaveGroup('22222222-2222-4222-8222-222222222222');
  assert.deepEqual(calls, [['join_qr_group', { p_code_key: 'Room-a' }], ['leave_qr_group', { p_group_id: '22222222-2222-4222-8222-222222222222' }]]);
});

test('resolveGroup sends only the code with the bearer token and never throws', async () => {
  const requests = [];
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'native-token', user: { id } } }, error: null }) } };
  let reply = () => Response.json({ name: 'Fanta Orange' });
  const api = createChatApi(client, { fetcher: async (url, options) => { requests.push([url, options]); return reply(); } });
  assert.equal(await api.resolveGroup(' gtin:5449000006271 '), 'Fanta Orange');
  const [url, options] = requests[0];
  assert.equal(url, '/api/qr-name');
  assert.equal(options.headers.authorization, 'Bearer native-token');
  assert.deepEqual(JSON.parse(options.body), { code: 'gtin:5449000006271' });
  reply = () => new Response('down', { status: 503 });
  assert.equal(await api.resolveGroup('gtin:5449000006271'), null);
  reply = () => { throw new TypeError('offline'); };
  assert.equal(await api.resolveGroup('gtin:5449000006271'), null);
  reply = () => Response.json({ name: 'x'.repeat(101) });
  assert.equal(await api.resolveGroup('gtin:5449000006271'), null, 'an invalid server name is rejected');
});

test('resolveGroup skips the server function for a group that already has a name', async () => {
  const requests = [];
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'native-token', user: { id } } }, error: null }) } };
  const api = createChatApi(client, { fetcher: async (url) => { requests.push(url); return Response.json({ name: 'Looked up' }); } });
  assert.equal(await api.resolveGroup('gtin:5449000006271', 'Fanta Orange'), 'Fanta Orange');
  assert.equal(requests.length, 0, 'a named group never calls /api/qr-name');
  assert.equal(await api.resolveGroup('gtin:5449000006271', null), 'Looked up');
  assert.equal(await api.resolveGroup('gtin:5449000006271', undefined), 'Looked up');
  assert.equal(requests.length, 2, 'unnamed groups still ask the server');
});

test('writes derive the sender from auth and exclude arbitrary write fields', async () => {
  let inserted;
  const api = createChatApi({
    auth: { getSession: async () => ({ data: { session: { user: { id } } }, error: null }) },
    from: () => ({ insert: (row) => { inserted = row; return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; } }),
  });
  await api.sendGroupMessage(id, ' hello ');
  assert.deepEqual(inserted, { group_id: id, sender_id: id, body: 'hello' });
});

test('pagination uses a strict cursor and a lookahead, including equal timestamps', async () => {
  const calls = [];
  const query = new Proxy({ then(resolve) { resolve({ data: [{ id: 9, profiles: null }, { id: 8, profiles: null }, { id: 7, profiles: null }], error: null }); } }, {
    get(target, key) { return key === 'then' ? target.then : (...args) => { calls.push([key, ...args]); return query; }; },
  });
  const api = createChatApi({ from: () => query });
  const page = await api.groupMessages(id, { before: 10, limit: 2 });
  assert.deepEqual(page, { items: [{ id: 9, profiles: null }, { id: 8, profiles: null }], nextCursor: 8 });
  assert.ok(calls.some(([op, field, value]) => op === 'lt' && field === 'id' && value === 10));
  assert.ok(calls.some(([op, value]) => op === 'limit' && value === 3));
});

test('failed sign-out surfaces the error; success removes channels', async () => {
  let removed = false;
  const client = { auth: { signOut: async () => ({ error: { message: 'offline' } }) }, removeAllChannels: async () => { removed = true; } };
  await assert.rejects(createChatApi(client).signOut(), /offline/);
  assert.equal(removed, false);
  client.auth.signOut = async () => ({ error: null });
  await createChatApi(client).signOut();
  assert.equal(removed, true);
});

test('blocking validates the connection and uses the authoritative RPC', async () => {
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: true, error: null }; } };
  const api = createChatApi(client);
  await assert.rejects(api.blockFriend('invalid-id'));
  assert.equal(calls.length, 0);
  await api.blockFriend(id);
  assert.deepEqual(calls, [['block_friend_connection', { p_connection_id: id }]]);
  client.rpc = async () => ({ data: false, error: null });
  await assert.rejects(api.blockFriend(id), /no longer available/);
  client.rpc = async () => ({ data: null, error: { message: 'Offline' } });
  await assert.rejects(api.blockFriend(id), /Offline/);
});

test('block, unblock and report validate ids and reasons before any request', async () => {
  const calls = [];
  const query = { delete() { calls.push(['delete']); return this; }, eq(...args) { calls.push(['eq', ...args]); return this; }, insert(row) { calls.push(['insert', row]); return this; }, then: (resolve) => resolve({ data: null, error: null }) };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id } } }, error: null }) },
    rpc: async (...args) => { calls.push(args); return { data: true, error: null }; },
    from: (table) => { calls.push(['from', table]); return query; },
  };
  const api = createChatApi(client);
  await assert.rejects(api.blockUser('x'));
  await assert.rejects(api.unblockUser('x'));
  await assert.rejects(api.report({ userId: id }, { reason: 'boring', details: '' }));
  await assert.rejects(api.report({ userId: id }, { reason: 'spam', details: 'x'.repeat(501) }));
  assert.equal(calls.length, 0);
  const peer = '22222222-2222-4222-8222-222222222222';
  await api.blockUser(peer);
  await api.unblockUser(peer);
  await api.report({ userId: peer }, { reason: 'harassment', details: '  ' });
  await api.report({ groupId: peer }, { reason: 'spam', details: ' Scam link ' });
  assert.deepEqual(calls, [
    ['block_user', { p_user_id: peer }],
    ['from', 'user_blocks'], ['delete'], ['eq', 'blocker_id', id], ['eq', 'blocked_id', peer],
    ['from', 'reports'], ['insert', { reported_user_id: peer, reason: 'harassment', details: null }],
    ['from', 'reports'], ['insert', { group_id: peer, reason: 'spam', details: 'Scam link' }],
  ]);
});

test('database rate limits surface as RATE_LIMITED with the server notice', async () => {
  const notice = 'You are sending messages too fast. Wait a moment and try again.';
  const api = createChatApi({
    auth: { getSession: async () => ({ data: { session: { user: { id } } }, error: null }) },
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: 'PT429', message: notice } }) }) }) }),
    rpc: async () => ({ data: null, error: { code: 'PT429', message: 'You have joined a lot of chats this hour. Try again later.' } }),
  });
  await assert.rejects(api.sendGroupMessage(id, 'hello'), (error) => error.code === 'RATE_LIMITED' && error.message === notice);
  await assert.rejects(api.joinGroup('Room-a'), (error) => error.code === 'RATE_LIMITED' && /joined a lot of chats/.test(error.message));
});

test('an active place photo stands in for its group image; other groups keep theirs', async () => {
  const url = (bucket, path) => ({ data: { publicUrl: `https://cdn.example/${bucket}/${path}` } });
  const client = {
    rpc: () => ({ then: (resolve) => resolve({ data: { userId: id, profile: null, friends: [], directPreviews: {}, unread: {}, memberships: [
      { group_id: 'a', groups: { id: 'a', image_path: 'u/site.jpg' }, place: { owner_id: id, link_url: null, menu_path: null, photo_path: `${id}/p.jpg` }, members: [], preview: null },
      { group_id: 'b', groups: { id: 'b', image_path: 'u/site.jpg' }, place: { owner_id: id, link_url: null, menu_path: null, photo_path: null }, members: [], preview: null },
      { group_id: 'c', groups: { id: 'c', image_path: 'u/site.jpg' }, place: null, members: [], preview: null },
    ] }, error: null }) }),
    storage: { from: (bucket) => ({ getPublicUrl: (path) => url(bucket, path) }) },
  };
  const { memberships } = await createChatApi(client).overview();
  assert.deepEqual(memberships.map((membership) => membership.groups.image_url), [`https://cdn.example/venue-photos/${id}/p.jpg`, 'https://cdn.example/group-images/u/site.jpg', 'https://cdn.example/group-images/u/site.jpg']);
});
