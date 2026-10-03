import assert from 'node:assert/strict';
import { test } from 'node:test';
import { animateMotion, scannerCircle } from '../src/lib/motion.ts';

function browser(t, reduced = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const timers = new Map();
  let id = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    matchMedia: () => ({ matches: reduced }),
    setTimeout: fn => { timers.set(++id, fn); return id; },
    clearTimeout: key => timers.delete(key),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  return timers;
}

test('scanner circle uses viewport-relative trigger geometry and covers all corners after resize', () => {
  for (const panel of [{ left: 0, top: 0, width: 390, height: 844 }, { left: 40, top: 24, width: 430, height: 720 }]) {
    const trigger = { left: panel.left + 302, top: panel.top + 630, width: 66, height: 66 };
    const circles = scannerCircle(trigger, panel);
    assert.equal(circles.closed, 'circle(33px at 335px 663px)');
    const radius = Number(circles.open.match(/circle\(([^p]+)px/)[1]);
    for (const x of [0, panel.width]) for (const y of [0, panel.height]) assert.ok(radius >= Math.hypot(x - 335, y - 663));
  }
});

test('reduced motion and missing or failing animation APIs complete actions immediately', t => {
  browser(t, true);
  let completed = 0;
  animateMotion({ animate() { assert.fail('Reduced motion must not animate'); } }, [], 300, () => completed++);
  window.matchMedia = () => ({ matches: false });
  animateMotion({}, [], 300, () => completed++);
  animateMotion({ animate() { throw new Error('unsupported'); } }, [], 300, () => completed++);
  assert.equal(completed, 3);
});

test('cancelled motion cannot run stale navigation; completion and timeout run only once', async t => {
  const timers = browser(t);
  let resolve;
  let cancels = 0;
  let completed = 0;
  const element = { animate: () => ({ finished: new Promise(r => { resolve = r; }), cancel: () => cancels++ }) };
  const cancel = animateMotion(element, [], 300, () => completed++);
  cancel(); resolve(); await Promise.resolve();
  assert.equal(completed, 0); assert.equal(timers.size, 0);
  animateMotion(element, [], 300, () => completed++);
  [...timers.values()][0](); resolve(); await Promise.resolve();
  assert.equal(completed, 1); assert.equal(timers.size, 0); assert.equal(cancels, 2);
});
