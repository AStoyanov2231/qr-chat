import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import QRCode from 'qrcode';

const { qrPng } = await import('../src/lib/qr-png.ts');

test('qrPng writes a valid 1-bit PNG whose pixels match the QR modules', () => {
  const text = 'https://chat.example/v/cafecentr2';
  const scale = 4, margin = 4;
  const png = Buffer.from(qrPng(text, scale, margin));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const side = png.readUInt32BE(16);
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  assert.equal(side, (modules.size + margin * 2) * scale);
  assert.equal(png.readUInt32BE(20), side);
  const idatLength = png.readUInt32BE(33);
  assert.equal(png.subarray(37, 41).toString(), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLength)); // also checks the adler32
  const rowBytes = Math.ceil(side / 8) + 1;
  const white = (x, y) => !!(raw[y * rowBytes + 1 + (x >> 3)] & (0x80 >> (x & 7)));
  for (let my = 0; my < modules.size; my++) for (let mx = 0; mx < modules.size; mx++) {
    assert.equal(white((mx + margin) * scale, (my + margin) * scale), !modules.get(my, mx));
  }
  assert.equal(white(0, 0), true);
  assert.equal(png.subarray(-8, -4).toString(), 'IEND');
});

test('qrPng splits large images across several stored zlib blocks', () => {
  const png = Buffer.from(qrPng('https://chat.example/v/cafecentr2', 24));
  const idatLength = png.readUInt32BE(33);
  assert.ok(inflateSync(png.subarray(41, 41 + idatLength)).length > 65535);
});
