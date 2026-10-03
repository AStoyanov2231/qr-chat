// Actual Android Chrome acceptance via its forwarded CDP socket, without emulation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');
const { createChatApi } = await import(require.resolve('@qr-chat/api'));
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const user = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'))[1];
const origin = 'http://127.0.0.1:3000';
const output = '/private/tmp/qr-chat-release-evidence';
const jar = new Map();
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cookies) => { for (const cookie of cookies) jar.set(cookie.name, cookie.value); } },
});
const auth = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(auth.error, null, auth.error?.message);
const api = createChatApi(client);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();
function screen(name) {
  const shot = spawnSync('/Users/andy/Library/Android/sdk/platform-tools/adb', ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p']);
  assert.equal(shot.status, 0);
  writeFileSync(`${output}/${name}.png`, shot.stdout);
}
try {
  await page.goto(`${origin}/welcome`);
  const runtime = await page.evaluate(() => ({ userAgent: navigator.userAgent, coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth, height: innerHeight, devicePixelRatio }));
  assert.match(runtime.userAgent, /Android/);
  assert.equal(runtime.coarse, true);
  await page.getByRole('heading', { name: /A little\s*closer\./ }).waitFor();
  screen('android-chrome-landing');
  await page.goto(`${origin}/sign-in`);
  await page.getByRole('button', { name: /Google/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Apple|password/i }).count(), 0);
  screen('android-chrome-sign-in');
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })));
  await page.goto(`${origin}/chats`);
  await page.getByLabel('Search chats and people by name').waitFor({ timeout: 45000 });
  await page.getByText('Release Cross Client', { exact: true }).waitFor();
  await page.getByLabel('Search chats and people by name').fill('web pair');
  await page.getByRole('button', { name: 'Open direct message with Web Pair QA', exact: true }).waitFor();
  screen('android-chrome-search');
  await page.getByRole('button', { name: 'Open direct message with Web Pair QA', exact: true }).click();
  await page.getByText('dm-web-android-rc-02', { exact: true }).waitFor({ timeout: 45000 });
  await page.getByText('dm-android-web-rc-02', { exact: true }).waitFor();
  const input = page.getByLabel('Direct message', { exact: true });
  await input.click();
  await input.fill('android-chrome-web-01');
  await page.waitForTimeout(700); // Native IME animation; actual frame is captured below.
  const keyboard = await page.evaluate(() => {
    const bounds = document.querySelector('button[aria-label="Send direct message"]').getBoundingClientRect();
    return { viewport: visualViewport.height, viewportTop: visualViewport.offsetTop, sendTop: bounds.top, sendBottom: bounds.bottom };
  });
  assert.ok(keyboard.sendBottom <= keyboard.viewport + keyboard.viewportTop + 1, 'Actual Android browser composer must stay above keyboard');
  screen('android-chrome-keyboard');
  await page.getByRole('button', { name: 'Send direct message', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#direct-message')?.value === '');
  await page.getByText('android-chrome-web-01', { exact: true }).waitFor();
  assert.equal(await page.getByText('android-chrome-web-01', { exact: true }).count(), 1);
  screen('android-chrome-dm');
  await page.goto(`${origin}/profile`);
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).last().click();
  await page.getByLabel('Display name').fill('RC Android Synced');
  await page.locator('input[type="file"]').setInputFiles({ name: 'release-avatar.png', mimeType: 'image/png', buffer: readFileSync(`${output}/camera-qr.png`) });
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByText('Profile saved.', { exact: true }).waitFor({ timeout: 45000 });
  const profile = await api.profile();
  assert.equal(profile.display_name, 'RC Android Synced');
  assert.ok(profile.avatar_url);
  assert.equal((await fetch(profile.avatar_url)).status, 200);
  screen('android-chrome-profile');
  writeFileSync(`${output}/android-chrome-acceptance.json`, JSON.stringify({ pass: true, runtime, keyboard, actualBrowser: true, nativeAccountReused: true, message: 'android-chrome-web-01', profileName: profile.display_name, avatarStored: true, timestamp: new Date().toISOString() }, null, 2));
  console.log('PASS actual Android Chrome landing/sign-in/search/history/send/keyboard/profile/avatar; native same-account observation next.');
} catch (error) {
  screen('android-chrome-failure');
  throw error;
} finally {
  await browser.close();
  await client.removeAllChannels();
  client.auth.stopAutoRefresh();
}
