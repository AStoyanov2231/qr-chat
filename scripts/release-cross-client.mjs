// Keep a live mobile-web fixture open for pairing with the actual native runtimes.
// Uses the third disposable QA account. API joining here is fixture preparation,
// not evidence that camera scanning works (the browser E2E covers that separately).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');
const { createChatApi } = await import(require.resolve('@qr-chat/api'));
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const user = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'))[2];
assert.ok(user, 'The third disposable QA account is reserved for native pairing.');
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3000';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
mkdirSync(output, { recursive: true });
const jar = new Map();
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cookies) => { for (const cookie of cookies) jar.set(cookie.name, cookie.value); } },
});
const auth = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(auth.error, null, auth.error?.message);
const api = createChatApi(client);
await api.saveProfile({ display_name: 'Web Pair QA' });
const code = 'qrchat-release-cross-client-20261003';
const membership = await api.joinNamedGroup(code, 'Release Cross Client');
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9222');
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })));
const page = await context.newPage();
await page.addInitScript(() => { window.name = 'qr-chat-release-cross-client'; });
await page.goto(`${origin}/?code=${encodeURIComponent(code)}`);
await page.getByLabel('Message', { exact: true }).waitFor({ timeout: 45000 });
assert.equal(await page.locator('.local-design-frame').count(), 0);
writeFileSync(`${output}/cross-client-state.json`, JSON.stringify({ groupId: membership.group_id, code, webUserId: user.id, webName: 'Web Pair QA' }, null, 2));
console.log('Live mobile-web pairing fixture ready; public identifiers saved to cross-client-state.json.');
await new Promise((resolve) => { process.on('SIGINT', resolve); process.on('SIGTERM', resolve); });
await context.close();
await browser.close();
await client.removeAllChannels();
client.auth.stopAutoRefresh();
