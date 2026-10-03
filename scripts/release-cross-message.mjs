import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const body = process.argv[2];
assert.ok(body, 'Provide a unique disposable group message token.');
const fixture = JSON.parse(readFileSync('/private/tmp/qr-chat-release-evidence/cross-client-state.json', 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
try {
 let page;
 for (const candidate of browser.contexts().flatMap(context => context.pages())) if (await candidate.evaluate(() => window.name === 'qr-chat-release-cross-client').catch(() => false)) page = candidate;
 assert.ok(page, 'Dedicated cross-client page must be open');
 await page.bringToFront();
 await page.goto(`http://127.0.0.1:3000/?code=${encodeURIComponent(fixture.code)}`);
 await page.getByLabel('Message', {exact:true}).fill(body, {timeout:45000});
 await page.getByRole('button', {name:'Send message',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('#message')?.value === '');
 await page.getByText(body,{exact:true}).waitFor();
 assert.equal(await page.getByText(body,{exact:true}).count(),1);
 console.log(JSON.stringify({sentThroughWebUI:body,timestamp:new Date().toISOString()}));
} finally { await browser.close(); }
