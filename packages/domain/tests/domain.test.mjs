import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chatRows,
  unwrapQrCode,
  messageAge,
  groupAccessIndicator,
  directMessagePreview,
  directConversationTime,
  groupInitials,
  resolveQrPageName,
  scannedCode,
  groupFallbackName,
  productGroupName,
} from '../src/index.ts';

test('retail barcodes normalize to one GTIN-13 key per product; QR codes stay opaque', () => {
  assert.equal(scannedCode('ean13', '5449000006271'), 'gtin:5449000006271');
  assert.equal(scannedCode('ean_13', '5449000006271'), 'gtin:5449000006271', 'web BarcodeDetector spelling');
  assert.equal(scannedCode('upc_a', '049000006278'), 'gtin:0049000006278', 'Android UPC-A matches iOS EAN-13 with a leading 0');
  assert.equal(scannedCode('ean13', '0049000006278'), 'gtin:0049000006278');
  assert.equal(scannedCode('ean8', '96385074'), 'gtin:0000096385074');
  assert.equal(scannedCode('upc_e', '01234565'), 'gtin:0012345000065', 'UPC-E expands to its UPC-A');
  assert.equal(scannedCode('qr', '5449000006271'), '5449000006271', 'a digits-only QR is not a product');
  assert.equal(scannedCode('qr_code', 'https://cafe.example/menu'), 'https://cafe.example/menu');
});

test('unnamed groups get a readable fallback label', () => {
  assert.equal(groupFallbackName('gtin:5449000006271'), 'Product 5449000006271');
  assert.equal(groupFallbackName('https://menu.cafe.example/table/4'), 'menu.cafe.example');
  assert.equal(groupFallbackName('Table 4'), 'Table 4');
  assert.equal(groupFallbackName('x'.repeat(60)), `${'x'.repeat(39)}…`);
});

test('product names prefer English and add the brand only when missing', () => {
  assert.equal(productGroupName({ product_name: 'Fanta Orange', brands: 'Fanta, Coca-Cola' }), 'Fanta Orange');
  assert.equal(productGroupName({ product_name_en: 'Orange juice', product_name: 'Портокалов сок', brands: 'Cappy' }), 'Cappy Orange juice');
  assert.equal(productGroupName({ product_name_en: '', product_name: 'Chips', brands: '' }), 'Chips');
  assert.equal(productGroupName({ brands: 'Fanta' }), 'Fanta');
  assert.equal(productGroupName({}), null);
  assert.equal(productGroupName({ product_name: 'x'.repeat(120) }).length, 100);
  // Real Open Food Facts rows: the brand is the manufacturer and the size sits in the name.
  assert.equal(productGroupName({ product_name_en: 'fanta Orange 0,33', product_name: 'fanta Orange 0,33', brands: 'COCA-COLA SERVICES SA/NV' }), 'fanta Orange');
  assert.equal(productGroupName({ product_name_en: '', product_name: 'Fanta orange', brands: 'Fanta' }), 'Fanta orange');
  assert.equal(productGroupName({ product_name: 'Coca-Cola Zero 1.5 L', brands: 'Coca-Cola' }), 'Coca-Cola Zero');
  assert.equal(productGroupName({ product_name: 'Water 500ml', brands: 'Devin' }), 'Devin Water');
});

test('QR handoffs preserve case, unicode, and URL-like opaque keys across clients', () => {
  assert.equal(unwrapQrCode('https://chat.example/chats?code=Room%26A', 'https://chat.example'), 'Room&A');
  assert.equal(unwrapQrCode('https://other.example/?code=Room', 'https://chat.example'), 'https://other.example/?code=Room');
  assert.equal(unwrapQrCode('https://chat.example.attacker.test/?code=Room', 'https://chat.example'), 'https://chat.example.attacker.test/?code=Room');
  assert.equal(unwrapQrCode('Room-α', ''), 'Room-α');
  assert.equal(unwrapQrCode('https://chat.example/?code=', 'https://chat.example'), '');
});
test('message age handles boundaries and clocks ahead of the device', () => {
  const now = 200_000_000;
  for (const [minutes, expected] of [[-1, 'Now'], [0, 'Now'], [1, '1m'], [59, '59m'], [60, '1h'], [1439, '23h'], [1440, '1d']]) {
    assert.equal(messageAge(now - minutes * 60000, now), expected);
  }
});

