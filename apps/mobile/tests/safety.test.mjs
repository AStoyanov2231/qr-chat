import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act } from './support/native-harness.mjs';

const { default: Person } = await import('../src/app/(app)/person/[id].tsx');
const { default: Report } = await import('../src/app/(app)/report.tsx');
const { default: Blocked } = await import('../src/app/(app)/blocked.tsx');
const { default: Settings } = await import('../src/app/(app)/settings.tsx');
const { GroupDetails } = await import('../src/components/group-details.tsx');
const group = { id: 'room-one', venue: { id: 'room-one', name: 'Cafe', codes: ['Cafe-A'], label: '' }, members: [{ id: 'me', name: 'Andy' }, { id: 'peer', name: 'Sam' }], messages: [], nextCursor: null };

for (const platform of ['ios', 'android']) {
  test(`${platform}: a member profile blocks after confirming, then offers Unblock instead of Add friend`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { id: 'peer' }; state.chat.groups = [group];
    const calls = [];
    state.auth.api.blockUser = async (id) => { calls.push(['block', id]); state.chat.blocked = [{ id, name: 'Sam' }]; };
    state.auth.api.unblockUser = async (id) => { calls.push(['unblock', id]); state.chat.blocked = []; };
    const screen = await render(t, Person);
    assert.match(screen.text(), /Add friend/);
    await screen.press('Block');
    const [title, , buttons] = state.alerts.at(-1);
    assert.equal(title, 'Block Sam?');
    await act(async () => { buttons.find((button) => button.style === 'destructive').onPress(); });
    await screen.update();
    assert.deepEqual(calls, [['block', 'peer']]);
    assert.doesNotMatch(screen.text(), /Add friend/);
    assert.match(screen.text(), /You blocked Sam/);
    await screen.press('Unblock');
    await screen.update();
    assert.deepEqual(calls.at(-1), ['unblock', 'peer']);
    assert.match(screen.text(), /Add friend/);
  });

  test(`${platform}: Report opens the report screen for that person or group`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { id: 'peer' }; state.chat.groups = [group];
    const screen = await render(t, Person);
    await screen.press('Report');
    assert.deepEqual(state.navigation.at(-1), ['push', { pathname: '/report', params: { userId: 'peer', name: 'Sam' } }]);
    const details = await render(t, GroupDetails, { group });
    await details.press('Report group');
    assert.deepEqual(state.navigation.at(-1), ['push', { pathname: '/report', params: { groupId: 'room-one', name: 'Cafe' } }]);
  });

  test(`${platform}: the report screen needs a reason and sends optional details`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { userId: 'peer', name: 'Sam' };
    const reports = [];
    state.auth.api.report = async (...args) => { reports.push(args); };
    const screen = await render(t, Report);
    await assert.rejects(screen.press('Send report'), /Disabled/);
    await screen.press('Harassment or hate');
    await screen.type('Details (optional)', 'Rude');
    await screen.press('Send report');
    assert.deepEqual(reports, [[{ userId: 'peer' }, { reason: 'harassment', details: 'Rude' }]]);
    assert.deepEqual(state.navigation.at(-1), ['back']);
  });

  test(`${platform}: Settings links to Blocked people, which unblocks`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const settings = await render(t, Settings);
    await settings.press('Blocked people');
    assert.deepEqual(state.navigation.at(-1), ['push', '/blocked']);
    const unblocked = [];
    state.auth.api.unblockUser = async (id) => { unblocked.push(id); state.chat.blocked = []; };
    state.chat.blocked = [{ id: 'peer', name: 'Sam' }];
    const screen = await render(t, Blocked);
    assert.match(screen.text(), /Sam/);
    await screen.press('Unblock');
    await screen.update();
    assert.deepEqual(unblocked, ['peer']);
    assert.match(screen.text(), /You haven’t blocked anyone/);
  });
}
