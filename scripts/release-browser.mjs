// Launch a disposable Chromium with a real QR video stream for release acceptance.
// No application routes, API responses, or camera decoder are mocked.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const QRCode = require('qrcode');
assert.ok(process.env.QR_CHAT_TEST_USERS_FILE, 'Set QR_CHAT_TEST_USERS_FILE to disposable users.');
const users = JSON.parse(readFileSync(process.env.QR_CHAT_TEST_USERS_FILE, 'utf8'));
const output = process.env.QR_CHAT_TEST_OUTPUT || '/private/tmp/qr-chat-release-evidence';
const code = process.env.QR_CHAT_TEST_CODE || `qrchat-release-${users[0].id}`;
mkdirSync(output, { recursive: true });
await QRCode.toFile(`${output}/camera-qr.png`, code, { width: 480, margin: 4 });
writeFileSync(`${output}/camera-code.txt`, code);
const conversion = spawnSync('ffmpeg', ['-y', '-loop', '1', '-i', `${output}/camera-qr.png`, '-t', '2', '-r', '10', '-vf', 'pad=960:960:240:240:white', '-pix_fmt', 'yuv420p', `${output}/camera-qr.y4m`], { encoding: 'utf8' });
assert.equal(conversion.status, 0, conversion.stderr);
const { chromium } = await import(process.env.QR_CHAT_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  channel: 'chromium', // The headless-shell binary does not implement macOS camera capture.
  headless: process.env.QR_CHAT_HEADED !== '1',
  args: ['--remote-debugging-port=9222', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${output}/camera-qr.y4m`],
});
console.log(`Release browser listening on http://127.0.0.1:9222; QR fixture: ${output}/camera-qr.png`);
process.on('SIGTERM', () => void browser.close());
process.on('SIGINT', () => void browser.close());
await new Promise((resolve) => browser.on('disconnected', resolve));
