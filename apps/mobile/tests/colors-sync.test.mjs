import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../web/src/app/globals.css', import.meta.url), 'utf8');
const native = readFileSync(new URL('../src/components/chat-ui.tsx', import.meta.url), 'utf8');

const root = css.match(/:root\s*{([\s\S]*?)\n}/)[1];
const web = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*([^;]+?);/g)].map(([, name, value]) => [name, value]));
const colors = Object.fromEntries([...native.match(/export const colors = {([\s\S]*?)\n};/)[1].matchAll(/(\w+):\s*'([^']+)'/g)].map(([, name, value]) => [name, value]));

// Compare as [r, g, b, a] so `#fff`, `rgba(255,255,255,1)` and `.94` vs `0.94` all match.
const rgba = (value) => {
  const hex = value.match(/^#(\w{3}|\w{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  return value.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number).concat(1).slice(0, 4);
};
const kebab = (name) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
// Native has no gradient, so it uses the mean of the web gradient's two stops.
const mean = { photoScrim: ['photo-scrim-top', 'photo-scrim-bottom'] };

test('native colors match the web :root tokens', () => {
  assert.ok(Object.keys(colors).length > 20);
  for (const [name, value] of Object.entries(colors)) {
    if (mean[name]) {
      const [top, bottom] = mean[name].map(token => rgba(web[token]));
      const [r, g, b, a] = rgba(value);
      assert.deepEqual([r, g, b], top.slice(0, 3), name);
      assert.ok(Math.abs(a - (top[3] + bottom[3]) / 2) < 0.005, `${name} alpha`);
    } else {
      assert.ok(web[kebab(name)], `no web token --${kebab(name)} for colors.${name}`);
      assert.deepEqual(rgba(value), rgba(web[kebab(name)]), name);
    }
  }
});
