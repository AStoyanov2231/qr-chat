// Drive the already authenticated cross-client fixture through real browser controls.
// A native owner supplies the peer's request/message through the actual runtime UI.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const [peer, outgoing, incoming, evidenceName, mode = 'send'] = process.argv.slice(2);
assert.ok(peer && outgoing && incoming && evidenceName, 'Provide peer name, outgoing token, incoming token, and evidence filename stem.');
assert.ok(['send', 'verify'].includes(mode), 'Use explicit send or verify mode; never infer sending from partially loaded history.');
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3000';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
mkdirSync(output, { recursive: true });
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9222');
try {
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => page.url().startsWith(origin));
  const marked = [];
  for (const candidate of pages) if (await candidate.evaluate(() => window.name === 'qr-chat-release-cross-client')) marked.push(candidate);
  assert.ok(marked.length === 1 || pages.length === 1, 'The dedicated cross-client fixture must be identifiable.');
  const page = marked[0] || pages[0];
  await page.evaluate(() => { window.name = 'qr-chat-release-cross-client'; });
  await page.bringToFront();
  await page.goto(`${origin}/chats`);
  await page.getByLabel('Search chats and people by name').waitFor({ timeout: 45000 });
  const accept = page.getByRole('button', { name: `Accept ${peer}'s friend request`, exact: true });
  if (await accept.count()) await accept.click();
  await page.getByRole('button', { name: `Open direct message with ${peer}`, exact: true }).click({ timeout: 45000 });
  await page.getByLabel('Direct message', { exact: true }).waitFor({ timeout: 45000 });
  if (mode === 'send') {
    await page.getByLabel('Direct message', { exact: true }).fill(outgoing);
    await page.getByRole('button', { name: 'Send direct message', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#direct-message')?.value === '', undefined, { timeout: 45000 });
  }
  await page.getByText(outgoing, { exact: true }).waitFor({ timeout: 45000 });
  console.log(`SENT ${outgoing}; awaiting native UI response ${incoming}`);
  await page.getByText(incoming, { exact: true }).waitFor({ timeout: 180000 });
  await page.locator('.message-skeleton').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.chat-header-title p').count(), 0);
  assert.equal(await page.getByText(outgoing, { exact: true }).count(), 1);
  assert.equal(await page.getByText(incoming, { exact: true }).count(), 1);
  await page.screenshot({ path: `${output}/${evidenceName}.png` });
  writeFileSync(`${output}/${evidenceName}.json`, JSON.stringify({ peer, outgoing, incoming, outgoingCount: 1, incomingCount: 1, timestamp: new Date().toISOString() }, null, 2));
  console.log('PASS native request accepted through web UI; actual bidirectional DM tokens appear once.');
} finally { await browser.close(); }