test('group access indicator displays a clamped 24-hour countdown without deciding membership access', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');
  assert.deepEqual(groupAccessIndicator('2026-10-01T18:00:00Z', now), {
    state: 'remaining', progress: 0.75, label: '18h left', accessibilityLabel: 'Your group access ends in 18 hours.',
  });
  assert.deepEqual(groupAccessIndicator('2026-10-01T00:17:00Z', now), {
    state: 'remaining', progress: 17 / 1440, label: '17m left', accessibilityLabel: 'Your group access ends in 17 minutes.',
  });
  assert.deepEqual(groupAccessIndicator('2026-10-01T00:00:59Z', now), {
    state: 'remaining', progress: 59 / 86_400, label: 'Under 1m left', accessibilityLabel: 'Your group access ends in less than one minute.',
  });
  assert.equal(groupAccessIndicator('2026-10-02T12:00:00Z', now).progress, 1, 'remaining time above 24 hours clamps at a full ring');
  assert.deepEqual(groupAccessIndicator(null, now), {
    state: 'unknown', progress: null, label: 'Time unavailable', accessibilityLabel: 'Group access time is unavailable.',
  });
  assert.equal(groupAccessIndicator('not-a-date', now).state, 'unknown');
  assert.equal(groupAccessIndicator('2026-10-01T18:00:00Z', Number.NaN).state, 'unknown');
  assert.deepEqual(groupAccessIndicator('2026-10-01T00:00:00Z', now), {
    state: 'ended', progress: 0, label: 'Access ended', accessibilityLabel: 'Your group access has ended.',
  });
  assert.equal(groupAccessIndicator('2026-09-30T23:59:59.999Z', now).state, 'ended', 'past expiries never show a live countdown');
});

test('direct message previews never claim an unknown sender is the current user', () => {
  assert.equal(directMessagePreview(null, 'self'), 'Say hello');
  assert.equal(directMessagePreview({ body: 'Hi', sender_id: 'self' }, 'self'), 'You: Hi');
  assert.equal(directMessagePreview({ body: 'Hi', sender_id: 'friend' }, 'self'), 'Hi');
  assert.equal(directMessagePreview({ body: 'Hi', sender_id: null }, null), 'Hi');
});

test('direct conversation time uses the first finite message or friendship timestamp', () => {
  const requestedAt = '2026-01-01T00:00:00Z';
  const acceptedAt = '2026-01-02T00:00:00Z';
  assert.equal(directConversationTime({ created_at: '2026-01-03T00:00:00Z' }, acceptedAt, requestedAt), Date.parse('2026-01-03T00:00:00Z'));
  assert.equal(directConversationTime({ created_at: 'invalid' }, acceptedAt, requestedAt), Date.parse(acceptedAt));
  assert.equal(directConversationTime(null, 'invalid', requestedAt), Date.parse(requestedAt));
  assert.equal(directConversationTime({ created_at: '1970-01-01T00:00:00Z' }, acceptedAt, requestedAt), 0);
  assert.equal(directConversationTime(null, 'invalid', 'invalid'), 0);
});

test('group initials use the first two Unicode word tokens', () => {
  assert.equal(groupInitials('Brew & Chat'), 'BC');
  assert.equal(groupInitials('Кафе № 2'), 'К2');
  assert.equal(groupInitials('   '), '');
});

test('QR page metadata resolves venue titles while rejecting generic, technical, and conflicting names', () => {
  const metadata = (overrides = {}) => ({
    structuredData: [], openGraphTitles: [], pageTitles: [], siteNames: [], ...overrides,
  });
  assert.equal(resolveQrPageName(metadata({
    openGraphTitles: ['Happy - Menu'], siteNames: ['Toast'],
  })), 'Happy');
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['Menu | Happy'] })), 'Happy');
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['Home page'] })), null);
  assert.equal(resolveQrPageName(metadata({ openGraphTitles: ['https://happy.example/menu'] })), null);
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['happy.example/menu'] })), null);
  assert.equal(resolveQrPageName(metadata({ pageTitles: ['84291'] })), null);
  assert.equal(resolveQrPageName(metadata({
    openGraphTitles: ['Happy Cafe'], pageTitles: ['Different Place'],
  })), null);
  assert.equal(resolveQrPageName(metadata({
    structuredData: [{ types: ['https://schema.org/Restaurant'], names: ['Happy Cafe'] }],
    openGraphTitles: ['Happy Cafe - Menu'],
  })), 'Happy Cafe');
});

test('chat rows mix groups, DMs and requests with the newest activity first', () => {
  const group = (id, time, expiresAt) => ({ id, messages: time ? [{ time: Date.parse(time) }] : [], expiresAt });
  const rows = chatRows(
    [group('quiet', null, '2026-01-02T10:00:00Z'), group('busy', '2026-01-01T12:00:00Z', '2026-01-02T00:00:00Z')],
    [
      { id: 'dm', accepted_at: '2026-01-01T00:00:00Z', requested_at: '2026-01-01T00:00:00Z' },
      { id: 'request', accepted_at: null, requested_at: '2026-01-01T11:00:00Z' },
    ],
    { dm: { status: 'ready', message: { created_at: '2026-01-01T13:00:00Z' } } },
  );
  assert.deepEqual(rows.map(row => `${row.kind}:${row.id}`), ['direct:dm', 'group:busy', 'request:request', 'group:quiet']);
});
