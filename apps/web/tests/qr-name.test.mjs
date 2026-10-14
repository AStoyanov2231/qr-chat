import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleQrNamePost } from '../src/lib/qr-name-route.ts';

test('the name API route enforces bearer or cookie authentication without a proxy', async () => {
  let lookups = 0;
  let cookieSession = false;
  const dependencies = {
    createClient: async () => ({ auth: { getClaims: async (token) => ({
      data: { claims: token === 'native-token' || (!token && cookieSession) ? { sub: 'member' } : {} },
      error: token === 'bad-token' ? new Error('invalid token') : null,
    }) } }),
    resolveGroup: async (userId, code) => { lookups += 1; assert.equal(userId, 'member'); return `Venue ${code}`; },
  };
  const makeRequest = (headers = {}) => new Request('https://chat.example/api/qr-name', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ code: 'QR-key' }),
  });

  const unauthorized = await handleQrNamePost(makeRequest(), dependencies);
  assert.equal(unauthorized.status, 401);
  assert.equal(lookups, 0);
  cookieSession = true;
  const cookie = await handleQrNamePost(makeRequest(), dependencies);
  assert.equal(cookie.status, 200);
  assert.deepEqual(await cookie.json(), { name: 'Venue QR-key' });
  const bearer = await handleQrNamePost(makeRequest({ authorization: 'Bearer native-token' }), dependencies);
  assert.equal(bearer.status, 200);
  const invalidBearer = await handleQrNamePost(makeRequest({ authorization: 'Bearer bad-token' }), dependencies);
  assert.equal(invalidBearer.status, 401, 'Invalid bearer credentials must not fall back to cookies');
  assert.equal(lookups, 2);
});
