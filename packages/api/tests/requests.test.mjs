import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObservedFetch } from '../src/requests.ts';

test('request diagnostics are opt-in and contain only bounded request metadata', async () => {
  const observations = [];
  const fetcher = async () => new Response('private message', { headers: { 'content-length': '15' } });
  assert.equal(createObservedFetch(fetcher), fetcher);
  const observed = createObservedFetch(fetcher, event => observations.push(event), () => 'resume');
  const response = await observed('https://project.example/rest/v1/group_messages?sender_id=secret-id', { headers: { authorization: 'Bearer secret-token' } });
  assert.equal(await response.text(), 'private message');
  assert.deepEqual(observations[0], { category: 'messages', trigger: 'resume', durationMs: observations[0].durationMs, status: 200, responseBytes: 15 });
  assert.doesNotMatch(JSON.stringify(observations), /secret|private message|project/);
  await observed('/api/qr-name');
  assert.equal(observations[1].category, 'metadata');
});

test('diagnostics preserve failed requests and an observer cannot break delivery', async () => {
  let observation;
  const observed = createObservedFetch(async () => { throw new Error('Offline'); }, event => { observation = event; throw new Error('Observer failed'); });
  await assert.rejects(observed('https://project.example/auth/v1/token'), /Offline/);
  assert.equal(observation.status, null);
  assert.equal(observation.category, 'auth');
  assert.equal(observation.responseBytes, null);
});
