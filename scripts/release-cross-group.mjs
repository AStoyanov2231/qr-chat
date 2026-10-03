// Assert actual UI-authored group messages from all three runtimes in the web client.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3000';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
const fixture = JSON.parse(readFileSync(`${output}/cross-client-state.json`, 'utf8'));
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9222');
try {
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => page.url().startsWith(origin));
  const marked = [];
  for (const candidate of pages) if (await candidate.evaluate(() => window.name === 'qr-chat-release-cross-client')) marked.push(candidate);
  assert.ok(marked.length === 1 || pages.length === 1, 'The dedicated cross-client fixture must be identifiable.');
  const page = marked[0] || pages[0];
  await page.evaluate(() => { window.name = 'qr-chat-release-cross-client'; });
  await page.bringToFront();
  await page.goto(`${origin}/?code=${encodeURIComponent(fixture.code)}`);
  const tokens = ['web-to-native-rc-01', 'android-to-web-rc-01', 'iOS-to-web-android-crazy-01'];
  for (const token of tokens) {
    await page.getByText(token, { exact: true }).waitFor({ timeout: 45000 });
    assert.equal(await page.getByText(token, { exact: true }).count(), 1);
  }
  await page.getByText('3 members', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/web-cross-group-all.png` });
  writeFileSync(`${output}/cross-group-web.json`, JSON.stringify({ pass: true, tokens, counts: tokens.map(() => 1), memberCount: 3, timestamp: new Date().toISOString() }, null, 2));
  console.log('PASS web UI displays all three actual UI-authored platform messages exactly once and three members.');
} finally { await browser.close(); }
