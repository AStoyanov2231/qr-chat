// Rendered preview checks. Camera APIs/decoder are real; the video source is synthetic.
// This does not prove live Google OAuth or physical-camera permission behavior.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9226');
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3010';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-transition-evidence';
mkdirSync(output, { recursive: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, recordVideo: { dir: output, size: { width: 390, height: 844 } } });
await context.grantPermissions([], { origin });
context.setDefaultTimeout(15000);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/\/_vercel\/insights\/|\/favicon\.ico$/.test(message.location().url)) errors.push(message.text());
});
await page.addInitScript(() => {
  window.motionLog = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function(frames, options) {
    const animation = animate.call(this, frames, options);
    if (this.matches('.app-content, .camera-panel, [data-camera-edge], .join-dialog, .app-arrival')) {
      window.motionLog.push({ animation, element: this, frames, duration: options.duration });
      if (window.captureMotion) { animation.pause(); animation.currentTime = options.duration * .4; }
    }
    return animation;
  };
});
const evidence = [];
const current = () => page.locator('main.app-content:not(.screen-snapshot)');
async function settle() {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}
async function motion(action, name, expected, direction = 1) {
  await page.evaluate(() => { window.motionLog = []; window.captureMotion = true; });
  await action();
  await page.waitForFunction(screen => document.querySelector('main.app-content:not(.screen-snapshot)')?.dataset.screen === screen, expected);
  const data = await page.evaluate(() => window.motionLog.filter(item => item.element.matches('.app-content')).map(item => ({ frames: item.frames, duration: item.duration, snapshot: item.element.classList.contains('screen-snapshot'), transform: getComputedStyle(item.element).transform, inert: item.element.inert })));
  const incoming = data.find(item => !item.snapshot);
  const outgoing = data.find(item => item.snapshot);
  assert.ok(incoming, `${name}: incoming motion`);
  assert.equal(incoming.duration, 240);
  assert.equal(incoming.frames[0].transform, `translateX(${direction * 100}%)`);
  assert.ok(outgoing, `${name}: outgoing screen ${JSON.stringify(data)}`);
  assert.equal(outgoing.frames[1].transform, `translateX(${-direction * 100}%)`);
  assert.equal(outgoing.inert, true);
  await page.screenshot({ path: `${output}/${name}-intermediate.png` });
  evidence.push({ name, data });
  await page.evaluate(() => { window.captureMotion = false; window.motionLog.forEach(item => item.animation.play()); });
  await settle();
  assert.equal(await page.locator('.screen-snapshot').count(), 0);
  assert.equal(await current().evaluate(element => element.inert), false);
}
async function noMotion(action, name) {
  await page.evaluate(() => { window.motionLog = []; });
  await action(); await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.motionLog.filter(item => item.element.matches('.app-content')).length), 0, name);
}
try {
  await page.goto(`${origin}/design-preview`);
  await page.getByRole('button', { name: 'Open direct message with Andy', exact: true }).waitFor();
  await settle();
  const groupScreen = 'group:https://qrchat.example/cafe-central';
  const dmScreen = 'direct:44444444-4444-4444-8444-000000000000';
  await motion(() => page.getByRole('button', { name: /^Open Cafe Central/ }).click(), 'group-forward', groupScreen);
  await noMotion(() => page.locator('#message').fill('Message updates must not move the screen'), 'draft edits');
  await noMotion(async () => { await page.getByRole('button', { name: 'Send message', exact: true }).click(); await page.getByText('Message updates must not move the screen', { exact: true }).waitFor(); }, 'message updates');
  await noMotion(() => page.evaluate(() => history.pushState(history.state, '', `${location.pathname}${location.search}&unrelated=1`)), 'same-conversation query');
  await page.getByRole('button', { name: 'Group settings', exact: true }).click();
  const settings = await page.locator('.group-sidebar-panel').evaluate(element => ({ name: getComputedStyle(element).animationName, duration: getComputedStyle(element).animationDuration }));
  assert.deepEqual(settings, { name: 'sidebar-slide-in', duration: '0.24s' });
  await page.getByRole('button', { name: 'Close group settings', exact: true }).click();
  await page.locator('.group-sidebar').waitFor({ state: 'detached' });
  await motion(() => page.getByRole('button', { name: 'Back to chats', exact: true }).click(), 'group-back', 'overview', -1);
  await motion(() => page.getByRole('button', { name: 'Open direct message with Andy', exact: true }).click(), 'direct-forward', dmScreen);
  await motion(() => page.goBack(), 'browser-back', 'overview', -1);
  await motion(() => page.goForward(), 'browser-forward', dmScreen, 1);
  await motion(() => page.getByRole('button', { name: 'Back to chats', exact: true }).click(), 'direct-back', 'overview', -1);
  await motion(() => page.getByRole('button', { name: 'Open your profile', exact: true }).click(), 'profile-forward', 'profile');
  await noMotion(async () => {
    await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
    await page.getByLabel('Display name', { exact: true }).fill('Saved preview profile');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.locator('.profile-dialog').waitFor({ state: 'hidden' });
  }, 'profile saves');
  await motion(() => page.goBack(), 'profile-browser-back', 'overview', -1);
  await motion(() => page.goForward(), 'profile-browser-forward', 'profile', 1);
  await motion(() => page.getByRole('link', { name: 'Back to chats', exact: true }).click(), 'profile-back', 'overview', -1);

  // Denial, retry, close geometry and focus in the real dialog lifecycle.
  const scan = page.getByRole('button', { name: 'Scan a QR code', exact: true });
  const trigger = await scan.boundingBox();
  await page.evaluate(() => { window.motionLog = []; window.captureMotion = true; });
  await scan.click();
  await page.locator('.camera-dialog[open]').waitFor();
  const opening = await page.evaluate(() => window.motionLog.find(item => item.element.matches('.camera-panel'))?.frames);
  assert.ok(opening?.[0].clipPath?.startsWith(`circle(${Math.min(trigger.width, trigger.height) / 2}px`));
  const openingEdges = await page.evaluate(() => window.motionLog.filter(item => item.element.matches('[data-camera-edge]')).map(item => ({ edge: item.element.dataset.cameraEdge, frames: item.frames, duration: item.duration })));
  assert.deepEqual(openingEdges.map(item => [item.edge, item.frames[0].transform, item.frames[1].transform, item.duration]), [
    ['top', 'translateY(-100%)', 'translateY(0)', 300],
    ['bottom', 'translateY(100%)', 'translateY(0)', 300],
  ]);
  await page.screenshot({ path: `${output}/scanner-open-intermediate.png` });
  evidence.push({ name: 'scanner-open', trigger, frames: opening });
  await page.evaluate(() => { window.captureMotion = false; window.motionLog.forEach(item => item.animation.play()); });
  await settle();
  await page.getByRole('button', { name: 'Try camera again', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Try camera again', exact: true }).click();
  await page.getByRole('button', { name: 'Try camera again', exact: true }).waitFor();
  await page.setViewportSize({ width: 430, height: 740 });
  await page.evaluate(() => { window.motionLog = []; window.captureMotion = true; });
  const movedTrigger = await scan.boundingBox();
  await page.locator('.camera-dialog .modal-close').click();
  await page.waitForFunction(() => document.querySelector('.camera-dialog')?.dataset.motion === 'closing');
  const closing = await page.evaluate(() => window.motionLog.find(item => item.element.matches('.camera-panel'))?.frames);
  assert.ok(closing[1].clipPath.startsWith(`circle(${movedTrigger.width / 2}px`));
  const closingEdges = await page.evaluate(() => window.motionLog.filter(item => item.element.matches('[data-camera-edge]')).map(item => ({ edge: item.element.dataset.cameraEdge, frames: item.frames, duration: item.duration })));
  assert.deepEqual(closingEdges.map(item => [item.edge, item.frames[0].transform, item.frames[1].transform, item.duration]), [
    ['top', 'translateY(0)', 'translateY(-100%)', 300],
    ['bottom', 'translateY(0)', 'translateY(100%)', 300],
  ]);
  await page.screenshot({ path: `${output}/scanner-close-resized-intermediate.png` });
  await page.evaluate(() => { window.captureMotion = false; window.motionLog.forEach(item => item.animation.play()); });
  await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
  assert.equal(await scan.evaluate(element => element === document.activeElement), true);
  evidence.push({ name: 'scanner-resized-close', movedTrigger, frames: closing });
  await page.getByRole('searchbox').focus();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole('searchbox').evaluate(element => element === document.activeElement), true, 'A completed scanner exit must not steal focus on later viewport changes');

  // Every visible scanner entry passes its own element, including rectangular buttons.
  await page.getByRole('button', { name: /^Open Cafe Central/ }).click(); await settle();
  await page.evaluate(() => { window.motionLog = []; window.dispatchEvent(new CustomEvent('qrchat-preview-state', { detail: 'expired' })); });
  const rejoin = page.getByRole('button', { name: 'Scan to rejoin', exact: true });
  await rejoin.waitFor();
  assert.equal(await page.evaluate(() => window.motionLog.filter(item => item.element.matches('.app-content')).length), 0, 'Membership updates must not replay navigation');
  for (const [triggerButton, name] of [[rejoin, 'scanner-rejoin'], [page.locator('.chat-list-empty .scan-primary'), 'scanner-empty-state']]) {
    if (name === 'scanner-empty-state') {
      await page.getByRole('button', { name: 'Back to chats', exact: true }).click(); await settle();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('qrchat-preview-state', { detail: 'empty' })));
      await triggerButton.waitFor();
    }
    const bounds = await triggerButton.boundingBox();
    await page.evaluate(() => { window.motionLog = []; window.captureMotion = true; });
    await triggerButton.click();
    const frames = await page.evaluate(() => window.motionLog.find(item => item.element.matches('.camera-panel'))?.frames);
    assert.ok(frames[0].clipPath.startsWith(`circle(${Math.min(bounds.width, bounds.height) / 2}px`));
    await page.screenshot({ path: `${output}/${name}-intermediate.png` });
    evidence.push({ name, bounds, frames });
    await page.evaluate(() => { window.captureMotion = false; window.motionLog.forEach(item => item.animation.play()); });
    await page.keyboard.press('Escape');
    await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
    assert.equal(await triggerButton.evaluate(element => element === document.activeElement), true);
  }
  // Restore the original fixture before independent navigation cases.
  await page.goto(`${origin}/design-preview`); await settle();

  // Rapid actions, including close/reopen before the old animation finishes.
  for (let i = 0; i < 3; i++) {
    await scan.click();
    await page.evaluate(() => { document.querySelector('.camera-dialog .modal-close').click(); document.querySelector('.floating-scan').click(); });
    await page.locator('.camera-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
  }
  await page.evaluate(() => document.querySelector('.group-card').click());
  await page.waitForFunction(() => document.querySelector('.chat-header-controls button'));
  await page.evaluate(() => document.querySelector('.chat-header-controls button').click());
  await page.waitForFunction(() => document.querySelector('.dm-row-open'));
  await page.evaluate(() => document.querySelector('.dm-row-open').click());
  await page.waitForFunction(screen => document.querySelector('main.app-content')?.dataset.screen === screen, dmScreen);
  await settle();
  assert.equal(await page.locator('.screen-snapshot').count(), 0);
  await page.getByRole('button', { name: 'Back to chats', exact: true }).click(); await settle();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await noMotion(() => page.getByRole('button', { name: /^Open Cafe Central/ }).click(), 'reduced spatial motion');
  await page.getByRole('button', { name: 'Back to chats', exact: true }).click();
  await scan.click(); await page.keyboard.press('Escape');
  await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Unavailable APIs still leave the intended screen and modal usable.
  await page.evaluate(() => { Element.prototype.animate = undefined; });
  await page.getByRole('button', { name: 'Open direct message with Andy', exact: true }).click();
  await page.getByRole('button', { name: 'Back to chats', exact: true }).click();
  await scan.click(); await page.keyboard.press('Escape');
  await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/preview-motion.json`, JSON.stringify({ pass: true, source: 'local design preview; camera denied; no authenticated session', settings, evidence, errors }, null, 2));
  console.log('PASS preview motion, history, settings, denial/retry, resize, focus, rapid actions, reduced motion, API fallback');
} finally {
  await context.close();
  await page.video().saveAs(`${output}/preview-motion.webm`);
  await page.video().delete();
  console.log(`Recording: ${output}/preview-motion.webm`);
  await browser.close();
}
