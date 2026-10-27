import QRCode from 'qrcode';

const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const u32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const join = (parts: (Uint8Array | number[])[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const chunk = (type: string, data: Uint8Array) => {
  const body = join([[...type].map((c) => c.charCodeAt(0)), data]);
  let c = 0xffffffff;
  for (const byte of body) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return join([u32(data.length), body, u32((c ^ 0xffffffff) >>> 0)]);
};

/**
 * A printable black-on-white QR code as PNG bytes, for sharing as an image file.
 * React Native has no canvas, so this writes a 1-bit PNG by hand.
 * Exactly `side` pixels wide like the web export, so module widths differ by at most a pixel.
 * ponytail: zlib "stored" blocks (no compression); a 1-bit 1024px image is about 130 KB.
 */
export function qrPng(text: string, side = 1024, margin = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const total = modules.size + margin * 2;
  const rowBytes = Math.ceil(side / 8) + 1; // filter byte 0, then pixels (bit 1 = white)
  const raw = new Uint8Array(rowBytes * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x * total / side) - margin, my = Math.floor(y * total / side) - margin;
    const dark = mx >= 0 && my >= 0 && mx < modules.size && my < modules.size && modules.get(my, mx);
    if (!dark) raw[y * rowBytes + 1 + (x >> 3)]! |= 0x80 >> (x & 7);
  }
  const parts: (Uint8Array | number[])[] = [[0x78, 0x01]];
  for (let at = 0; at < raw.length; at += 65535) {
    const block = raw.subarray(at, at + 65535);
    parts.push([at + 65535 >= raw.length ? 1 : 0, block.length & 0xff, block.length >> 8, ~block.length & 0xff, (~block.length >> 8) & 0xff], block);
  }
  let a = 1, b = 0;
  for (const byte of raw) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  parts.push(u32(((b << 16) | a) >>> 0));
  return join([
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', new Uint8Array([...u32(side), ...u32(side), 1, 0, 0, 0, 0])),
    chunk('IDAT', join(parts)),
    chunk('IEND', new Uint8Array()),
  ]);
}
