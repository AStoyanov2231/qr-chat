// Run against next start: loopback next dev intentionally rewrites auth to preview.
// Real anonymous guards/callback errors. Successful Google OAuth is unverified.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9226');
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3011';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-transition-evidence';
mkdirSync(output, { recursive: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, recordVideo: { dir: output, size: { width: 390, height: 844 } } });
context.setDefaultTimeout(15000);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/\/_vercel\/insights\/|\/favicon\.ico$/.test(message.location().url)) errors.push(message.text());
});
await page.addInitScript(() => {
  window.fades = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function(frames, options) {
    const animation = animate.call(this, frames, options);
    if (this.matches('.app-arrival, [data-motion="auth-snapshot"]')) {
      window.fades.push({ animation, frames, duration: options.duration, snapshot: this.dataset.motion === 'auth-snapshot' });
      if (window.captureFade) { animation.pause(); animation.currentTime = options.duration * .4; }
    }
    return animation;
  };
});
const evidence = [];
try {
  await page.goto(`${origin}/welcome`);
  const initial = await page.locator('.app-arrival').evaluate(element => ({ name: getComputedStyle(element).animationName, duration: getComputedStyle(element).animationDuration }));
  assert.deepEqual(initial, { name: 'app-fade-in', duration: '0.16s' });
  for (const [label, destination, name] of [['Open web app', '/sign-in', 'welcome-sign-in'], ['About QR Chat', '/welcome', 'sign-in-welcome']]) {
    await page.evaluate(() => { window.fades = []; window.captureFade = true; });
    await page.getByRole('link', { name: label, exact: true }).first().click();
    await page.waitForURL(`${origin}${destination}`);
    await page.waitForFunction(() => window.fades.length >= 2);
    const fades = await page.evaluate(() => window.fades.map(({ frames, duration, snapshot }) => ({ frames, duration, snapshot })));
    assert.ok(fades.some(item => !item.snapshot && item.frames[0].opacity === 0 && item.duration === 160));
    assert.ok(fades.some(item => item.snapshot && item.frames[0].opacity === 1 && item.duration === 160));
    await page.screenshot({ path: `${output}/${name}-intermediate.png` });
    evidence.push({ name, fades });
    await page.evaluate(() => { window.captureFade = false; window.fades.forEach(item => item.animation.play()); });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-motion="auth-snapshot"]').count(), 0);
  }
  await page.goto(`${origin}/profile`);
  assert.equal(new URL(page.url()).pathname, '/sign-in');
  assert.equal(new URL(page.url()).searchParams.get('next'), '/profile');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
  await page.goto(`${origin}/auth/callback`);
  await page.getByText('Google did not return a sign-in code. Please try again.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Continue with Google', exact: true }).isEnabled(), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/sign-in`);
  assert.equal(await page.locator('.app-arrival').evaluate(element => getComputedStyle(element).animationName), 'none');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/anonymous-auth-motion.json`, JSON.stringify({ pass: true, authenticated: false, initial, evidence, protectedGuard: true, callbackErrorUsable: true, errors }, null, 2));
  console.log('PASS production anonymous auth: continuous public fades, document arrival, guard destination, usable callback failure, reduced motion');
} finally {
  await context.close();
  await page.video().saveAs(`${output}/auth-motion.webm`);
  await page.video().delete();
  console.log(`Recording: ${output}/auth-motion.webm`);
  await browser.close();
}
