import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, reset, render, state } from './support/native-harness.mjs';

const { default: Room } = await import('../src/app/(app)/room.tsx');
const { default: Layout } = await import('../src/app/(app)/_layout.tsx');
const { default: Members } = await import('../src/app/(app)/members.tsx');
const { default: Profile } = await import('../src/app/(app)/profile.tsx');
const { default: EditProfile } = await import('../src/app/(app)/edit-profile.tsx');
const { default: Direct } = await import('../src/app/(app)/direct/[id].tsx');
const { notify, useNotice } = await import('../src/lib/notice.ts');
const group = { id: 'room-one', venue: { id: 'room-one', name: 'Cafe', codes: ['Cafe-A'], label: '' }, members: [{ id: 'me', name: 'Andy' }, { id: 'peer', name: 'Sam' }], messages: [], nextCursor: null };
const friendId = '11111111-1111-4111-8111-111111111111';
const Notice = () => React.createElement('Text', null, `notice:${useNotice()}`);

for (const platform of ['ios', 'android']) {
  test(`${platform}: a group that failed to load shows its own error`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { groupId: group.id };
    state.chat.groups = [group];
    state.chat.groupErrors = { [group.id]: 'Could not load messages.' };
    const screen = await render(t, Room);
    assert.match(screen.text(), /Could not load messages\./);
    state.chat.groupErrors = { other: 'Elsewhere' };
    await screen.update();
    assert.doesNotMatch(screen.text(), /Elsewhere|Could not load messages\./);
  });

  test(`${platform}: an unknown product group can be named by a member`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { groupId: group.id };
    const named = [];
    let refreshed = 0;
    state.chat.refresh = async () => { refreshed++; };
    state.auth.api.nameProductGroup = async (...args) => { named.push(args); };
    state.chat.groups = [{ ...group, venue: { ...group.venue, codes: ['gtin:123'], nameMissing: true } }];
    const screen = await render(t, Room);
    const label = 'We couldn’t find this product. Name it for everyone who scans it:';
    await assert.rejects(screen.press('Save'), /Disabled button/, 'Save waits for a name');
    await screen.type(label, 'Fanta');
    await screen.press('Save');
    assert.deepEqual(named, [[group.id, 'Fanta']]);
    assert.equal(refreshed, 1);
    state.chat.groups = [{ ...group, venue: { ...group.venue, codes: ['Cafe-A'], nameMissing: true } }];
    await screen.update();
    assert.equal(screen.root.findAllByType('NativeTextInput').some(node => node.props.accessibilityLabel === label), false, 'Only product codes can be named');
  });

  test(`${platform}: one banner covers offline and reconnecting, not polling or the first connect`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const screen = await render(t, Layout);
    for (const connection of ['connected', 'connecting', 'polling']) {
      state.chat.connection = connection; await screen.update();
      assert.doesNotMatch(screen.text(), /Reconnecting|offline/, connection);
    }
    state.chat.connection = 'reconnecting'; await screen.update();
    assert.match(screen.text(), /Reconnecting… Your chats will refresh when connected\./);
    state.networkState = { isConnected: false, isInternetReachable: false }; await screen.update();
    assert.match(screen.text(), /You’re offline\./);
    assert.doesNotMatch(screen.text(), /Reconnecting/, 'offline wins over reconnecting');
    state.chat.connection = 'connected'; await screen.update();
    assert.match(screen.text(), /You’re offline\./);
  });

  test(`${platform}: a direct conversation does not repeat the reconnect text`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { id: friendId };
    state.chat.friends = [{ id: friendId, user_a_id: 'me', user_b_id: 'peer', accepted_at: '2026-09-19', user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } }];
    state.chat.connection = 'reconnecting';
    const screen = await render(t, Direct);
    assert.doesNotMatch(screen.text(), /Reconnecting/);
  });

  test(`${platform}: toasts show app-wide and clear themselves`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const screen = await render(t, Layout);
    await act(async () => { notify('Profile saved.'); });
    assert.match(screen.text(), /Profile saved\./);
    await act(async () => { t.mock.timers.tick(4500); });
    assert.doesNotMatch(screen.text(), /Profile saved\./);
  });

  test(`${platform}: saving a profile and answering a request confirm with a toast`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { id: friendId };
    state.auth.api.saveProfileWithAvatar = async () => {};
    const edit = await render(t, EditProfile);
    await edit.press('Save profile');
    const probe = await render(t, Notice);
    assert.match(probe.text(), /notice:Profile saved\./);
    const incoming = { id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'peer', requested_at: '2026-10-01T10:00:00Z', accepted_at: null, user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } };
    state.chat.friends = [incoming];
    state.auth.api.acceptFriend = async () => {};
    state.auth.api.removeFriend = async () => {};
    const direct = await render(t, Direct);
    await direct.press('Accept');
    await probe.update();
    assert.match(probe.text(), /notice:You and Sam are now friends\./);
    await direct.press('Decline');
    await probe.update();
    assert.match(probe.text(), /notice:Declined Sam’s friend request\./);
  });

  test(`${platform}: tapping your own row opens the profile hub`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { groupId: group.id }; state.chat.groups = [group];
    const screen = await render(t, Members);
    await screen.press("View Andy's profile");
    assert.deepEqual(state.navigation.at(-1), ['push', '/profile']);
  });

  test(`${platform}: members shows a skeleton, not "membership ended", until chats load`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { groupId: group.id };
    state.chat.ready = false;
    const screen = await render(t, Members);
    assert.doesNotMatch(screen.text(), /membership has ended/);
    assert.match(screen.text(), /Loading groups/);
    state.chat.ready = true; await screen.update();
    assert.match(screen.text(), /membership has ended/);
  });

  test(`${platform}: Business is offered to current and lapsed owners only`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const hasBusiness = async (plan, places) => {
      state.auth.api = { isBusiness: async () => plan, places: async () => places };
      return (await render(t, Profile)).root.findAll(node => node.props.accessibilityLabel === 'Business').length > 0;
    };
    assert.equal(await hasBusiness(false, []), false);
    assert.equal(await hasBusiness(true, []), true);
    assert.equal(await hasBusiness(false, [{ id: 'p' }]), true, 'a lapsed owner still reaches the inactive-plan screen');
  });

  test(`${platform}: Privacy and Help match web`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const screen = await render(t, Profile);
    await screen.press('Privacy');
    const [, detail, buttons] = state.alerts.at(-1);
    assert.match(detail, /24 hours/);
    assert.match(detail, /name and photo/);
    await buttons[0].onPress();
    assert.deepEqual(state.opened, ['https://chat.example/privacy']);
    await screen.press('Help & Feedback');
    assert.match(state.alerts.at(-1)[1], /each one lasts 24 hours/);
  });
}
