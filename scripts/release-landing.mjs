// Public localhost browser checks only: no credentials, authenticated fixtures, or backend writes.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QR_CHAT_WEB_URL || 'http://localhost:3000';
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
mkdirSync(output, { recursive: true });
const browser = await chromium.connectOverCDP(process.env.QR_CHAT_BROWSER_URL || 'http://127.0.0.1:9222');
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
try {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/welcome`, { timeout: 120000 });
    assert.equal(await page.locator('.local-design-frame').count(), 0, 'Use production mode or a non-preview host; design preview is not release evidence');
    await page.getByRole('heading', { name: /A little\s*closer\./ }).waitFor();
    const canvas = page.getByRole('img', { name: 'Scan to open QR Chat in your phone’s browser', exact: true });
    await canvas.waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open web app', exact: true }).getAttribute('href'), '/sign-in');
    for (const platform of ['iOS', 'Android']) {
      const slot = page.getByLabel(`${platform} download QR code unavailable`, { exact: true });
      assert.equal(await slot.locator('*').count(), 0);
      assert.equal(await slot.textContent(), '');
    }
    assert.equal(await page.getByText('Not available yet', { exact: true }).count(), 2);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      smallTargets: [...document.querySelectorAll('a,button,input')].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height && (rect.width < 44 || rect.height < 44);
      }).map((element) => ({ label: element.textContent?.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
    }));
    assert.equal(layout.overflow, false, `No overflow at ${width}px`);
    assert.deepEqual(layout.smallTargets, [], `44px targets at ${width}px`);
    await page.screenshot({ path: `${output}/landing-${width}.png`, fullPage: true });
    checks.push(`Landing ${width}px: no overflow; minimum 44px targets; web entry and empty unavailable native slots`);
  }
  await page.addScriptTag({ path: require.resolve('qr-scanner') });
  const workerSource = readFileSync(join(dirname(require.resolve('qr-scanner')), 'qr-scanner-worker.min.js'), 'utf8');
  const decoded = await page.evaluate(async (source) => {
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    const { createWorker } = await import(moduleUrl);
    const worker = createWorker();
    try { return await window.QrScanner.scanImage(document.querySelector('.landing-qr canvas'), { qrEngine: worker, returnDetailedScanResult: true }); }
    finally { worker.terminate(); URL.revokeObjectURL(moduleUrl); }
  }, workerSource);
  assert.equal(decoded.data, `${origin}/sign-in`);
  checks.push('Generated web QR independently decodes to the web sign-in route');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const phone = await mobile.newPage();
    phone.on('pageerror', (error) => errors.push(error.message));
    await phone.goto(`${origin}/sign-in`);
    await phone.getByRole('button', { name: /Google/ }).waitFor();
    assert.equal(await phone.getByRole('button', { name: /Apple|Facebook|email|password/i }).count(), 0);
    await phone.screenshot({ path: `${output}/web-sign-in-mobile.png` });
    await phone.setViewportSize({ width: 844, height: 390 });
    await phone.getByRole('button', { name: /Google/ }).waitFor();
    await phone.screenshot({ path: `${output}/web-sign-in-landscape.png` });
  } finally { await mobile.close(); }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/sign-in`);
    await page.getByRole('heading', { name: /A little\s*closer\./ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Google/ }).count(), 0);
  }
  checks.push('Touch mobile sign-in offers Google only in portrait and landscape; mouse desktop stays on landing even at 390px');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(checks.map((check) => `PASS: ${check}`).join('\n'));
} catch (error) {
  await page.screenshot({ path: `${output}/landing-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(`${output}/landing-acceptance.json`, JSON.stringify({ completed: checks, timestamp: new Date().toISOString() }, null, 2));
  await context.close();
  await browser.close();
}
