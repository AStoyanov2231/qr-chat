import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStorage } from '../src/lib/secure-storage.ts';
import { parseAuthCallback, createSignInCompleter } from '../src/lib/auth-callback.ts';
import { codeFromLink } from '../src/lib/qr-link.ts';

test('QR links preserve the intended code through sign-in without accepting other destinations', () => {
  const origin = 'https://chat.example';
  assert.equal(codeFromLink('qrchat://join?code=Cafe%26A', origin), 'Cafe&A');
  assert.equal(codeFromLink(`${origin}/chats?code=Cafe-A`, origin), 'Cafe-A');
  for (const value of [null, 'invalid', 'qrchat://auth/callback?code=oauth', 'qrchat://join?code=a&code=b', 'qrchat://join?code=', 'qrchat://join?code=a#token', 'qrchat://user@join?code=a', 'https://attacker.test/chats?code=a', `${origin}/sign-in?code=a`]) {
    assert.equal(codeFromLink(value, origin), null);
  }
});

const callback = 'qrchat://auth/callback';
test('the system browser and deep-link route exchange a callback exactly once', async () => {
  const calls = [];
  const complete = createSignInCompleter(callback, async (...args) => { calls.push(args); });
  await Promise.all([complete(`${callback}?code=one&sb_flow_id=flow_1234`), complete(`${callback}?sb_flow_id=flow_1234&code=one`)]);
  assert.deepEqual(calls, [['one', 'flow_1234']]);
  await complete(`${callback}?code=two&sb_flow_id=flow_5678`);
  assert.equal(calls.length, 2);
});
test('native callbacks accept only the exact callback and a single PKCE code', () => {
  assert.deepEqual(parseAuthCallback(`${callback}?code=one&sb_flow_id=flow_1234`, callback), { code: 'one', flowId: 'flow_1234' });
  for (const url of [
    'https://auth/callback?code=one', 'qrchat://other/callback?code=one', 'qrchat://auth/callback/other?code=one',
    `${callback}?code=one&code=two`, `${callback}?code=one#access_token=token`, `${callback}?access_token=token`,
    `${callback}?code=one&refresh_token=token`, `${callback}?code=one&sb_flow_id=../bad`, `${callback}?error=denied`,
  ]) assert.throws(() => parseAuthCallback(url, callback));
});
function fixture() {
  const values = new Map();
  const raw = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { assert.ok(Buffer.byteLength(value) < 2048); values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  let revision = 0;
  return { values, raw, storage: createSessionStorage(raw, () => `revision-${++revision}`) };
}
test('large Unicode sessions remain entirely in secure storage and are deleted on sign-out', async () => {
  const { values, storage } = fixture();
  const value = JSON.stringify({ token: 'token'.repeat(1200), name: '🦊'.repeat(1100) });
  await storage.setItem('auth', value);
  assert.equal(await storage.getItem('auth'), value);
  assert.ok(values.size > 3);
  await storage.removeItem('auth');
  assert.equal(await storage.getItem('auth'), null);
  assert.equal(values.size, 0);
});
test('failed token refresh writes preserve the last complete session', async () => {
  const { raw, values, storage } = fixture();
  await storage.setItem('auth', 'original');
  const write = raw.setItem;
  raw.setItem = async (key, value) => { if (key.endsWith('.1')) throw new Error('storage full'); await write(key, value); };
  await assert.rejects(storage.setItem('auth', 'new'.repeat(500)), /storage full/);
  assert.equal(await storage.getItem('auth'), 'original');
  assert.equal(values.size, 2);
});
test('concurrent refresh and sign-out writes cannot resurrect the session', async () => {
  const { storage, values } = fixture();
  await Promise.all([storage.setItem('auth', 'one'), storage.setItem('auth', 'two'), storage.removeItem('auth')]);
  assert.equal(await storage.getItem('auth'), null);
  assert.equal(values.size, 0);
});
test('incomplete secure storage fails closed', async () => {
  const { storage, values } = fixture();
  await storage.setItem('auth', 'one');
  values.delete('auth.revision-1.0');
  await assert.rejects(storage.getItem('auth'), /unavailable/);
});
