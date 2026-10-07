import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act, navigate } from './support/native-harness.mjs';
import { createChatApi } from '../../../packages/api/src/index.ts';
import { resolveCode } from '../../web/src/lib/chat-view.ts';

const { default: Scan } = await import('../src/app/(app)/scan.tsx');
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
  test(`${platform}: scanning, joining and rejoining preserve the web QR key through Expo navigation`, async (t) => {
    process.env.EXPO_OS = platform;
    for (const code of codes) {
      reset();
      const calls = [];
      const api = createChatApi({ rpc: async (name, params) => {
        calls.push([name, params]);
        return { data: [{ group_id: groupId, display_name: params?.p_display_name ?? 'Cafe' }], error: null };
      } });
      state.auth.api = { saveProfile: async () => {}, resolveQrChatName: async () => ({ kind: 'missing' }), joinNamedGroup: api.joinNamedGroup };
      const scanner = await render(t, Scan);
      await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ data: code }); });
      navigate(state.navigation.at(-1)[1]);
      const join = await render(t, Join);
      await join.type('Chat name', 'Cafe');
      await join.press('Join chat');
      assert.deepEqual(calls, [['join_named_qr_group', { p_code_key: resolveCode(code, origin).codes[0], p_display_name: 'Cafe' }]], code);

      // A stale room requires a fresh camera scan before joining again.
      navigate(state.navigation.at(-1)[1]);
      const room = await render(t, Room);
      assert.ok(room.text().includes('Cafe'), 'The saved venue name is shown');
      assert.ok(!room.text().includes(code), 'The opaque QR key is not shown as a room name');
      await room.press('Scan to rejoin');
      assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
      const rescan = await render(t, Scan);
      await act(async () => { rescan.root.findByType('CameraView').props.onBarcodeScanned({ data: code }); });
      navigate(state.navigation.at(-1)[1]);
      const rejoin = await render(t, Join);
      await rejoin.type('Chat name', 'Cafe');
      await rejoin.press('Join chat');
      assert.deepEqual(calls.at(-1), ['join_named_qr_group', { p_code_key: code, p_display_name: 'Cafe' }]);

      // Opening an existing room from Groups follows the same route contract.
      navigate(roomRoute({ id: groupId, venue: { codes: [code], name: 'Cafe' } }));
      const reopened = await render(t, Room);
      await reopened.press('Scan to rejoin');
      assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
    }
  });

  test(`${platform}: handoff links cannot join until the QR is scanned, preserving percent escapes`, async (t) => {
    process.env.EXPO_OS = platform;
    for (const base of [`${origin}/chats`, 'qrchat://join']) {
      reset();
      const code = 'Room%2Fα%2525+&';
      const link = `${base}?code=${encodeURIComponent(code)}`;
      const pendingCode = codeFromLink(link, origin);
      navigate({ pathname: '/join', params: { code: pendingCode } });
      let joined;
      state.auth.api = { saveProfile: async () => {}, resolveQrChatName: async () => ({ kind: 'missing' }), joinNamedGroup: async (value, displayName) => { joined = [value, displayName]; return { group_id: groupId, display_name: displayName }; } };
      const screen = await render(t, Join);
      assert.equal(joined, undefined);
      assert.deepEqual(state.navigation.at(-1), ['replace', '/scan']);
      const scanner = await render(t, Scan);
      await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ data: `${origin}/chats?code=${encodeURIComponent(code)}` }); });
      navigate(state.navigation.at(-1)[1]);
      const scannedJoin = await render(t, Join);
      await scannedJoin.type('Chat name', 'Cafe');
      await scannedJoin.press('Join chat');
      assert.deepEqual(joined, [resolveCode(`${origin}/chats?code=${encodeURIComponent(code)}`, origin).codes[0], 'Cafe']);
    }
  });
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: a scanned chat with a known name opens the room without showing the join screen`, async (t) => {
    process.env.EXPO_OS = platform;
    reset();
    const joined = [];
    state.auth.api = { resolveQrChatName: async () => ({ kind: 'saved', name: 'Cafe' }),
      joinNamedGroup: async (code, name) => { joined.push([code, name]); return { group_id: groupId, display_name: name }; } };
    const scanner = await render(t, Scan);
    await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ data: 'https://venue.example/?table=4' }); });
    assert.deepEqual(joined, [['https://venue.example/?table=4', 'Cafe']]);
    assert.ok(!state.navigation.some(([, href]) => href?.pathname === '/join'), 'join screen is skipped');
    assert.deepEqual(state.navigation.at(-1), ['replace', roomRoute({ id: groupId, venue: { codes: ['https://venue.example/?table=4'], name: 'Cafe' } })]);
  });
}
