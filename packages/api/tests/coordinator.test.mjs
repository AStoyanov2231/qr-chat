import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshCoordinator } from '../src/coordinator.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('simultaneous sources share one read and one trailing read preserves in-flight events', async () => {
  const queue = createRefreshCoordinator(1);
  let calls = 0; let release;
  const read = async () => { calls++; if (calls === 1) await new Promise(resolve => { release = resolve; }); };
  const pending = [queue.request('overview', read), queue.request('overview', read), queue.request('overview', read)];
  await tick(); assert.equal(calls, 1);
  pending.push(queue.request('overview', read), queue.request('overview', read));
  release(); await Promise.all(pending);
  assert.equal(calls, 2);
});
test('pause cancels queued work and a later session can schedule fresh work', async () => {
  const queue = createRefreshCoordinator(1); let calls = 0;
  const request = queue.request('overview', async () => { calls++; });
  const rejected = assert.rejects(request, /cancelled/); queue.cancel(); await rejected;
  await tick(); assert.equal(calls, 0);
  await queue.request('overview', async () => { calls++; }); assert.equal(calls, 1);
});
