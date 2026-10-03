// Synthetic video pixels, real getUserMedia/qr-scanner, preview-only membership.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3010';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-transition-evidence';
mkdirSync(output, { recursive: true });
await QRCode.toFile(`${output}/scan-fixture.png`, 'https://qrchat.example/cafe-central', { width: 240, margin: 4 });
const video = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=white:size=480x480:rate=10:duration=8', '-loop', '1', '-i', `${output}/scan-fixture.png`, '-filter_complex', "[0:v][1:v]overlay=120:120:enable='gte(t,3)':shortest=1", '-t', '8', '-pix_fmt', 'yuv420p', `${output}/scan-fixture.y4m`], { encoding: 'utf8' });
assert.equal(video.status, 0, video.stderr);
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${output}/scan-fixture.y4m`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, recordVideo: { dir: output, size: { width: 390, height: 844 } } });
context.setDefaultTimeout(15000);
await context.grantPermissions(['camera'], { origin });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/\/_vercel\/insights\/|\/favicon\.ico$/.test(message.location().url)) errors.push(message.text());
});
await page.addInitScript(() => {
  window.motionTimeline = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function(frames, options) {
    const animation = animate.call(this, frames, options);
    if (this.matches('.app-content:not(.screen-snapshot), .camera-panel, .join-dialog')) {
      window.motionTimeline.push({ type: this.matches('.camera-panel, dialog') ? 'scanner' : 'screen', screen: this.dataset.screen, frames, at: performance.now(), duration: options.duration });
    }
    return animation;
  };
});
try {
  await page.goto(`${origin}/design-preview`);
  const scan = page.getByRole('button', { name: 'Scan a QR code', exact: true });
  await scan.click();
  await page.waitForFunction(() => document.querySelector('video')?.srcObject?.getVideoTracks().some(track => track.readyState === 'live'));
  const firstVideo = await page.locator('video').elementHandle();
  const stopped = await page.evaluate(() => {
    const tracks = document.querySelector('video').srcObject.getTracks();
    document.querySelector('.camera-dialog .modal-close').click();
    return tracks.every(track => track.readyState === 'ended');
  });
  assert.equal(stopped, true, 'Close stops tracks immediately, before exit');
  // Reopen while closing; the new video must never be stopped by old cleanup.
  await page.evaluate(() => document.querySelector('.floating-scan').click());
  await page.waitForFunction(old => document.querySelector('video') !== old, firstVideo);
  await page.waitForTimeout(650);
  assert.deepEqual(await page.locator('video').evaluate(element => element.srcObject?.getVideoTracks().map(track => track.readyState)), ['live']);
  await page.waitForFunction(() => document.querySelector('main.app-content')?.dataset.screen?.startsWith('group:'));
  await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
  const timeline = await page.evaluate(() => window.motionTimeline);
  const entry = timeline.find(item => item.type === 'screen');
  const lastExit = timeline.filter(item => item.type === 'scanner' && item.frames.at(-1).clipPath?.startsWith('circle(33px')).at(-1);
  assert.ok(entry && lastExit);
  assert.ok(entry.at - lastExit.at >= 280, 'Scanner exits before conversation slides');
  await page.screenshot({ path: `${output}/scanner-decoded-preview.png` });
  await page.getByRole('button', { name: 'Back to chats', exact: true }).click();
  await page.waitForTimeout(350);
  // Permission resolving after dismissal must stop its stream and never reopen.
  await page.evaluate(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.lateTracks = [];
    const permission = new Promise(resolve => { window.allowCamera = resolve; });
    navigator.mediaDevices.getUserMedia = async constraints => {
      await permission;
      const stream = await getUserMedia(constraints);
      window.lateTracks = stream.getTracks();
      return stream;
    };
  });
  await scan.click();
  await page.waitForFunction(() => typeof window.allowCamera === 'function');
  await page.keyboard.press('Escape');
  await page.locator('.camera-dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.allowCamera());
  await page.waitForFunction(() => window.lateTracks.length > 0 && window.lateTracks.every(track => track.readyState === 'ended'));
  assert.equal(await page.locator('.camera-dialog[open]').count(), 0);
  assert.equal(await page.locator('main.app-content').getAttribute('data-screen'), 'overview');
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/scanner-lifecycle.json`, JSON.stringify({ pass: true, syntheticVideo: true, previewMembership: true, immediateStop: stopped, timeline, latePermissionStopped: true, errors }, null, 2));
  console.log('PASS synthetic camera: real QR decode, immediate stop, reopen race, sequential exit/entry, late permission');
} finally {
  await context.close();
  await page.video().saveAs(`${output}/scanner-motion.webm`);
  await page.video().delete();
  console.log(`Recording: ${output}/scanner-motion.webm`);
  await browser.close();
}

// A new code follows the unchanged validation/join flow; no trigger uses a fade.
await QRCode.toFile(`${output}/join-fixture.png`, 'qrchat-transition-fixture-new-room', { width: 240, margin: 4 });
const joiningVideo = spawnSync('ffmpeg', ['-y', '-loop', '1', '-i', `${output}/join-fixture.png`, '-t', '2', '-r', '10', '-vf', 'pad=480:480:120:120:white', '-pix_fmt', 'yuv420p', `${output}/join-fixture.y4m`], { encoding: 'utf8' });
assert.equal(joiningVideo.status, 0, joiningVideo.stderr);
const joiningBrowser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${output}/join-fixture.y4m`] });
const joiningContext = await joiningBrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
joiningContext.setDefaultTimeout(15000);
await joiningContext.grantPermissions(['camera'], { origin });
const joiningPage = await joiningContext.newPage();
await joiningPage.addInitScript(() => {
  window.transitions = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function(frames, options) {
    if (this.matches('dialog, .camera-panel, .app-content:not(.screen-snapshot)')) window.transitions.push({ frames, duration: options.duration });
    return animate.call(this, frames, options);
  };
});
try {
  await joiningPage.goto(`${origin}/design-preview?code=qrchat-transition-fixture-new-room`);
  await joiningPage.getByLabel('Chat name', { exact: true }).waitFor();
  const fallback = await joiningPage.evaluate(() => window.transitions[0]);
  assert.deepEqual(fallback, { frames: [{ opacity: 0 }, { opacity: 1 }], duration: 160 });
  const join = joiningPage.getByRole('button', { name: /Join chat/ });
  assert.equal(await join.isDisabled(), true);
  await joiningPage.getByLabel('Chat name', { exact: true }).fill('Transition fixture room');
  await joiningPage.getByLabel('Your name', { exact: true }).fill('Transition fixture participant');
  await join.click();
  await joiningPage.getByLabel('Message', { exact: true }).waitFor();
  writeFileSync(`${output}/scanner-joining.json`, JSON.stringify({ pass: true, previewOnly: true, fallback, requiredNameValidation: true, joining: true }, null, 2));
  console.log('PASS preview QR join/validation and triggerless fade');
} finally {
  await joiningContext.close();
  await joiningBrowser.close();
}
