import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, pageMeta } from '../src/lib/page-meta.ts';

test('page metadata prefers Open Graph and decodes entities', () => {
  const html = `<title>Plain</title><meta name="twitter:image" content="/t.png"><meta content='Caf&eacute; &amp; Bar' property='og:title'><meta property="og:image" content="/og.jpg">`;
  assert.deepEqual(pageMeta(html), { title: 'Caf&eacute; & Bar', image: '/og.jpg' });
  assert.deepEqual(pageMeta('<title>\n Happy  Cafe </title>'), { title: 'Happy Cafe', image: null });
  assert.deepEqual(pageMeta('<p>none</p>'), { title: null, image: null });
});

test('non-public addresses are rejected', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(ip), true, ip);
});
