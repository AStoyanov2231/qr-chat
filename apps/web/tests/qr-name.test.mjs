import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVenueName,
  isPublicIpAddress,
  lookupQrPageName,
} from '../src/lib/qr-name-metadata.ts';
import {
  handleQrNamePost,
  isRouteAuthenticatedApiPath,
} from '../src/lib/qr-name-route.ts';

const publicAddress = { address: '93.184.216.34', family: 4 };
const page = (overrides = {}) => ({
  status: 200,
  location: null,
  contentType: 'text/html; charset=utf-8',
  contentEncoding: null,
  body: '<html><head><title>Happy Cafe</title></head></html>',
  ...overrides,
});
const dependencies = (overrides = {}) => ({
  resolve: async () => [publicAddress],
  request: async () => page(),
  ...overrides,
});

test('HTML metadata parsing decodes entities, prioritizes the venue title, and rejects malformed or generic sources', () => {
  assert.equal(extractVenueName(`
    <meta property="og:site_name" content="Toast">
    <meta property="og:title" content="Mila &amp; Sons - Menu">
    <title>Menu | Mila &amp; Sons</title>
  `), 'Mila & Sons');
  assert.equal(extractVenueName(`
    <script type="application/ld+json">{bad json</script>
    <meta property="og:site_name" content="DoorDash">
    <title>Online ordering</title>
  `), null);
  assert.equal(extractVenueName('<title>Happy Cafe</title><meta property="og:title" content="Another Place">'), null);
  assert.equal(extractVenueName('<title>https://happy.example/menu</title>'), null);
});

test('public IP validation excludes local, reserved, and mapped private addresses', () => {
  assert.equal(isPublicIpAddress('93.184.216.34'), true);
  for (const address of [
    '127.0.0.1', '10.0.0.1', '169.254.10.20', '192.168.1.2', '100.64.0.1',
    '::1', 'fc00::1', 'fe80::1', '::ffff:192.168.1.1', 'not-an-ip',
  ]) assert.equal(isPublicIpAddress(address), false, address);
});

test('lookup accepts only public HTTP(S) hosts and pins DNS results across redirects', async () => {
  let requests = 0;
  const redirects = [];
  const result = await lookupQrPageName('https://qr.example.com/start', dependencies({
    resolve: async (host) => {
      redirects.push(host);
      return [publicAddress];
    },
    request: async (url, address) => {
      requests += 1;
      assert.equal(address.address, publicAddress.address);
      return url.pathname === '/start'
        ? page({ status: 302, location: 'https://venue.example.net/menu' })
        : page({ body: '<meta property="og:title" content="Cafe Happy">' });
    },
  }));
  assert.equal(result, 'Cafe Happy');
  assert.deepEqual(redirects, ['qr.example.com', 'venue.example.net']);
  assert.equal(requests, 2);

  for (const unsafe of [
    'http://localhost/menu', 'https://printer.local/', 'https://singlelabel/menu',
    'https://user:pass@venue.example.net/', 'ftp://venue.example.net/menu',
    'https://venue.example.net:8443/menu', 'https://127.0.0.1/menu',
  ]) {
    let called = false;
    assert.equal(await lookupQrPageName(unsafe, dependencies({ request: async () => { called = true; return page(); } })), null, unsafe);
    assert.equal(called, false, unsafe);
  }
});

test('lookup rejects DNS rebinding, redirect loops, oversized pages, and hung requests within its deadline', async () => {
  let resolveCount = 0;
  let requestCount = 0;
  assert.equal(await lookupQrPageName('https://qr.example.com/start', dependencies({
    resolve: async () => ++resolveCount === 1 ? [publicAddress] : [{ address: '10.0.0.9', family: 4 }],
    request: async () => {
      requestCount += 1;
      return page({ status: 302, location: 'https://other.example.net/menu' });
    },
  })), null);
  assert.equal(requestCount, 1);

  assert.equal(await lookupQrPageName('https://qr.example.com/start', dependencies({
    request: async () => page({ status: 302, location: '/start' }),
  })), null);
  assert.equal(await lookupQrPageName('https://qr.example.com/start', dependencies({
    request: async () => page({ body: 'x'.repeat(512 * 1024 + 1) }),
  })), null);

  let timedOut = false;
  assert.equal(await lookupQrPageName('https://qr.example.com/start', dependencies({
    timeoutMs: 20,
    request: async (_url, _address, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { timedOut = true; reject(new Error('aborted')); }, { once: true });
    }),
  })), null);
  assert.equal(timedOut, true);
});

test('the name API route enforces bearer or cookie authentication after proxy bypass', async () => {
  assert.equal(isRouteAuthenticatedApiPath('/api/qr-name'), true);
  assert.equal(isRouteAuthenticatedApiPath('/api/qr-name/extra'), false);

  let lookups = 0;
  let cookieSession = false;
  const dependencies = {
    createClient: async () => ({ auth: { getUser: async (token) => ({
      data: { user: token === 'native-token' || (!token && cookieSession) ? { id: 'member' } : null },
      error: token === 'bad-token' ? new Error('invalid token') : null,
    }) } }),
    lookupName: async (code) => { lookups += 1; return `Venue ${code}`; },
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
