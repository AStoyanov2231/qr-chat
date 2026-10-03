import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../src/components/mobile-only.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;

function gate({ pathname, mobile, preview = false }) {
  const fixtureModule = { exports: {} };
  const LandingPage = () => null;
  const children = { product: 'content' };
  runInNewContext(`(function(require, module, exports) { ${output}\n})`, {
    window: { matchMedia: () => ({ matches: mobile }) },
  })((specifier) => {
    if (specifier === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (specifier === 'next/navigation') return { usePathname: () => pathname };
    if (specifier === './landing-page') return { LandingPage };
    return require(specifier);
  }, fixtureModule, fixtureModule.exports);
  return { result: fixtureModule.exports.MobileOnly({ children, preview }), children, LandingPage };
}

test('public landing never receives the development phone frame', () => {
  for (const mobile of [false, true]) {
    const { result, children } = gate({ pathname: '/welcome', mobile, preview: true });
    assert.equal(result, children);
  }
});

test('desktop product routes show landing and mobile product routes render their authenticated content', () => {
  for (const pathname of ['/', '/profile', '/sign-in']) {
    const desktop = gate({ pathname, mobile: false });
    assert.equal(desktop.result.type, desktop.LandingPage);
    const phone = gate({ pathname, mobile: true });
    assert.equal(phone.result, phone.children);
  }
});
