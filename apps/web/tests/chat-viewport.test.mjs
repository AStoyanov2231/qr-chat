import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeChatViewport } from '../src/lib/chat-viewport.ts';

function fixture(t) {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  const styles = new Map();
  const element = Object.assign(new EventTarget(), {
    dataset: {},
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
  });
  const callbacks = new Map();
  let frame = 0;
  const browser = Object.assign(new EventTarget(), {
    visualViewport: viewport, innerHeight: 844, innerWidth: 390, scrollY: 0,
    scrollTo: (x, y) => { browser.scrollY = y; viewport.offsetTop = y; },
    requestAnimationFrame: fn => { callbacks.set(++frame, fn); return frame; },
    cancelAnimationFrame: id => { callbacks.delete(id); },
  });
  const document = { activeElement: null };
  const previous = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const flush = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn()); };
  const resize = height => { viewport.height = height; viewport.dispatchEvent(new Event('resize')); flush(); };
  const focus = (composer = true) => { document.activeElement = { matches: () => composer }; element.dispatchEvent(new Event('focusin')); flush(); };
  return { viewport, browser, document, element, styles, flush, resize, focus };
}

test('keyboard expands only after a composer-focused viewport shrink and restores while still focused', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  f.focus();
  assert.equal(f.element.dataset.keyboard, 'closed', 'Hardware keyboard focus keeps the photo');
  f.resize(754);
  assert.equal(f.element.dataset.keyboard, 'closed', 'Browser chrome alone keeps the photo');
  f.resize(430);
  assert.equal(f.element.dataset.keyboard, 'open');
  assert.equal(f.styles.get('--app-height'), '430px');
  f.resize(744);
  assert.equal(f.element.dataset.keyboard, 'open', 'Closing frames do not flicker');
  f.resize(844);
  assert.equal(f.element.dataset.keyboard, 'closed');
  cleanup();
});

test('button taps keep the expanded chat until the keyboard actually closes', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  f.focus(); f.resize(430);
  f.document.activeElement = null;
  f.element.dispatchEvent(new Event('focusout')); f.flush();
  assert.equal(f.element.dataset.keyboard, 'open');
  f.resize(844);
  assert.equal(f.element.dataset.keyboard, 'closed');
  f.focus(false); f.resize(430);
  assert.equal(f.element.dataset.keyboard, 'closed', 'Other form fields never expand the chat');
  cleanup();
});

test('pinch zoom is ignored and keyboard focus never pans the outer page', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  f.focus(); f.viewport.scale = 2; f.resize(422);
  assert.equal(f.element.dataset.keyboard, 'closed');
  assert.equal(f.styles.get('--app-height'), '844px');
  f.viewport.scale = 1; f.resize(430);
  f.viewport.offsetTop = 30;
  f.viewport.dispatchEvent(new Event('scroll')); f.flush();
  assert.equal(f.styles.get('--app-top'), '0px');
  assert.equal(f.viewport.offsetTop, 0);
  cleanup();
});

test('orientation resets the baseline and layout-resizing keyboards retain the unfocused height', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  f.focus(); f.browser.innerHeight = 430; f.resize(430);
  assert.equal(f.element.dataset.keyboard, 'open');
  assert.equal(f.element.dataset.shortViewport, 'false', 'Keyboard resizing never changes the header layout');
  f.browser.innerWidth = 844; f.browser.innerHeight = 390; f.resize(390);
  assert.equal(f.element.dataset.keyboard, 'closed', 'Rotation alone is not a keyboard');
  assert.equal(f.element.dataset.shortViewport, 'true', 'A genuinely short screen keeps the compact header');
  f.resize(200);
  assert.equal(f.element.dataset.keyboard, 'open', 'Landscape keyboard is detected');
  cleanup();
});

test('touch focus suppresses Safari auto-pan before focus and restores the original input before painting', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  let focusedTransform;
  const input = {
    matches: selector => selector === '.message-composer input',
    style: { transform: '' },
    focus: options => {
      assert.equal(options.preventScroll, true);
      focusedTransform = input.style.transform;
      f.document.activeElement = input;
      f.element.dispatchEvent(new Event('focusin'));
    },
  };
  const tap = () => {
    const event = new Event('pointerdown', { cancelable: true });
    Object.defineProperties(event, { target: { value: input }, pointerType: { value: 'touch' } });
    f.element.dispatchEvent(event);
    return event;
  };
  assert.equal(tap().defaultPrevented, true, 'Cancel native focus before Safari computes its scroll target');
  assert.equal(focusedTransform, 'translateY(-1688px)');
  f.flush();
  assert.equal(input.style.transform, '', 'Restore before the next paint without replacing the input');
  assert.equal(tap().defaultPrevented, false, 'Already-focused input preserves text selection');
  f.document.activeElement = null;
  tap(); cleanup(); f.flush();
  assert.equal(input.style.transform, '', 'Unmount restores an input awaiting its paint');
});

test('Safari focus scrolling is reset instead of counter-moving the chat', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  f.focus();
  f.browser.innerHeight = 514;
  f.viewport.height = 514;
  f.viewport.offsetTop = 330;
  f.viewport.dispatchEvent(new Event('resize'));
  // Do not flush an animation frame: Safari can paint between the native events.
  assert.equal(f.styles.get('--app-height'), '514px');
  assert.equal(f.styles.get('--app-top'), '0px');
  assert.equal(f.viewport.offsetTop, 0, 'Cancel the native pan rather than copying its target into layout');
  assert.equal(f.element.dataset.keyboard, 'open');
  f.viewport.offsetTop = 0;
  f.browser.scrollY = 350;
  f.flush();
  assert.equal(f.browser.scrollY, 0, 'Pending focus scroll is reset even before Safari delivers a scroll event');
  assert.equal(f.styles.get('--app-top'), '0px');
  f.browser.scrollY = 360;
  f.browser.dispatchEvent(new Event('scroll'));
  assert.equal(f.browser.scrollY, 0, 'Document scroll events keep the outer page anchored');
  assert.equal(f.styles.get('--app-top'), '0px');
  f.browser.innerHeight = 844;
  f.viewport.height = 844;
  f.viewport.offsetTop = 0;
  f.browser.scrollY = 0;
  f.viewport.dispatchEvent(new Event('resize'));
  assert.equal(f.styles.get('--app-height'), '844px');
  assert.equal(f.styles.get('--app-top'), '0px');
  assert.equal(f.element.dataset.keyboard, 'closed');
  cleanup();
});

test('cleanup removes listeners and browsers without VisualViewport stay usable', t => {
  const f = fixture(t);
  const cleanup = observeChatViewport(f.element);
  f.viewport.dispatchEvent(new Event('resize'));
  cleanup(); f.flush(); f.resize(430); f.focus();
  f.browser.dispatchEvent(new Event('resize'));
  f.browser.dispatchEvent(new Event('scroll'));
  assert.deepEqual(f.element.dataset, {});
  assert.equal(f.styles.size, 0);
  f.browser.visualViewport = null;
  observeChatViewport(f.element)();
  assert.equal(f.styles.size, 0);
});
