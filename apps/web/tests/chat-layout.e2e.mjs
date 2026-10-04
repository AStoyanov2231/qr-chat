// Account-free layout regression. Run against the loopback development server.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9226');
const width = Number(process.env.QR_CHAT_TEST_WIDTH || 390);
const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'no-preference' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const origin = process.env.QR_CHAT_WEB_URL || 'http://127.0.0.1:3010';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-keyboard-evidence';
mkdirSync(output, { recursive: true });
await page.addInitScript(() => {
  let heightOverride = null;
  let documentScroll = 0;
  const viewport = Object.assign(new EventTarget(), { offsetTop: 0, scale: 1 });
  Object.defineProperty(viewport, 'height', { get: () => heightOverride ?? innerHeight });
  Object.defineProperty(window, 'visualViewport', { value: viewport });
  Object.defineProperty(window, 'scrollY', { get: () => documentScroll });
  window.scrollTo = (_x, y) => {
    documentScroll = y;
    viewport.offsetTop = y;
    document.body.style.top = `${-y}px`;
  };
  window.resizeChatViewport = height => { heightOverride = height; viewport.dispatchEvent(new Event('resize')); };
  window.panChatDocument = top => {
    documentScroll = top;
    document.body.style.top = `${-top}px`;
  };
});
async function settle() {
  await page.locator('.chat-conversation-surface').evaluate(async element => {
    await new Promise(requestAnimationFrame);
    await Promise.all(element.closest('.qr-app').getAnimations({ subtree: true }).map(animation => animation.finished));
  });
}
async function resize(height) {
  await page.evaluate(height => window.resizeChatViewport(height), height);
  await settle();
}
async function geometry() {
  return page.evaluate(() => {
    const bounds = selector => {
      const { top, bottom, height } = document.querySelector(selector).getBoundingClientRect();
      return { top, bottom, height };
    };
    const button = document.querySelector('.chat-header-controls button');
    const rect = button.getBoundingClientRect();
    const stream = document.querySelector('.message-stream');
    return {
      state: document.querySelector('.qr-app').dataset.keyboard,
      app: bounds('.qr-app'), surface: bounds('.chat-conversation-surface'), photo: bounds('.chat-header-backdrop'),
      controls: bounds('.chat-header-controls'), composer: bounds('.message-composer-pill'),
      radius: getComputedStyle(document.querySelector('.chat-conversation-surface')).borderTopLeftRadius,
      buttonReachable: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button,
      bottomGap: stream.scrollHeight - stream.scrollTop - stream.clientHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
try {
  await page.goto(`${origin}/?code=${encodeURIComponent('https://qrchat.example/cafe-central')}`);
  await page.getByLabel('Message', { exact: true }).waitFor();
  for (const chat of ['group', 'direct']) {
    const input = page.getByLabel(chat === 'group' ? 'Message' : 'Direct message', { exact: true });
    await input.evaluate(element => {
      element.addEventListener('focus', () => { window.composerFocusTransform = element.style.transform; }, { once: true });
    });
    await input.tap();
    await input.evaluate(async element => {
      await new Promise(requestAnimationFrame);
      if (document.activeElement !== element || element.style.transform) throw new Error('Touch focus must keep the original input visible and editable');
    });
    assert.match(await page.evaluate(() => window.composerFocusTransform), /^translateY\(-/, 'Touch focus is protected before Safari computes an automatic scroll target');
    await input.fill('A draft that survives keyboard toggles');
    const closed = await geometry();
    assert.equal(closed.state, 'closed', 'Focus alone must not hide the photo');
    assert.equal(closed.composer.height, 50);
    assert.equal(closed.radius, '28px', 'The chat retains its curved edge');
    await page.evaluate(() => {
      const controls = document.querySelector('.chat-header-controls');
      window.chatControls = controls;
      window.chatControlButtons = [...controls.querySelectorAll('button')];
    });
    assert.ok(await page.evaluate(() => {
      const controls = window.chatControls;
      return controls.parentElement === document.querySelector('.conversation-view') &&
        controls.parentElement === document.querySelector('.chat-photo-header').parentElement &&
        controls.parentElement === document.querySelector('.chat-conversation-surface').parentElement;
    }), 'Controls occupy their own sibling layer beside the photo and chat');
    await page.screenshot({ path: `${output}/${chat}-closed.png` });
    const samples = await page.evaluate(async () => {
      window.resizeChatViewport(430);
      const samples = [];
      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        const controls = document.querySelector('.chat-header-controls');
        samples.push({ surface: document.querySelector('.chat-conversation-surface').getBoundingClientRect().top, photo: document.querySelector('.chat-header-backdrop').getBoundingClientRect().top, controls: controls.getBoundingClientRect().top, composer: document.querySelector('.message-composer').getBoundingClientRect().bottom,
          radius: getComputedStyle(document.querySelector('.chat-conversation-surface')).borderTopLeftRadius,
          persistent: document.querySelectorAll('.chat-header-controls').length === 1 && controls === window.chatControls && [...controls.querySelectorAll('button')].every((button, index) => button === window.chatControlButtons[index]),
          reachable: window.chatControlButtons.every(button => { const rect = button.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button; }) });
      }
      return samples;
    });
    assert.ok(samples.some(sample => sample.surface > 1 && sample.surface < closed.surface.top - 1), `Expansion has intermediate animation frames: ${JSON.stringify({ closed, samples: samples.slice(0, 8) })}`);
    for (let i = 1; i < samples.length; i++) {
      assert.ok(samples[i].surface <= samples[i - 1].surface + .1, 'Surface moves smoothly upward');
      assert.ok(samples[i].photo <= samples[i - 1].photo + .1, 'Photo slides upward');
      assert.equal(samples[i].controls, closed.controls.top, 'Controls stay anchored');
      assert.ok(samples[i].composer <= samples[i - 1].composer + .1, 'Composer moves smoothly upward');
    }
    assert.ok(samples.some(sample => sample.composer > 431 && sample.composer < closed.composer.bottom - 1), 'Composer has intermediate resize frames instead of jumping to its final position');
    assert.ok(samples.every(sample => sample.persistent && sample.reachable), 'The original controls stay mounted and above the moving chat throughout expansion');
    assert.ok(samples.every(sample => sample.radius === '28px'), 'Expansion never changes the chat curve');
    await settle();
    const opened = await geometry();
    assert.equal(opened.state, 'open');
    assert.equal(opened.surface.top, opened.app.top);
    assert.ok(opened.photo.bottom <= opened.app.top + .1, 'Photo leaves the viewport');
    assert.ok(opened.composer.bottom <= opened.app.bottom, 'Composer is visible above the keyboard');
    assert.ok(opened.buttonReachable && !opened.overflow);
    assert.ok(opened.bottomGap < 2, 'Latest message remains visible as the stream resizes');
    await page.screenshot({ path: `${output}/${chat}-open.png`, clip: { x: 0, y: 0, width, height: 430 } });
    const closing = await page.evaluate(async () => {
      window.resizeChatViewport(844);
      const samples = [];
      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        const controls = document.querySelector('.chat-header-controls');
        samples.push({ surface: document.querySelector('.chat-conversation-surface').getBoundingClientRect().top, controls: controls.getBoundingClientRect().top,
          radius: getComputedStyle(document.querySelector('.chat-conversation-surface')).borderTopLeftRadius,
          persistent: document.querySelectorAll('.chat-header-controls').length === 1 && controls === window.chatControls && [...controls.querySelectorAll('button')].every((button, index) => button === window.chatControlButtons[index]),
          reachable: window.chatControlButtons.every(button => { const rect = button.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button; }) });
      }
      return samples;
    });
    assert.ok(closing.some(sample => sample.surface > 1 && sample.surface < closed.surface.top - 1), 'Restoration has intermediate frames');
    for (let i = 1; i < closing.length; i++) assert.ok(closing[i].surface >= closing[i - 1].surface - .1, 'Surface restores smoothly downward');
    assert.ok(closing.every(sample => sample.controls === closed.controls.top && sample.persistent && sample.reachable), 'The original controls stay anchored above the layers throughout restoration');
    assert.ok(closing.every(sample => sample.radius === '28px'), 'Restoration never changes the chat curve');
    await settle();
    assert.equal((await geometry()).surface.top, closed.surface.top, 'Photo and surface restore');
    for (let i = 0; i < 3; i++) { await resize(430); await resize(844); }
    await page.evaluate(async () => {
      for (const height of [430, 844, 430, 844]) {
        window.resizeChatViewport(height);
        for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
      }
    });
    await settle();
    assert.equal((await geometry()).surface.top, closed.surface.top, 'Interrupted transitions return to the original layout');
    const panning = await page.evaluate(async () => {
      window.resizeChatViewport(430);
      for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
      // Safari pans the document before updating offsetTop or firing scroll.
      window.panChatDocument(330);
      const samples = [];
      for (let frame = 0; frame < 20; frame++) {
        await new Promise(requestAnimationFrame);
        samples.push({ app: document.querySelector('.qr-app').getBoundingClientRect().top, controls: document.querySelector('.chat-header-controls').getBoundingClientRect().top, composer: document.querySelector('.message-composer').getBoundingClientRect().bottom, scroll: window.scrollY });
      }
      window.panChatDocument(0);
      window.resizeChatViewport(844);
      return samples;
    });
    assert.ok(panning.every(sample => Math.abs(sample.app) < 1 && sample.controls === closed.controls.top && sample.scroll === 0 && sample.composer > 370 && sample.composer < closed.composer.bottom), 'Delayed Safari focus scrolling never shifts the app, controls or composer to the top');
    await settle();
    assert.equal(await input.inputValue(), 'A draft that survives keyboard toggles');
    assert.ok(await page.evaluate(() => document.querySelector('.chat-header-controls') === window.chatControls && window.chatControlButtons.every(button => button.isConnected)), 'Keyboard toggles never replace the controls');
    await resize(430);
    if (chat === 'group') {
      await page.getByRole('button', { name: 'Group settings', exact: true }).click();
      await page.getByRole('button', { name: 'Close group settings', exact: true }).click();
    } else assert.equal(await page.getByRole('button', { name: 'Conversation settings', exact: true }).count(), 0);
    await resize(844);
    console.log(`PASS: ${chat} keyboard expansion, smooth frames, anchored controls, compact composer, draft retention and settings`);
    await page.getByRole('button', { name: 'Back to chats', exact: true }).click();
    if (chat === 'group') await page.getByRole('button', { name: 'Open direct message with Andy', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Open direct message with Andy', exact: true }).click();
  await page.getByLabel('Direct message', { exact: true }).focus();
  await page.evaluate(() => {
    const stream = document.querySelector('.message-stream');
    for (let i = 0; i < 30; i++) stream.insertBefore(stream.querySelector('article').cloneNode(true), stream.lastElementChild);
    stream.scrollTop = 40;
  });
  await resize(430);
  assert.ok((await geometry()).bottomGap > 500, 'Reading history does not jump to the newest message');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await resize(844);
  assert.equal((await geometry()).state, 'closed');
  await page.setViewportSize({ width: 500, height: 360 });
  await resize(360);
  await page.getByLabel('Direct message', { exact: true }).focus();
  await resize(190);
  const landscape = await geometry();
  assert.equal(landscape.state, 'open');
  assert.ok(landscape.composer.bottom <= landscape.app.bottom && landscape.buttonReachable && !landscape.overflow);
  assert.deepEqual(errors, []);
  console.log('PASS: history position, reduced motion, no runtime errors');
} finally {
  await context.close();
  await browser.close();
}
