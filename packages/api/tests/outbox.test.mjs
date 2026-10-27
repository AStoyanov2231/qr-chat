import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, visibleOutbox } from '../src/outbox.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve));

test('a retry sends the same client id as the failed attempt', async () => {
  let n = 0;
  const outbox = createOutbox(() => `key-${++n}`);
  const clientIds = [];
  let fail = true;
  const send = async (_text, clientId) => { clientIds.push(clientId); if (fail) throw new Error('Lost response'); return { id: 7 }; };
  outbox.send('g:room', 'Hello', send);
  await settle();
  assert.equal(outbox.items()[0].failed, true);
  fail = false;
  outbox.retry(outbox.items()[0], send);
  await settle();
  assert.deepEqual(clientIds, ['key-1', 'key-1']);
  assert.deepEqual(outbox.items().map(({ failed, sentId }) => [failed, sentId]), [[false, '7']]);
});

test('a sent message is hidden once loaded, and stays hidden after a reload keeps only a newer page', () => {
  const item = (key, sentId, conversation = 'g:room') => ({ key, conversation, text: key, time: 0, failed: false, sentId });
  const items = [item('sent', '5'), item('pending'), item('other-chat', '9', 'd:dm')];
  const keys = (loadedIds) => visibleOutbox(items, 'g:room', loadedIds).map(({ key }) => key);
  assert.deepEqual(keys([]), ['sent', 'pending'], 'nothing loaded yet: the placeholder stays');
  assert.deepEqual(keys([3, 4]), ['sent', 'pending'], 'its row has not arrived yet');
  assert.deepEqual(keys([4, 5]), ['pending']);
  assert.deepEqual(keys([60, 61]), ['pending'], 'no ghost bubble at the bottom after a reload');
});
