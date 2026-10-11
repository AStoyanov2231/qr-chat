// Live release acceptance. Start scripts/release-browser.mjs with the same users/code.
// Disposable passwords are used only by this runner; production sign-in remains Google-only.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import { createChatApi } from '@qr-chat/api';
assert.ok(process.env.QR_CHAT_TEST_USERS_FILE, 'Set QR_CHAT_TEST_USERS_FILE to disposable confirmed accounts.');
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const users = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'));
assert.ok(users.length >= 2, 'Two disposable accounts are required.');
const origin = process.env.QR_CHAT_WEB_URL || 'http://localhost:3000';
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9222');
const code = process.env.QR_CHAT_TEST_CODE || `qrchat-release-${users[0].id}`;
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
mkdirSync(output, { recursive: true });
const accounts = [];
const evidence = [];
const timeout = 45000;
async function eventually(check, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(label);
}
async function visible(page, text) {
  await page.bringToFront();
  await page.getByText(text, { exact: true }).first().waitFor({ timeout });
}
async function screenshot(page, name) {
  await page.bringToFront();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} must not overflow horizontally`);
  // Chromium CDP full-page capture can reset mobile touch emulation; keep app captures in the real viewport.
  await page.screenshot({ path: `${output}/${name}.png` });
}
function pass(label) { evidence.push(label); console.log(`PASS: ${label}`); }
async function login(user) {
  const jar = new Map();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cookies) => { for (const cookie of cookies) jar.set(cookie.name, cookie.value); } },
  });
  const auth = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  assert.equal(auth.error, null, auth.error?.message);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.grantPermissions(['camera'], { origin });
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const actor = { context, page, api: createChatApi(client), errors, user };
  accounts.push(actor);
  return actor;
}
async function overview(actor) {
  await actor.page.bringToFront();
  await actor.page.goto(`${origin}/chats`);
  await actor.page.getByLabel('Search chats and people by name').waitFor({ timeout });
  assert.equal(await actor.page.locator('.local-design-frame').count(), 0, 'Design preview cannot be used for live acceptance');
}
async function openDirect(actor, peerName) {
  await overview(actor);
  await actor.page.getByRole('button', { name: `Open direct message with ${peerName}`, exact: true }).click({ timeout });
  await actor.page.getByLabel('Direct message', { exact: true }).waitFor({ timeout });
}
async function send(actor, body, direct = false) {
  await actor.page.bringToFront();
  await actor.page.getByLabel(direct ? 'Direct message' : 'Message', { exact: true }).fill(body);
  await actor.page.getByRole('button', { name: direct ? 'Send direct message' : 'Send message', exact: true }).click();
}
try {
  const [alice, bob] = await Promise.all(users.slice(0, 2).map(login));
  for (const actor of [alice, bob]) {
    for (const friend of await actor.api.friends()) await actor.api.removeFriend(friend.id);
    await actor.api.leaveGroup();
  }
  for (const [actor, name] of [[alice, 'Alice QA'], [bob, 'Bob QA']]) {
    await actor.api.saveProfile({ display_name: name });
    await overview(actor);
    if (actor === alice) { await actor.context.clearPermissions(); await actor.context.grantPermissions([], { origin }); }
    await actor.page.getByRole('button', { name: 'Scan a QR code', exact: true }).first().click();
    if (actor === alice) {
      await visible(actor.page, 'Camera access is blocked. Allow it in your browser settings, then try again.');
      await screenshot(actor.page, 'web-camera-denied');
      await actor.context.grantPermissions(['camera'], { origin });
      await actor.page.getByRole('button', { name: 'Try camera again', exact: true }).click();
      pass('Camera denial explains recovery and retry works after granting permission');
    }
    // Unidentified QR codes need a chat name; named rooms join automatically.
    await eventually(async () => (await actor.page.getByLabel('Chat name', { exact: true }).count()) || (await actor.page.getByLabel('Message', { exact: true }).count()), 'The scan must resolve to naming or the conversation');
    assert.equal(await actor.page.getByLabel('Your name', { exact: true }).count(), 0);
    if (await actor.page.getByLabel('Chat name', { exact: true }).count()) {
      await actor.page.getByLabel('Chat name', { exact: true }).fill('Release Cafe');
      await screenshot(actor.page, 'web-qr-chat-name');
      await actor.page.getByRole('button', { name: 'Join chat', exact: false }).click();
    }
    await actor.page.getByLabel('Message', { exact: true }).waitFor({ timeout });
  }
  const membership = await alice.api.currentMembership();
  assert.equal((await bob.api.currentMembership()).group_id, membership.group_id);
  assert.equal(membership.groups.code_key, code);
  assert.equal((await alice.api.members(membership.group_id)).length, 2);
  pass('Actual browser camera QR decoding, named joins, and shared membership');

  const failGroupSend = (route) => route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue();
  await alice.context.route('**/rest/v1/messages*', failGroupSend);
  await send(alice, 'Hello from Alice');
  await visible(alice.page, 'Not sent. Tap ! to retry');
  assert.equal(await alice.page.getByLabel('Message', { exact: true }).inputValue(), '', 'The draft clears at once; the failed message stays in the conversation');
  await screenshot(alice.page, 'web-group-failed-send');
  await alice.context.unroute('**/rest/v1/messages*', failGroupSend);
  await alice.context.setOffline(true);
  await visible(alice.page, 'You’re offline. Reconnect to load chats and send messages.');
  await alice.context.setOffline(false);
  await alice.page.getByLabel('Message', { exact: true }).waitFor({ timeout });
  await visible(alice.page, 'Not sent. Tap ! to retry');
  assert.equal(await alice.page.locator('dialog.camera-dialog[open]').count(), 0);
  console.log('Group reconnect kept the failed message and did not replay the initial QR link.');
  await alice.page.getByRole('button', { name: 'Message not sent. Retry' }).click({ timeout });
  pass('A failed group send stays marked across reconnect and goes through on retry without reopening the scanner');
  await visible(bob.page, 'Hello from Alice');
  await send(bob, 'Hello from Bob');
  await visible(alice.page, 'Hello from Bob');
  assert.equal(await alice.page.getByText('Hello from Bob', { exact: true }).count(), 1);
  await alice.page.locator('.toast').waitFor({ state: 'hidden', timeout: 10000 });
  await screenshot(alice.page, 'web-group-mobile');
  await alice.page.setViewportSize({ width: 390, height: 430 });
  await alice.page.getByLabel('Message', { exact: true }).fill('Keyboard-sized viewport draft');
  const composerBounds = await alice.page.getByRole('button', { name: 'Send message', exact: true }).boundingBox();
  assert.ok(composerBounds && composerBounds.y >= 0 && composerBounds.y + composerBounds.height <= 430, 'Composer must remain visible in a short keyboard-sized viewport');
  const headerLayout = await alice.page.evaluate(() => {
    const title = document.querySelector('.chat-header-title h1');
    const subtitle = document.querySelector('.chat-header-title p');
    const surface = document.querySelector('.chat-conversation-surface');
    return { titleHeight: title.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(title).lineHeight), hasSubtitle: !!subtitle, titleBottom: title.getBoundingClientRect().bottom, surfaceTop: surface.getBoundingClientRect().top };
  });
  assert.ok(headerLayout.titleHeight >= headerLayout.lineHeight, 'Short viewport must show the complete title line');
  assert.equal(headerLayout.hasSubtitle, false, 'Conversation headers omit member counts');
  assert.ok(headerLayout.titleBottom <= headerLayout.surfaceTop, 'Header title must stay above the chat surface');
  await screenshot(alice.page, 'web-group-short-viewport');
  await alice.page.getByLabel('Message', { exact: true }).fill('');
  await alice.page.setViewportSize({ width: 390, height: 844 });
  await alice.page.getByRole('button', { name: 'Group settings', exact: true }).click();
  await alice.page.getByRole('img', { name: 'Group QR code', exact: true }).waitFor();
  await alice.page.locator('.group-sidebar-panel').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await screenshot(alice.page, 'web-group-settings');
  await alice.page.getByRole('button', { name: 'Close group settings', exact: true }).click();
  pass('Bidirectional live group messages appear once; member settings display the group QR');

  const seededGroup = await bob.api.client.from('messages').insert(Array.from({ length: 55 }, (_, i) => ({ group_id: membership.group_id, sender_id: bob.user.id, body: `Group page ${i}` })));
  assert.equal(seededGroup.error, null);
  await alice.page.reload();
  await alice.page.getByRole('button', { name: 'Load older messages' }).click({ timeout });
  await visible(alice.page, 'Hello from Alice');
  assert.equal(await alice.page.locator('.message-stream article').count(), 57);
  pass('Group pagination loads all 57 messages exactly once');

  await alice.page.getByRole('button', { name: "View Bob QA's profile", exact: true }).first().click();
  await alice.page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await visible(alice.page, 'Request sent. You can message after they accept.');
  await screenshot(alice.page, 'web-member-profile-requested');
  await overview(bob);
  const declineStarted = Date.now();
  await bob.page.getByRole('button', { name: 'Open friend request from Alice QA', exact: true }).click({ timeout });
  await bob.page.getByRole('button', { name: 'Decline', exact: true }).click({ timeout });
  await eventually(async () => (await alice.api.friends()).length === 0, 'Decline must delete the backend friendship');
  await alice.page.bringToFront();
  await alice.page.getByRole('button', { name: 'Add friend', exact: true }).waitFor({ timeout });
  console.log(`Decline converged in ${Date.now() - declineStarted}ms`);
  await alice.page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await visible(alice.page, 'Request sent. You can message after they accept.');
  await alice.page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await alice.page.getByRole('button', { name: 'Add friend', exact: true }).waitFor({ timeout });
  assert.equal((await bob.api.friends()).length, 0);
  pass('Recipient decline and sender cancel both converge and remove pending requests');
  await alice.page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await visible(alice.page, 'Request sent. You can message after they accept.');
  await overview(bob);
  await bob.page.getByRole('button', { name: 'Open friend request from Alice QA', exact: true }).click({ timeout });
  await bob.page.getByRole('button', { name: 'Accept', exact: true }).click({ timeout });
  await bob.page.getByLabel('Direct message', { exact: true }).waitFor({ timeout });
  await openDirect(alice, 'Bob QA');
  await openDirect(bob, 'Alice QA');
  await send(alice, 'A private hello', true);
  await visible(bob.page, 'A private hello');
  await bob.page.getByLabel('Direct message', { exact: true }).waitFor({ timeout });
  assert.equal(await bob.page.locator('.chat-header-title p').count(), 0);
  await screenshot(bob.page, 'web-dm-mobile');
  const friendship = (await alice.api.friends()).find((row) => row.accepted_at);
  assert.ok(friendship);
  pass('Friend request, acceptance, and live direct message delivery');

  const seededDirect = await bob.api.client.from('messages').insert(Array.from({ length: 55 }, (_, i) => ({ group_id: friendship.id, sender_id: bob.user.id, body: `Direct page ${i}` })));
  assert.equal(seededDirect.error, null);
  await openDirect(alice, 'Bob QA');
  await alice.page.getByRole('button', { name: 'Load older messages' }).click({ timeout });
  await visible(alice.page, 'A private hello');
  assert.equal(await alice.page.locator('.message-stream article').count(), 56);
  pass('Direct message pagination loads all 56 messages exactly once');

  // Fail the transport, without supplying mock data or success responses.
  const failMessage = (route) => route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue();
  await alice.context.route('**/rest/v1/messages*', failMessage);
  await send(alice, 'Retained failed draft', true);
  await visible(alice.page, 'Not sent. Tap ! to retry');
  assert.equal(await alice.page.getByLabel('Direct message', { exact: true }).inputValue(), '', 'The draft clears at once; the failed message stays in the conversation');
  await screenshot(alice.page, 'web-dm-failed-send');
  await alice.context.unroute('**/rest/v1/messages*', failMessage);
  await alice.page.getByRole('button', { name: 'Message not sent. Retry' }).click({ timeout });
  await visible(bob.page, 'Retained failed draft');
  assert.equal((await bob.api.directMessages(friendship.id)).items.filter((row) => row.body === 'Retained failed draft').length, 1);
  pass('Failed direct send preserves the draft and one retry creates exactly one message');

  const network = await alice.context.newCDPSession(alice.page);
  await network.send('Network.enable');
  await network.send('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: 128000, uploadThroughput: 64000 });
  await send(alice, 'Slow network message', true);
  assert.equal(await alice.page.getByRole('button', { name: 'Sending direct message', exact: true }).isDisabled(), true);
  await screenshot(alice.page, 'web-dm-slow-send');
  await visible(bob.page, 'Slow network message');
  assert.equal((await bob.api.directMessages(friendship.id)).items.filter((row) => row.body === 'Slow network message').length, 1);
  await network.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await network.detach();
  pass('Slow network shows disabled pending send and delivers one message');

  await alice.page.bringToFront();
  await alice.context.setOffline(true);
  await visible(alice.page, 'You’re offline. Reconnect to load chats and send messages.');
  await screenshot(alice.page, 'web-offline');
  await bob.api.sendDirectMessage(friendship.id, 'Sent while Alice was offline');
  await alice.context.setOffline(false);
  await visible(alice.page, 'Sent while Alice was offline');
  assert.equal(await alice.page.getByText('Sent while Alice was offline', { exact: true }).count(), 1);
  pass('Offline/reconnect recovers a missed live direct message exactly once');

  await overview(alice);
  await alice.page.getByLabel('Search chats and people by name').fill('bOb');
  await alice.page.getByRole('button', { name: 'Open direct message with Bob QA', exact: true }).waitFor();
  assert.equal(await alice.page.locator('.group-card').count(), 0);
  await alice.page.getByLabel('Search chats and people by name').fill('no-such-release-chat');
  await visible(alice.page, 'No chats or requests match “no-such-release-chat”.');
  await screenshot(alice.page, 'web-search-empty');
  await alice.page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await alice.page.locator('.group-card').waitFor();
  pass('Chat search matches names case-insensitively and clears an empty result');

  const twin = await login(users[0]);
  await twin.page.goto(`${origin}/profile`);
  await alice.page.goto(`${origin}/profile`);
  await alice.page.getByRole('button', { name: 'Edit Profile', exact: true }).last().click();
  await alice.page.getByLabel('Display name').fill('Alice Updated');
  await alice.page.locator('input[type="file"]').setInputFiles(`${output}/camera-qr.png`);
  await alice.page.getByRole('button', { name: 'Save profile' }).click();
  await visible(alice.page, 'Profile saved.');
  await visible(twin.page, 'Alice Updated');
  await bob.page.bringToFront();
  await bob.page.getByRole('heading', { name: 'Alice Updated', exact: true }).waitFor({ timeout });
  const profile = await alice.api.profile();
  assert.equal(profile.display_name, 'Alice Updated');
  assert.ok(profile.avatar_url);
  assert.equal((await fetch(profile.avatar_url)).status, 200);
  await screenshot(twin.page, 'web-profile-same-account');
  for (const unsupported of ['Saved Places', 'Notifications', 'Messages', 'Places']) assert.equal(await twin.page.getByText(unsupported, { exact: true }).count(), 0, `${unsupported} must not appear in profile`);
  await twin.page.getByRole('button', { name: 'Edit Profile', exact: true }).last().click();
  await twin.page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await twin.page.getByRole('button', { name: 'Save profile' }).click();
  await visible(twin.page, 'Profile saved.');
  assert.equal((await twin.api.profile()).avatar_url, null);
  pass('Profile and uploaded avatar persist across same-account sessions; avatar removal persists; unsupported sections are absent');

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await alice.context.storageState() });
  try {
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(`${origin}/profile`);
    await desktopPage.getByRole('heading', { name: /A little\s*closer\./ }).waitFor({ timeout });
    assert.equal(await desktopPage.getByRole('button', { name: 'Settings', exact: true }).count(), 0);
    await screenshot(desktopPage, 'web-desktop-landing');
  } finally { await desktop.close(); }
  pass('Desktop authenticated routes show the responsive landing');

  await overview(twin);
  await twin.page.locator('.group-card').waitFor();
  await bob.page.goto(`${origin}/?code=${encodeURIComponent(code)}`);
  await bob.page.getByRole('button', { name: 'Group settings', exact: true }).click();
  await bob.page.getByLabel('2 members', { exact: true }).waitFor({ timeout });
  await alice.page.bringToFront();
  await alice.page.getByRole('button', { name: 'Settings', exact: true }).click();
  const leaveStarted = Date.now();
  await alice.page.getByRole('button', { name: 'Leave current chat' }).click();
  await eventually(async () => await alice.api.currentMembership() === null, 'leave must revoke membership');
  await twin.page.bringToFront();
  await twin.page.locator('.group-card').waitFor({ state: 'hidden', timeout });
  assert.equal(await twin.page.locator('.group-card').count(), 0);
  await bob.page.bringToFront();
  await bob.page.getByLabel('1 member', { exact: true }).waitFor({ timeout });
  console.log(`Membership leave converged in ${Date.now() - leaveStarted}ms without navigation or reload`);
  pass('Leave removes same-account group card and updates peer member count without reload');
  await twin.page.getByRole('button', { name: 'Open direct message with Bob QA', exact: true }).waitFor();
  await openDirect(twin, 'Bob QA');
  await bob.api.removeFriend(friendship.id);
  await visible(twin.page, 'This friendship is no longer available.');
  assert.equal(await twin.page.getByLabel('Direct message', { exact: true }).count(), 0);
  assert.equal((await twin.api.directMessages(friendship.id)).items.length, 0);
  await assert.rejects(twin.api.sendDirectMessage(friendship.id, 'Removed friendship must reject this'));
  pass('Friend removal in another client clears the visible DM and server authorization rejects further access');
  await alice.page.goto(`${origin}/profile`);
  await alice.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await alice.page.getByRole('button', { name: 'Sign out', exact: false }).click();
  await alice.page.waitForURL('**/sign-in', { timeout });
  await alice.page.goto(`${origin}/chats`);
  await alice.page.waitForURL('**/sign-in?**', { timeout });
  await screenshot(alice.page, 'web-signed-out');
  pass('Leave converges across same-account clients while retaining friends; sign-out protects routes');
  assert.deepEqual(accounts.flatMap((actor) => actor.errors), [], 'no browser runtime errors');
} catch (error) {
  for (const [index, actor] of accounts.entries()) await actor.page.screenshot({ path: `${output}/failure-${index}.png` }).catch(() => {});
  throw error;
} finally {
  writeFileSync(`${output}/web-acceptance.json`, JSON.stringify({ completed: evidence, timestamp: new Date().toISOString() }, null, 2));
  for (const actor of accounts) {
    await actor.context.setOffline(false);
    await actor.context.close();
    await actor.api.client.removeAllChannels();
    actor.api.client.auth.stopAutoRefresh();
  }
  // Contexts are isolated; do not close the shared browser used by independent inspection.
  await browser.close();
}
