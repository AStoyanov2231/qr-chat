import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state } from './support/native-harness.mjs';

process.env.QR_CHAT_TEST_COMPILED_ROOM = '1';
const { default: Room } = await import('../src/app/(app)/room.tsx');
const group = {
  id: 'room-one', venue: { name: 'Cafe', codes: ['Cafe-A'] }, members: [],
  messages: [{ id: '1', user: 'me', name: 'Andy', text: 'private room message', time: 0 }],
  nextCursor: null,
};

for (const platform of ['ios', 'android']) {
  test(`${platform}: compiled room survives membership removal and an empty initial snapshot`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { groupId: group.id, code: 'Cafe-A', name: 'Cafe' };
    const screen = await render(t, Room);
    assert.match(screen.text(), /Your membership has ended/);
    assert.equal(screen.root.findAllByType('TextInput').length, 0);

    state.chat = { ...state.chat, group };
    await screen.update();
    assert.match(screen.text(), /private room message/);
    assert.equal(screen.root.findAllByType('TextInput').length, 1);

    state.chat = { ...state.chat, group: null };
    await screen.update();
    assert.doesNotMatch(screen.text(), /private room message/);
    assert.equal(screen.root.findAllByType('TextInput').length, 0);
    await screen.press('Rejoin conversation');
    assert.deepEqual(state.navigation.at(-1), ['push', { pathname: '/join', params: { code: 'Cafe-A' } }]);
  });
}
