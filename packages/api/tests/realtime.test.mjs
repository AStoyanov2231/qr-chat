import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topic, watchChanges } from '../src/realtime.ts';
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const me = '33333333-3333-4333-8333-333333333333';
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
function fakeClient() {
  const channels = [];
  const client = {
    channels,
    sockets: 1,
    getChannels() { return channels.filter((channel) => !channel.removed); },
    channel(name, params) {
      const channel = { topic: `realtime:${name}`, name, params, on(type, filter, handler) { this.type = type; this.filter = filter; this.event = (payload) => handler({ payload }); return this; }, subscribe(handler) { this.status = handler; return this; } };
      channels.push(channel); return channel;
    },
    async removeChannel(channel) { channel.removed = true; },
  };
  return client;
}
const live = (channel) => channel.status('SUBSCRIBED');

test('one private broadcast channel per topic shares the client socket and is ready once all join', async () => {
  const client = fakeClient(); const states = []; let reads = 0;
  const watcher = watchChanges(client, [topic('user', me), topic('group', id), topic('group', other)], async () => { reads++; }, (state) => states.push(state), { pollMs: 100000 });
  assert.deepEqual(client.channels.map((channel) => channel.name), [`user:${me}`, `group:${id}`, `group:${other}`]);
  assert.ok(client.channels.every((channel) => channel.params.config.private === true && channel.type === 'broadcast' && channel.filter.event === 'change'));
  live(client.channels[0]); live(client.channels[1]); await tick();
  assert.equal(reads, 0, 'no refetch until every topic is live');
  assert.notEqual(states.at(-1), 'connected');
  live(client.channels[2]); await tick();
  assert.equal(reads, 1, 'one refetch closes the join gap');
  assert.equal(states.at(-1), 'connected');
  watcher.stop();
  assert.ok(client.channels.every((channel) => channel.removed));
});

test('broadcast payloads become change hints routed by group id', async () => {
  const client = fakeClient(); const events = [];
  const watcher = watchChanges(client, [topic('group', id)], async () => {}, () => {}, { onChange: (event) => events.push(event), coordinated: true });
  live(client.channels[0]);
  client.channels[0].event({ table: 'messages', type: 'INSERT', id: 42, group_id: id });
  client.channels[0].event({ table: 'group_members', type: 'DELETE', group_id: id });
  client.channels[0].event({ table: 'messages', type: 'INSERT', id: 'not-a-number' });
  assert.deepEqual(events, [
    { table: 'messages', eventType: 'INSERT', id: 42, filterId: id },
    { table: 'group_members', eventType: 'DELETE', id: null, filterId: id },
    { table: 'messages', eventType: 'INSERT', id: null, filterId: undefined },
  ]);
  watcher.stop();
  client.channels[0].event({ table: 'messages', type: 'INSERT', id: 43, group_id: id });
  assert.equal(events.length, 3, 'no events after stop');
});

test('topics are validated and capped at the 100-channel connection limit', () => {
  assert.throws(() => watchChanges(fakeClient(), ['group:not-a-uuid'], async () => {}, () => {}));
  const client = fakeClient();
  const many = Array.from({ length: 120 }, (_, index) => topic('group', `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`));
  const watcher = watchChanges(client, many, async () => {}, () => {});
  assert.equal(client.channels.length, 100);
  watcher.stop();
});

test('update joins new topics and leaves dropped ones without touching the rest', async () => {
  const client = fakeClient(); const states = []; let reads = 0;
  const watcher = watchChanges(client, [topic('user', me), topic('group', id)], async () => { reads++; }, (state) => states.push(state), { coordinated: true });
  client.channels.forEach(live); await tick();
  const [user, group] = client.channels;
  const before = states.length;
  watcher.update([topic('user', me), topic('group', other)]);
  assert.ok(!states.slice(before).includes('connecting'), 'joining one more topic does not flash a reconnect');
  assert.equal(group.removed, true, 'the dropped group is left');
  assert.equal(user.removed, undefined, 'the user channel stays');
  const added = client.channels.at(-1);
  assert.equal(added.name, `group:${other}`);
  assert.equal(client.channels.length, 3, 'nothing else is recreated');
  live(added); await tick();
  assert.equal(reads, 2, 'a newly joined topic triggers one refetch');
  assert.equal(states.at(-1), 'connected');
  watcher.stop();
});

test('a reused topic waits for its closing channel before joining again', async () => {
  const client = fakeClient();
  const first = watchChanges(client, [topic('group', id)], async () => {}, () => {});
  const closing = client.channels[0];
  client.removeChannel = async () => {};  // leave not yet acknowledged
  first.stop();
  const second = watchChanges(client, [topic('group', id)], async () => {}, () => {});
  assert.equal(client.channels.length, 1, 'no join while the old channel is still listed');
  closing.removed = true;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(client.channels.length, 2, 'joins once the old channel is gone');
  second.stop();
});

test('a channel error leaves every topic, retries and refetches missed data', async () => {
  const client = fakeClient(); let server = ['one']; let cache = []; const states = [];
  const watcher = watchChanges(client, [topic('user', me), topic('group', id)], async () => { cache = [...server]; }, (state) => states.push(state), { retryMs: 1, pollMs: 100000 });
  client.channels.forEach(live); await tick(); assert.deepEqual(cache, ['one']);
  client.channels[1].status('CHANNEL_ERROR'); server.push('missed'); await tick();
  assert.ok(client.channels.slice(0, 2).every((channel) => channel.removed), 'all topics are left together');
  client.channels.slice(2).forEach(live); await tick();
  assert.deepEqual(cache, server);
  assert.ok(states.includes('reconnecting'));
  watcher.stop();
});

test('periodic recovery handles server-side deletes and expiration without events', async () => {
  const client = fakeClient(); let reads = 0;
  const watcher = watchChanges(client, [topic('user', me)], async () => { reads++; if (reads === 1) throw new Error('offline'); }, () => {}, { pollMs: 5 });
  live(client.channels[0]); await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(reads > 1); watcher.stop();
});

test('each realtime refusal starts polling at about 5s and a successful resubscribe stops it', async (t) => {
  for (const reason of ['too_many_connections', 'too_many_joins', 'tenant_events']) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const client = fakeClient(); let polls = 0; const states = [];
    const watcher = watchChanges(client, [topic('group', id)], async () => {}, (state) => states.push(state), { fallbackMs: 5000, onPoll: () => { polls++; }, random: () => 0.5 });
    client.channels[0].status('CHANNEL_ERROR', new Error(`Realtime refused: ${reason}`));
    assert.equal(states.at(-1), 'polling', reason);
    t.mock.timers.tick(4999); assert.equal(polls, 0, reason);
    t.mock.timers.tick(1); assert.equal(polls, 1, reason);
    t.mock.timers.tick(5000); assert.equal(polls, 2, reason);
    // The retry still runs; once the channel is ready again polling stops.
    const next = client.channels.at(-1); assert.notEqual(next, client.channels[0]);
    live(next);
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(20000); assert.equal(polls, 2, `${reason}: no polling after resubscribe`);
    assert.equal(states.at(-1), 'connected', reason);
    watcher.stop(); t.mock.timers.reset();
  }
});

test('one transient drop retries without polling; a repeated drop polls once, never twice', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const client = fakeClient(); let polls = 0; const states = [];
  const watcher = watchChanges(client, [topic('group', id)], async () => {}, (state) => states.push(state), { fallbackMs: 5000, retryMs: 1000, onPoll: () => { polls++; }, random: () => 0.5 });
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
