import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchChanges } from '../src/realtime.ts';
const id = '11111111-1111-4111-8111-111111111111';
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
function fakeClient() {
  const channels = [];
  return {
    channels,
    channel() {
      const channel = { filters: [], on(type, filter, handler) { if (type === 'system') this.system = handler; else { this.filters.push(filter); this.event = handler; } return this; }, subscribe(handler) { this.status = handler; return this; } };
      channels.push(channel); return channel;
    },
    async removeChannel(channel) { channel.removed = true; },
  };
}
test('filtered reconnect refetches missed data, retries, and cleans up', async () => {
  const client = fakeClient(); let server = ['one']; let cache = []; const states = [];
  const watcher = watchChanges(client, [{ table: 'group_messages', column: 'group_id', id }], async () => { cache = [...server]; }, (state) => states.push(state), { retryMs: 1, pollMs: 100000 });
  const first = client.channels[0];
  assert.equal(first.filters[0].filter, `group_id=eq.${id}`);
  first.status('SUBSCRIBED'); first.system({ extension: 'postgres_changes', status: 'ok' }); await tick(); assert.deepEqual(cache, ['one']);
  first.status('CHANNEL_ERROR'); server.push('missed'); await tick();
  assert.equal(first.removed, true);
  client.channels[1].status('SUBSCRIBED'); client.channels[1].system({ extension: 'postgres_changes', status: 'ok' }); await tick(); assert.deepEqual(cache, server);
  assert.ok(states.includes('reconnecting'));
  watcher.stop(); assert.equal(client.channels[1].removed, true);
  server.push('after-disposal'); client.channels[1].event(); await tick(); assert.equal(cache.length, 2);
});

test('events arriving during a refetch trigger one more reconciliation', async () => {
  const client = fakeClient(); let resolve; let reads = 0;
  const watcher = watchChanges(client, [{ table: 'group_memberships', column: 'user_id', id }], async () => { reads++; if (reads === 1) await new Promise((done) => { resolve = done; }); }, () => {}, { pollMs: 100000 });
  client.channels[0].status('SUBSCRIBED');
  client.channels[0].event(); client.channels[0].event(); resolve(); await tick();
  assert.equal(reads, 2); watcher.stop();
});

test('periodic recovery handles filtered deletes and expiration without events', async () => {
  const client = fakeClient(); let reads = 0;
  const watcher = watchChanges(client, [{ table: 'friend_connections', column: 'user_a_id', id }], async () => { reads++; if (reads === 1) throw new Error('offline'); }, () => {}, { pollMs: 5 });
  client.channels[0].status('SUBSCRIBED'); await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(reads > 1); watcher.stop();
});

test('Postgres readiness closes the channel-join snapshot gap', async () => {
  const client = fakeClient(); let server = ['one']; let cache = []; const states = [];
  const watcher = watchChanges(client, [{ table: 'group_messages', column: 'group_id', id }], async () => { cache = [...server]; }, (s) => states.push(s), { pollMs: 100000 });
  client.channels[0].status('SUBSCRIBED'); await tick();
  assert.equal(states.includes('connected'), false);
  server.push('between join and replication');
  client.channels[0].system({ extension: 'postgres_changes', status: 'ok' }); await tick();
  assert.deepEqual(cache, server); assert.equal(states.at(-1), 'connected');
  watcher.stop();
});
