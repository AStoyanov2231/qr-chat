// Actual Android Chrome lifecycle; coordinate emulator ownership before each mode.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const mode = process.argv[2];
assert.ok(['prepare', 'leave', 'verify', 'sign-out'].includes(mode));
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
const fixture = JSON.parse(readFileSync(`${output}/cross-client-state.json`, 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
function adb(args) {
  const result = spawnSync('/Users/andy/Library/Android/sdk/platform-tools/adb', ['-s', 'emulator-5554', ...args]);
  assert.equal(result.status, 0);
  return result;
}
function screen(name) {
  const result = adb(['exec-out', 'screencap', '-p']);
  writeFileSync(`${output}/${name}.png`, result.stdout);
}
try {
  const page = browser.contexts()[0].pages().find(page => page.url().startsWith('http://127.0.0.1:3000'));
  assert.ok(page, 'The existing same-account Chrome session must remain installed.');
  assert.match(await page.evaluate(() => navigator.userAgent), /Android/);
  if (mode === 'prepare') {
    await page.goto(`http://127.0.0.1:3000/?code=${encodeURIComponent(fixture.code)}`);
    await page.getByLabel('Message', { exact: true }).waitFor({ timeout: 45000 });
    await page.getByText('2 members', { exact: true }).waitFor();
    assert.equal(await page.locator('dialog.camera-dialog[open]').count(), 0);
    screen('android-chrome-before-expiry');
    console.log('READY actual Chrome has active two-member group; native can resume for coordinated expiry.');
  } else if (mode === 'verify' || mode === 'leave') {
    // Deliberately no navigation/reload: resume the group opened by prepare.
    await page.getByText('Your membership has ended.', { exact: true }).waitFor({ timeout: 45000 });
    assert.equal(await page.getByLabel('Message', { exact: true }).count(), 0);
    assert.equal(await page.locator('.message-stream article').count(), 0);
    assert.equal(await page.locator('dialog.camera-dialog[open]').count(), 0, 'Resume after access ends must not reopen the scanner');
    screen(mode === 'leave' ? 'android-chrome-native-leave-fixed' : 'android-chrome-expired-group');
    await page.getByRole('button', { name: 'Back to chats', exact: true }).click();
    const peers = page.getByRole('button', { name: /^Open direct message with / });
    assert.equal(await peers.count(), 2);
    assert.equal(await page.locator('.group-card').count(), 0);
    if (mode === 'leave') {
      writeFileSync(`${output}/android-chrome-native-leave-fixed.json`, JSON.stringify({ pass: true, nativeInitiatedLeave: true, noNavigationOrReloadBeforeEndedAssertion: true, groupBodiesCleared: true, composerRemoved: true, scannerStayedClosed: true, retainedFriends: 2, observedAt: new Date().toISOString() }, null, 2));
      console.log('PASS native Leave converged on actual Chrome resume without reload or automatic scanner; both friends retained.');
    } else {
      await page.getByRole('button', { name: 'Open direct message with Web Pair QA', exact: true }).click();
      await page.getByLabel('Direct message', { exact: true }).fill('android-chrome-after-expiry-01');
      await page.getByRole('button', { name: 'Send direct message', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#direct-message')?.value === '');
      await page.getByText('android-chrome-after-expiry-01', { exact: true }).waitFor({ timeout: 45000 });
      await page.getByText('Friend', { exact: true }).waitFor();
      assert.equal(await page.getByText('android-chrome-after-expiry-01', { exact: true }).count(), 1);
      screen('android-chrome-expired-retained-dm');
      writeFileSync(`${output}/android-chrome-expiry.json`, JSON.stringify({ pass: true, noNavigationOrReloadBeforeEndedAssertion: true, resumedSameAccountBrowser: true, groupBodiesCleared: true, composerRemoved: true, retainedFriends: 2, sent: 'android-chrome-after-expiry-01', observedAt: new Date().toISOString() }, null, 2));
      console.log('PASS actual Chrome own expiry on resume, private group cleared, two friends retained and DM sent.');
    }
  } else {
    await page.goto('http://127.0.0.1:3000/profile');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor({ timeout: 45000 });
    await page.goto('http://127.0.0.1:3000/profile');
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
    assert.equal(await page.locator('.profile-identity').count(), 0);
    screen('android-chrome-signed-out');
    writeFileSync(`${output}/android-chrome-sign-out.json`, JSON.stringify({ pass: true, actualSettingsSignOut: true, guardedProfileAfterNavigation: true, nativeSessionIsolation: 'Requires native owner subsequent authenticated action', observedAt: new Date().toISOString() }, null, 2));
    console.log('PASS actual Chrome settings sign-out and guarded route; native session must remain separately verified.');
  }
} finally { await browser.close(); }
