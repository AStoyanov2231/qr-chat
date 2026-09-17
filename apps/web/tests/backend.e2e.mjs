// Uses a host-provided Playwright installation and an already-running test browser.
// Authentication uses disposable test users and the public Supabase key, never a privileged key.
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import { createChatApi } from '@qr-chat/api';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const users = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'));
const origin = process.env.QR_CHAT_WEB_URL || 'http://localhost:3000';
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9222');
const accounts = [];
const code = `qrchat-ui-${users[0].id}`;
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-ui-checks';
mkdirSync(output, { recursive: true });
async function visible(page, text) { await page.getByText(text, { exact: true }).first().waitFor({ timeout: 45000 }); }
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page must not overflow horizontally');
}
try {
  for (const user of users.slice(0, 2)) {
    const jar = new Map();
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cookies) => { for (const cookie of cookies) jar.set(cookie.name, cookie.value); } },
    });
    const login = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    assert.equal(login.error, null, login.error?.message);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const api = createChatApi(client);
    for (const friend of await api.friends()) await api.removeFriend(friend.id);
    await api.leaveGroup();
    accounts.push({ context, page, api, errors, user });
  }
  const [alice, bob] = accounts;
  for (const [actor, name] of [[alice, 'Alice QA'], [bob, 'Bob QA']]) {
    await actor.page.goto(`${origin}/?code=${encodeURIComponent(code)}`);
    await actor.page.getByLabel('Your name', { exact: true }).fill(name);
    await actor.page.getByRole('button', { name: 'Join chat', exact: false }).click();
    await actor.page.getByLabel('Message', { exact: true }).waitFor({ timeout: 45000 });
  }
  await alice.page.getByLabel('Message', { exact: true }).fill('Hello from Alice');
  await alice.page.getByRole('button', { name: 'Send message', exact: true }).click();
  await visible(bob.page, 'Hello from Alice');
  await bob.page.getByLabel('Message', { exact: true }).fill('Hello from Bob');
  await bob.page.getByRole('button', { name: 'Send message', exact: true }).click();
  await visible(alice.page, 'Hello from Bob');
  await noOverflow(alice.page);
  await alice.page.screenshot({ path: `${output}/group-mobile.png`, fullPage: true });
  await alice.page.setViewportSize({ width: 1280, height: 900 });
  await visible(alice.page, 'Open QR Chat on your phone.');
  assert.equal(await alice.page.getByRole('navigation', { name: 'Primary navigation' }).count(), 0);
  await noOverflow(alice.page);
  await alice.page.screenshot({ path: `${output}/group-desktop.png`, fullPage: true });
  await alice.page.setViewportSize({ width: 390, height: 844 });
  console.log('PASS: mobile live group messages and desktop mobile-only gate');

  const membership = await bob.api.currentMembership();
  const seeded = await bob.api.client.from('group_messages').insert(Array.from({ length: 51 }, (_, i) => ({ group_id: membership.group_id, sender_id: users[1].id, body: `UI page ${i}` })));
  assert.equal(seeded.error, null);
  await alice.page.getByRole('button', { name: 'Load older messages' }).waitFor({ timeout: 45000 });
  await alice.page.getByRole('button', { name: 'Load older messages' }).click();
  await visible(alice.page, 'Hello from Alice');
  console.log('PASS: older group messages are accessible');

  await alice.page.getByRole('button', { name: 'Add friend', exact: true }).first().click();
  await visible(alice.page, 'Friend request sent.');
  await bob.page.goto(`${origin}/chats`);
  await bob.page.getByRole('button', { name: 'Accept', exact: true }).click({ timeout: 45000 });
  await bob.page.getByRole('button', { name: 'Message', exact: true }).waitFor();
  await alice.page.goto(`${origin}/chats`);
  for (const actor of [alice, bob]) await actor.page.getByRole('button', { name: 'Message', exact: true }).click({ timeout: 45000 });
  await alice.page.getByLabel('Direct message', { exact: true }).fill('A private hello');
  await alice.page.getByRole('button', { name: 'Send direct message', exact: true }).click();
  await visible(bob.page, 'A private hello');
  await bob.page.screenshot({ path: `${output}/dm-mobile.png`, fullPage: true });
  console.log('PASS: friend request, acceptance, and live DM delivery');

  await alice.context.setOffline(true);
  await bob.page.getByLabel('Direct message', { exact: true }).fill('Sent while Alice was offline');
  await bob.page.getByRole('button', { name: 'Send direct message', exact: true }).click();
  await alice.context.setOffline(false);
  await visible(alice.page, 'Sent while Alice was offline');
  console.log('PASS: browser reconnect recovers missed DM');

  await alice.page.goto(`${origin}/profile`);
  await alice.page.getByRole('button', { name: 'Edit Profile', exact: true }).last().click();
  await alice.page.getByLabel('Display name').fill('Alice Updated');
  await alice.page.getByRole('button', { name: 'Save profile' }).click();
  await visible(alice.page, 'Profile saved.');
  assert.equal((await alice.api.profile()).display_name, 'Alice Updated');
  await alice.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await alice.page.getByRole('button', { name: 'Leave current chat' }).click();
  await visible(alice.page, 'No groups yet.');
  assert.equal(await alice.api.currentMembership(), null);
  await alice.page.goto(`${origin}/profile`);
  await alice.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await alice.page.getByRole('button', { name: 'Sign out', exact: false }).click();
  await alice.page.waitForURL('**/sign-in', { timeout: 45000 });
  await alice.page.goto(`${origin}/chats`);
  await alice.page.waitForURL('**/sign-in?**');
  console.log('PASS: profile persists, leave revokes membership, sign-out protects routes');
  assert.deepEqual(accounts.flatMap((actor) => actor.errors), [], 'no browser runtime errors');
} finally {
  for (const actor of accounts) {
    await actor.context.setOffline(false);
    // Sign-out is under test, so authenticate this separate cleanup client again.
    const cleanupLogin = await actor.api.client.auth.signInWithPassword({ email: actor.user.email, password: actor.user.password });
    assert.equal(cleanupLogin.error, null);
    for (const friend of await actor.api.friends()) await actor.api.removeFriend(friend.id).catch(() => {});
    await actor.api.leaveGroup();
    await actor.api.client.removeAllChannels();
    await actor.context.close();
  }
  await browser.close();
}
