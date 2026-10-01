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
  await assert.rejects(api.saveProfile({ display_name: 'A', avatar_url: 'javascript:alert(1)' }));
  assert.equal(messageBodySchema.parse('<script>alert(1)</script>'), '<script>alert(1)</script>');
  assert.equal(displayNameSchema.parse('  Alex  '), 'Alex');
});

test('join and leave each call only the authoritative transactional RPC', async () => {
  const calls = [];
  const api = createChatApi({ rpc: async (...args) => { calls.push(args); return { data: [{ group_id: id }], error: null }; } });
  await api.joinGroup(' Room-a ');
  await api.leaveGroup();
  assert.deepEqual(calls, [['join_qr_group', { p_code_key: 'Room-a' }], ['leave_qr_group']]);
});

test('named joins use the required-name RPC and return the database winner', async () => {
  const calls = [];
  const api = createChatApi({ rpc: async (...args) => {
    calls.push(args);
    return { data: [{ group_id: id, display_name: 'Cafe' }], error: null };
  } });
  const membership = await api.joinNamedGroup(' Room-a ', ' Cafe ');
  assert.equal(membership.display_name, 'Cafe');
  assert.deepEqual(calls, [['join_named_qr_group', { p_code_key: 'Room-a', p_display_name: 'Cafe' }]]);
  await assert.rejects(api.joinNamedGroup('Room-a', '\u0085'));
});

test('name resolution prefers a shared saved name, otherwise returns only a bounded authenticated server suggestion', async () => {
  const calls = [];
  let savedName = 'Cafe';
  let fetched = false;
  let rpcSignal;
  const client = {
    rpc: (name, args) => {
      calls.push([name, args]);
      return { abortSignal(signal) { rpcSignal = signal; return Promise.resolve({ data: savedName, error: null }); } };
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 'native-token' } }, error: null }) },
  };
  const api = createChatApi(client, { fetcher: async (url, options) => {
    fetched = true;
    assert.equal(url, '/api/qr-name');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.authorization, 'Bearer native-token');
    assert.deepEqual(JSON.parse(options.body), { code: 'Room-a' });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ name: 'Happy Cafe' });
  } });

  assert.deepEqual(await api.resolveQrChatName('Room-a'), { kind: 'saved', name: 'Cafe' });
  assert.equal(fetched, false);
  assert.ok(rpcSignal instanceof AbortSignal);
  savedName = null;
  assert.deepEqual(await api.resolveQrChatName('Room-a'), { kind: 'suggested', name: 'Happy Cafe' });
  assert.equal(fetched, true);
  assert.deepEqual(calls.map(([name]) => name), ['get_qr_chat_name', 'get_qr_chat_name']);
});

test('name lookup caller cancellation bounds an unresolved saved-name RPC', async () => {
  let rpcSignal;
  const client = {
    rpc: () => ({ abortSignal(signal) { rpcSignal = signal; return new Promise(() => {}); } }),
  };
  const api = createChatApi(client, { fetcher: async () => assert.fail('Cancellation must stop before HTTP lookup') });
  const controller = new AbortController();
  const pending = api.resolveQrChatName('Room-a', controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  assert.deepEqual(await pending, { kind: 'missing' });
  assert.equal(rpcSignal.aborted, true);
});

test('writes derive the sender from auth and exclude arbitrary write fields', async () => {
  let inserted;
  const api = createChatApi({
    auth: { getUser: async () => ({ data: { user: { id } }, error: null }) },
    from: () => ({ insert: (row) => { inserted = row; return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; } }),
  });
  await api.sendGroupMessage(id, ' hello ');
  assert.deepEqual(inserted, { group_id: id, sender_id: id, body: 'hello' });
});

test('pagination uses a strict cursor and a lookahead, including equal timestamps', async () => {
  const calls = [];
  const query = new Proxy({ then(resolve) { resolve({ data: [{ id: 9 }, { id: 8 }, { id: 7 }], error: null }); } }, {
    get(target, key) { return key === 'then' ? target.then : (...args) => { calls.push([key, ...args]); return query; }; },
  });
  const api = createChatApi({ from: () => query });
  const page = await api.groupMessages(id, { before: 10, limit: 2 });
  assert.deepEqual(page, { items: [{ id: 9 }, { id: 8 }], nextCursor: 8 });
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
