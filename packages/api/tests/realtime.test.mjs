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
  const watcher = watchChanges(client, [{ table: 'messages', column: 'group_id', id }], async () => { cache = [...server]; }, (state) => states.push(state), { retryMs: 1, pollMs: 100000 });
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
  const watcher = watchChanges(client, [{ table: 'group_members', column: 'user_id', id }], async () => { reads++; if (reads === 1) await new Promise((done) => { resolve = done; }); }, () => {}, { pollMs: 100000 });
  client.channels[0].status('SUBSCRIBED');
  client.channels[0].event(); client.channels[0].event(); resolve(); await tick();
  assert.equal(reads, 2); watcher.stop();
});

test('periodic recovery handles filtered deletes and expiration without events', async () => {
  const client = fakeClient(); let reads = 0;
  const watcher = watchChanges(client, [{ table: 'friendships', column: 'user_a_id', id }], async () => { reads++; if (reads === 1) throw new Error('offline'); }, () => {}, { pollMs: 5 });
  client.channels[0].status('SUBSCRIBED'); await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(reads > 1); watcher.stop();
});

test('Postgres readiness closes the channel-join snapshot gap', async () => {
  const client = fakeClient(); let server = ['one']; let cache = []; const states = [];
  const watcher = watchChanges(client, [{ table: 'messages', column: 'group_id', id }], async () => { cache = [...server]; }, (s) => states.push(s), { pollMs: 100000 });
  client.channels[0].status('SUBSCRIBED'); await tick();
  assert.equal(states.includes('connected'), false);
  server.push('between join and replication');
  client.channels[0].system({ extension: 'postgres_changes', status: 'ok' }); await tick();
  assert.deepEqual(cache, server); assert.equal(states.at(-1), 'connected');
  watcher.stop();
});

test('each realtime refusal starts polling at about 5s and a successful resubscribe stops it', async (t) => {
  for (const reason of ['too_many_connections', 'too_many_joins', 'tenant_events']) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const client = fakeClient(); let polls = 0; const states = [];
    const watcher = watchChanges(client, [{ table: 'messages', column: 'group_id', id }], async () => {}, (state) => states.push(state), { fallbackMs: 5000, onPoll: () => { polls++; }, random: () => 0.5 });
    client.channels[0].status('CHANNEL_ERROR', new Error(`Realtime refused: ${reason}`));
    assert.equal(states.at(-1), 'polling', reason);
    t.mock.timers.tick(4999); assert.equal(polls, 0, reason);
    t.mock.timers.tick(1); assert.equal(polls, 1, reason);
    t.mock.timers.tick(5000); assert.equal(polls, 2, reason);
    // The retry still runs; once the channel is ready again polling stops.
    const next = client.channels.at(-1); assert.notEqual(next, client.channels[0]);
    next.status('SUBSCRIBED'); next.system({ extension: 'postgres_changes', status: 'ok' });
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(20000); assert.equal(polls, 2, `${reason}: no polling after resubscribe`);
    assert.equal(states.at(-1), 'connected', reason);
    watcher.stop(); t.mock.timers.reset();
  }
});

test('one transient drop retries without polling; a repeated drop polls once, never twice', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const client = fakeClient(); let polls = 0; const states = [];
  const watcher = watchChanges(client, [{ table: 'messages', column: 'group_id', id }], async () => {}, (state) => states.push(state), { fallbackMs: 5000, retryMs: 1000, onPoll: () => { polls++; }, random: () => 0.5 });
  client.channels[0].status('TIMED_OUT');
  assert.equal(states.includes('polling'), false, 'a single drop only reconnects');
  t.mock.timers.tick(1000);
  client.channels[1].status('CHANNEL_ERROR');
  assert.equal(states.at(-1), 'polling', 'a repeated drop falls back to polling');
  t.mock.timers.tick(2000);
  client.channels[2].status('TIMED_OUT');
  t.mock.timers.tick(5000);
  assert.equal(polls, 1, 'repeated failures keep a single polling timer');
  watcher.stop();
  t.mock.timers.tick(60000);
  assert.equal(polls, 1, 'stop clears the polling timer');
});
