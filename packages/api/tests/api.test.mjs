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
