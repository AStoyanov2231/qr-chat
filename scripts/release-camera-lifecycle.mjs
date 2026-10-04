// Actual browser regression for a fast camera close/reopen with a real video source.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');
const { createChatApi } = await import(require.resolve('@qr-chat/api'));
const QRCode = require('qrcode');
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const user = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'))[0];
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3000';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
mkdirSync(output, { recursive: true });
await QRCode.toFile(`${output}/camera-lifecycle-qr.png`, `qrchat-release-lifecycle-${user.id}`, { width: 240, margin: 4 });
const video = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=white:size=480x480:rate=5:duration=8', '-loop', '1', '-i', `${output}/camera-lifecycle-qr.png`, '-filter_complex', "[0:v][1:v]overlay=120:120:enable='gte(t,4)':shortest=1", '-t', '8', '-pix_fmt', 'yuv420p', `${output}/camera-lifecycle.y4m`], { encoding: 'utf8' });
assert.equal(video.status, 0, video.stderr);
const jar = new Map();
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cookies) => { for (const cookie of cookies) jar.set(cookie.name, cookie.value); } },
});
const auth = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(auth.error, null, auth.error?.message);
const api = createChatApi(client);
const longName = 'Release participant with a maximum length name'.padEnd(50, 'x');
await api.saveProfile({ display_name: longName });
const previous = await api.joinNamedGroup(`qrchat-release-lifecycle-old-${user.id}`, 'Previous Release Room');
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${output}/camera-lifecycle.y4m`] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.grantPermissions(['camera'], { origin });
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })));
  const page = await context.newPage();
  const twinContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await twinContext.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })));
  const twin = await twinContext.newPage();
  await twin.goto(`${origin}/chats`);
  await twin.getByText('Previous Release Room', { exact: true }).waitFor({ timeout: 45000 });
  await page.goto(`${origin}/chats`);
  await page.getByRole('button', { name: 'Scan a QR code', exact: true }).first().click({ timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('video')?.srcObject?.getVideoTracks().some((track) => track.readyState === 'live'));
  const oldVideo = await page.locator('video').elementHandle();
  const closedAt = await page.evaluate(() => {
    document.querySelector('dialog button[aria-label="Close"]').click();
    return performance.now();
  });
  await page.locator('dialog').waitFor({ state: 'hidden' });
  const reopenedAt = await page.evaluate(() => {
    document.querySelector('button[aria-label="Scan a QR code"]').click();
    return performance.now();
  });
  assert.ok(reopenedAt - closedAt < 300, `Race must reopen before old stream cleanup, got ${reopenedAt - closedAt}ms`);
  await page.waitForFunction((old) => document.querySelector('video') !== old, oldVideo, { timeout: 1000 });
  // qr-scanner's old destroy timer fires at 300ms. Observe beyond it while pixels are blank.
  await page.waitForTimeout(650);
  const tracks = await page.locator('video').evaluate((element) => element.srcObject?.getVideoTracks().map((track) => track.readyState));
  assert.deepEqual(tracks, ['live'], 'New scanner must retain its own live media stream after old cleanup');
  await page.screenshot({ path: `${output}/web-camera-reopened.png` });
  await page.waitForFunction(() => document.querySelector('#chat-name') || document.querySelector('#message'), undefined, { timeout: 15000 });
  assert.equal(await page.getByLabel('Your name', { exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/web-camera-reopened-decoded.png` });
  const longTitle = 'Release switching room with a long conversation title '.repeat(2).slice(0, 100);
  if (await page.getByLabel('Chat name', { exact: true }).count()) {
    await page.getByText('Joining this room leaves your current group.', { exact: true }).waitFor();
    await page.getByLabel('Chat name', { exact: true }).fill(longTitle);
    await page.getByRole('button', { name: 'Join chat', exact: false }).click();
  }
  await page.getByLabel('Message', { exact: true }).waitFor({ timeout: 45000 });
  const current = await api.currentMembership();
  assert.notEqual(current.group_id, previous.group_id);
  await twin.bringToFront();
  await twin.getByText(current.qr_groups.qr_codes.display_name, { exact: true }).waitFor({ timeout: 45000 });
  assert.equal(await twin.getByText('Previous Release Room', { exact: true }).count(), 0);
  await page.bringToFront();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/web-long-title-switch.png` });
  await page.getByRole('button', { name: 'Back to chats', exact: true }).click();
  await page.getByRole('button', { name: 'Scan a QR code', exact: true }).first().click();
  // The existing business rule opens an already joined code directly, without another join form.
  await page.getByLabel('Message', { exact: true }).waitFor({ timeout: 45000 });
  assert.equal((await api.currentMembership()).group_id, current.group_id);
  assert.equal((await api.members(current.group_id)).length, 1);
  assert.equal((await api.profile()).display_name, longName);
  const result = { pass: true, closeToReopenMs: reopenedAt - closedAt, observedAfterMs: 650, tracks, realQrDecoded: true, groupSwitchConverged: true, sameCodeScanReopensWithoutDuplicate: true, maxTitleLength: current.qr_groups.qr_codes.display_name.length, maxNameLength: longName.length, profileNameUnchanged: true, timestamp: new Date().toISOString() };
  writeFileSync(`${output}/camera-lifecycle.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await api.leaveGroup();
  await client.removeAllChannels();
  client.auth.stopAutoRefresh();
}
