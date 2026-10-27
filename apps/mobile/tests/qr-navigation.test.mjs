import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act, navigate } from './support/native-harness.mjs';
import { createChatApi } from '../../../packages/api/src/index.ts';
import { resolveCode } from '../../web/src/lib/chat-view.ts';

const { default: Scan } = await import('../src/app/(app)/scan.tsx');
const { default: VenueLink } = await import('../src/app/v/[id].tsx');
const { default: Join } = await import('../src/app/(app)/join.tsx');
const { default: Room } = await import('../src/app/(app)/room.tsx');
const { roomRoute } = await import('../src/lib/room-route.ts');
const { codeFromLink } = await import('../src/lib/qr-link.ts');
const origin = 'https://chat.example';
const groupId = '11111111-1111-4111-8111-111111111111';
const codes = [
  'com.qrchat.mobile://expo-development-client/?url=http%3A%2F%2F192.168.100.56%3A8081',
  'https://venue.example/?table=Room%2fA&floor=%252F',
  'Room%2FA', 'Room/A', 'Room%252FA', 'Room%26A', 'Room%25AA',
  '100% ready', 'Room+α & #? / ☕',
];

for (const platform of ['ios', 'android']) {
  test(`${platform}: scanning and rejoining preserve the web QR key through Expo navigation`, async (t) => {
    process.env.EXPO_OS = platform;
    for (const code of codes) {
      reset();
      const calls = [];
      const api = createChatApi({ rpc: async (name, params) => { calls.push([name, params]); return { data: [{ group_id: groupId }], error: null }; } });
      state.auth.api = { joinGroup: api.joinGroup, resolveGroup: async () => 'Cafe' };
      const scanner = await render(t, Scan);
      await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ type: 'qr', data: code }); });
      assert.deepEqual(calls, [['join_qr_group', { p_code_key: resolveCode(code, origin).codes[0] }]], code);

      // A stale room requires a fresh camera scan before joining again.
      navigate(state.navigation.at(-1)[1]);
      const room = await render(t, Room);
      assert.ok(room.text().includes('Cafe'), 'The server-resolved name is shown');
      assert.ok(!room.text().includes(code), 'The opaque QR key is not shown as a room name');
      await room.press('Scan to rejoin');
      assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
      state.params = {};
      const rescan = await render(t, Scan);
      await act(async () => { rescan.root.findByType('CameraView').props.onBarcodeScanned({ type: 'qr', data: code }); });
      assert.deepEqual(calls.at(-1), ['join_qr_group', { p_code_key: resolveCode(code, origin).codes[0] }]);
    }
  });

  test(`${platform}: handoff links cannot join until the code is scanned, preserving percent escapes`, async (t) => {
    process.env.EXPO_OS = platform;
    for (const base of [`${origin}/chats`, 'qrchat://join']) {
      reset();
      const code = 'Room%2Fα%2525+&';
      const link = `${base}?code=${encodeURIComponent(code)}`;
      navigate({ pathname: '/join', params: { code: codeFromLink(link, origin) } });
      let joined;
      state.auth.api = { joinGroup: async (value) => { joined = value; return { group_id: groupId }; }, resolveGroup: async () => null };
      await render(t, Join);
      assert.equal(joined, undefined);
      assert.deepEqual(state.navigation.at(-1), ['replace', '/scan']);
      state.params = {};
      const scanner = await render(t, Scan);
      await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ type: 'qr', data: `${origin}/chats?code=${encodeURIComponent(code)}` }); });
      assert.equal(joined, resolveCode(`${origin}/chats?code=${encodeURIComponent(code)}`, origin).codes[0]);
    }
  });

  test(`${platform}: a product barcode joins its GTIN group and opens with a readable name until the server finds one`, async (t) => {
    process.env.EXPO_OS = platform;
    reset();
    const joined = [];
    state.auth.api = { joinGroup: async (code) => { joined.push(code); return { group_id: groupId }; }, resolveGroup: async () => null };
    const scanner = await render(t, Scan);
    await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ type: 'upc_a', data: '049000006278' }); });
    assert.deepEqual(joined, ['gtin:0049000006278']);
    assert.deepEqual(state.navigation.at(-1), ['replace', roomRoute({ id: groupId, venue: { codes: ['gtin:0049000006278'], name: 'Product 0049000006278' } })]);
  });

  test(`${platform}: a bad scan locks the camera briefly, never throws, and a later join error is not hidden`, async (t) => {
    process.env.EXPO_OS = platform;
    reset();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls = [];
    state.auth.api = { joinGroup: async (code) => { calls.push(code); throw new Error('Join failed.'); }, resolveGroup: async () => null };
    const scanner = await render(t, Scan);
    const scan = (data) => act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ type: 'qr', data }); });
    await scan('http://');
    assert.ok(scanner.text().includes('This QR code isn’t supported'), 'A malformed URL is reported, not thrown');
    t.mock.timers.tick(1200);
    await scan('Room-A');
    await scan('Room-A');
    assert.deepEqual(calls, ['Room-A'], 'A failed join is not retried on every frame');
    assert.ok(scanner.text().includes('Join failed.') && !scanner.text().includes('This QR code isn’t supported'), 'The stale scan error is cleared');
    t.mock.timers.tick(1200);
    await scan('Room-A');
    assert.equal(calls.length, 2, 'The camera scans again after the lock');
  });

  test(`${platform}: Close falls back to home after a deep-link cold start, and a scan before the chat is ready says so`, async (t) => {
    process.env.EXPO_OS = platform;
    reset();
    state.canGoBack = false;
    state.chat.ready = false;
    const scanner = await render(t, Scan);
    assert.ok(scanner.text().includes('Getting your chats ready'));
    const close = () => scanner.root.findByType('NativeStackScreen').props.options.headerRight().props.onPress();
    close();
    assert.deepEqual(state.navigation.at(-1), ['replace', '/']);
    state.canGoBack = true;
    close();
    assert.deepEqual(state.navigation.at(-1), ['back']);
  });

  test(`${platform}: a venue link joins its venue once signed in, and waits at sign-in until then`, async (t) => {
    process.env.EXPO_OS = platform;
    reset();
    state.params = { id: 'abcdefghij' };
    state.auth.userId = null;
    const signedOut = await render(t, VenueLink);
    assert.deepEqual(state.navigation, [], 'The destination stays on this route while signed out');
    assert.ok(signedOut.text().includes('Find your people'));
    state.auth.userId = 'me';
    await signedOut.update();
    assert.deepEqual(state.navigation.at(-1), ['replace', { pathname: '/scan', params: { code: 'v:abcdefghij' } }]);

    const joined = [];
    state.auth.api = { joinGroup: async (code) => { joined.push(code); return { group_id: groupId }; }, resolveGroup: async () => 'Cafe' };
    state.chat.ready = false;
    navigate(state.navigation.at(-1)[1]);
    const scanner = await render(t, Scan);
    assert.deepEqual(joined, [], 'The link waits for the chat to be ready');
    state.chat.ready = true;
    await scanner.update();
    assert.deepEqual(joined, ['v:abcdefghij']);
  });
}
