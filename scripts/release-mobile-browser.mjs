// One-use, loopback-only session installer for real Simulator/Emulator browsers.
// Authenticates a disposable account normally; no application routes are changed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createServerClient, serializeCookieHeader } = require('@supabase/ssr');
const { createChatApi } = await import(require.resolve('@qr-chat/api'));
assert.ok(process.env.QR_CHAT_TEST_USERS_FILE, 'Supply only disposable release users.');
const users = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'));
const user = users[Number(process.env.QR_CHAT_TEST_USER_INDEX || 2)];
assert.ok(user?.email.endsWith('@qr-chat-test.invalid'), 'This installer only accepts release fixtures.');
const origin = new URL(process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3000');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Only a local app server is supported.');
const cookies = new Map();
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: {
    getAll: () => [...cookies.values()].map(({ name, value }) => ({ name, value })),
    setAll: (next) => { for (const cookie of next) cookies.set(cookie.name, cookie); },
  },
});
const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(error, null, error?.message);
const api = createChatApi(client);
await api.saveProfile({ display_name: process.env.QR_CHAT_TEST_NAME || 'Safari QA' });
const code = process.env.QR_CHAT_TEST_CODE || 'qrchat-release-mobile-browser-20261003';
await api.joinNamedGroup(code, 'Mobile Browser QA');
const path = `/${randomUUID()}`;
let used = false;
const server = createServer((request, response) => {
  if (used || request.method !== 'GET' || request.url !== path) {
    response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  used = true;
  response.writeHead(302, {
    'Cache-Control': 'no-store',
    'Set-Cookie': [...cookies.values()].map(({ name, value, options }) => serializeCookieHeader(name, value, { ...options, secure: false, path: '/' })),
    Location: new URL(`/?code=${encodeURIComponent(code)}`, origin).href,
  }).end();
  server.close();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const resultPath = process.env.QR_CHAT_INSTALLER_FILE || '/private/tmp/qr-chat-rc/mobile-browser-installer.json';
writeFileSync(resultPath, JSON.stringify({ url: `http://${origin.hostname}:${address.port}${path}`, code, userId: user.id }), { mode: 0o600 });
console.log(`Single-use local session installer ready; URL saved privately to ${resultPath}.`);
const timeout = setTimeout(() => server.close(), 120000);
await new Promise(resolve => server.on('close', resolve));
clearTimeout(timeout);
await client.removeAllChannels();
client.auth.stopAutoRefresh();
