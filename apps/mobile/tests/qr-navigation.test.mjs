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
        return { data: [{ group_id: groupId }], error: null };
      } });
      state.auth.api = { saveProfile: async () => {}, joinGroup: api.joinGroup };
      const scanner = await render(t, Scan);
      await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ data: code }); });
      navigate(state.navigation.at(-1)[1]);
      const join = await render(t, Join);
      await join.press('Join chat');
      assert.deepEqual(calls, [['join_qr_group', { p_code_key: resolveCode(code, origin).codes[0] }]], code);

      // A stale room must preserve the original opaque key when it offers rejoin.
      navigate(state.navigation.at(-1)[1]);
      const room = await render(t, Room);
      assert.ok(room.text().includes(code), 'Fallback title preserves the QR text');
      await room.press('Rejoin conversation');
      navigate(state.navigation.at(-1)[1]);
      const rejoin = await render(t, Join);
      await rejoin.press('Join chat');
      assert.equal(calls.at(-1)[1].p_code_key, code);

      // Opening an existing room from Groups follows the same route contract.
      navigate(roomRoute({ id: groupId, venue: { codes: [code], name: code } }));
      const reopened = await render(t, Room);
      await reopened.press('Rejoin conversation');
      navigate(state.navigation.at(-1)[1]);
      const fromGroups = await render(t, Join);
      await fromGroups.press('Join chat');
      assert.equal(calls.at(-1)[1].p_code_key, code);
    }
  });

  test(`${platform}: web and native handoff links preserve percent escapes in the joined key`, async (t) => {
    process.env.EXPO_OS = platform;
    for (const base of [`${origin}/chats`, 'qrchat://join']) {
      reset();
      const code = 'Room%2Fα%2525+&';
      const link = `${base}?code=${encodeURIComponent(code)}`;
      const pendingCode = codeFromLink(link, origin);
      navigate({ pathname: '/join', params: { code: pendingCode } });
      let joined;
      state.auth.api = { saveProfile: async () => {}, joinGroup: async value => { joined = value; return { group_id: groupId }; } };
      const screen = await render(t, Join);
      await screen.press('Join chat');
      assert.equal(joined, resolveCode(`${origin}/chats?code=${encodeURIComponent(code)}`, origin).codes[0]);
    }
  });
}
