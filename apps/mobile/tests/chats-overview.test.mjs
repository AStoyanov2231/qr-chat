import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act } from './support/native-harness.mjs';

const { default: Groups } = await import('../src/app/(app)/index.tsx');
const group = { id: 'room-one', venue: { id: 'room-one', name: 'Cafe', codes: ['Cafe-A'], label: 'A conversation for this QR code.' }, members: [{ id: 'me', name: 'Andy' }, { id: 'peer', name: 'Sam' }], messages: [], nextCursor: null };
const friendId = '11111111-1111-4111-8111-111111111111';

for (const platform of ['ios', 'android']) {
  test(`${platform}: Chats shows one ordered list with the current group, individual requests and real DM previews`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.chat.group = { ...group, venue: { ...group.venue, name: 'Brew & Chat' }, messages: [{ id: 'group-message', user: 'peer', name: 'Sam', text: 'Workshop starts soon', time: Date.now() - 4 * 60_000 }] };
    state.chat.expiresAt = new Date(Date.now() + 2.5 * 60 * 60_000).toISOString();
    const incoming = { id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'peer', requested_at: '2026-10-01T10:00:00Z', accepted_at: null, user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } };
    const decline = { ...incoming, id: '22222222-2222-4222-8222-222222222222', user_b_id: 'peer-two', user_b: { id: 'peer-two', display_name: 'Niko', avatar_url: null } };
    const outgoing = { ...incoming, id: '33333333-3333-4333-8333-333333333333', user_b_id: 'peer-three', requested_by_id: 'me', user_b: { id: 'peer-three', display_name: 'Mira', avatar_url: null } };
    const accepted = { ...incoming, id: '44444444-4444-4444-8444-444444444444', user_b_id: 'jordan', accepted_at: '2026-09-30T10:00:00Z', user_b: { id: 'jordan', display_name: 'Jordan', avatar_url: null } };
    state.chat.friends = [incoming, decline, outgoing, accepted];
    state.chat.directPreviews[accepted.id] = { status: 'ready', message: { id: 9, friend_connection_id: accepted.id, sender_id: 'jordan', body: 'See you at the cafe.', created_at: new Date(Date.now() - 12 * 60_000).toISOString() } };
    const calls = [];
    state.auth.api = { acceptFriend: async id => calls.push(['accept', id]), removeFriend: async id => calls.push(['remove', id]) };
    const screen = await render(t, Groups);
    assert.match(screen.text(), /Chats/);
    assert.doesNotMatch(screen.text(), /Active group|Direct messages|Toggle friend requests/);
    assert.match(screen.text(), /Brew & Chat/);
    assert.match(screen.text(), /BC/);
    assert.match(screen.text(), /Workshop starts soon/);
    assert.doesNotMatch(screen.text(), /Sam: Workshop starts soon|Group ·|Access ends in/);
    assert.match(screen.text(), /Your group access ends in 2 hours\./);
    assert.match(screen.text(), /Sent you a friend request/);
    assert.match(screen.text(), /Friend request sent/);
    assert.match(screen.text(), /See you at the cafe\./);
    assert.doesNotMatch(screen.text(), /Recent|Nearby|My Groups/);
    const searchField = screen.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'Search chats and people by name');
    assert.ok(searchField, 'Search is always visible');
    const list = screen.root.findByType('ScrollView');
    assert.equal(list.findAllByType('TextInput').length, 0, 'Search stays outside the scrolling list');
    assert.equal(list.findAllByType('Pressable').some(row => row.props.accessibilityLabel === 'Open your profile'), false);
    const labels = list.findAllByType('Pressable').map(row => row.props.accessibilityLabel);
    assert.ok(labels[0].startsWith('Open Brew'));
    assert.ok(labels.indexOf("Cancel friend request to Mira") < labels.indexOf('Open direct message with Jordan'));
    assert.equal(searchField.props.placeholder, 'Search chats and people...');
    await screen.press('Open your profile');
    assert.deepEqual(state.navigation.at(-1), ['push', '/profile']);
    await screen.press('Scan a QR code');
    assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
    const groupCard = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel.startsWith('Open Brew & Chat'));
    assert.ok(groupCard);
    assert.match(groupCard.props.accessibilityLabel, /Your group access ends in 2 hours/);
    const icons = groupCard.findAllByType(platform === 'ios' ? 'Image' : 'SymbolView');
    assert.equal(icons.length, 1, 'the group card shows only the member icon');
    await screen.press(groupCard.props.accessibilityLabel);
    assert.equal(state.navigation.at(-1)[1].pathname, '/room');

    const acceptAction = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === "Accept Sam's friend request");
    const declineAction = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === "Decline Sam's friend request");
    assert.ok(acceptAction && declineAction);
    assert.equal(acceptAction.props.style({ pressed: false })[0].minHeight, 44);
    assert.equal(acceptAction.props.style({ pressed: false })[1].backgroundColor, '#3488ff');
    assert.equal(declineAction.props.style({ pressed: false })[0].minWidth, 44);
    assert.equal(screen.root.findAllByType('Pressable').some(node => node.props.accessibilityLabel === "View Sam's profile"), false, 'Request cards do not open profile popups');
    await screen.press("Accept Sam's friend request");
    await screen.press("Decline Niko's friend request");
    await screen.press('Cancel friend request to Mira');
    assert.deepEqual(calls, [['accept', incoming.id], ['remove', decline.id], ['remove', outgoing.id]]);

    await screen.type('Search chats and people by name', 'unknown room');
    assert.match(screen.text(), /No chats or requests match “unknown room”\./);
    await screen.press('Clear search');
    await screen.type('Search chats and people by name', 'mira');
    assert.match(screen.text(), /Friend request sent/);
    assert.doesNotMatch(screen.text(), /No chats or requests match|Open direct message with Jordan|Sent you a friend request|Open Brew/);
    await screen.type('Search chats and people by name', 'jordan');
    assert.match(screen.text(), /Open direct message with Jordan/);
    assert.doesNotMatch(screen.text(), /Open Brew & Chat, 2 members/);
    await screen.type('Search chats and people by name', '');
    state.chat.group = { ...group, messages: [] }; await screen.update();
    assert.equal(screen.root.findAllByType('Text').some((node) => node.props.children === 'Now'), false);
    assert.doesNotMatch(screen.text(), /New message|new-message|Start a conversation/);
    const jordanRow = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Open direct message with Jordan');
    assert.ok(jordanRow, 'an accepted friend with no message history stays directly available');
    assert.equal(jordanRow.findAllByType('SymbolView').length, 0, 'DM rows have no disclosure arrow');
    await screen.press('Open direct message with Jordan');
    assert.equal(state.navigation.at(-1)[1].params.id, accepted.id);
    assert.equal(calls.length, 3, 'Opening a direct message does not create a friendship');
  });

  test(`${platform}: DM swipes reveal circular actions, preserve vertical scrolling and close the previous row`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const connection = (id, name) => ({ id, user_a_id: 'me', user_b_id: id, accepted_at: '2026-10-01', requested_at: '2026-10-01', user_b: { id, display_name: name } });
    state.chat.friends = [connection(friendId, 'Sam'), connection('second', 'Mira')];
    for (const friend of state.chat.friends) state.chat.directPreviews[friend.id] = { status: 'ready', message: null };
    const screen = await render(t, Groups);
    const row = name => screen.root.findAllByType('View').find(node => node.props.onPanResponderMove && node.findAllByType('Pressable').some(button => button.props.accessibilityLabel === `Open direct message with ${name}`));
    const actions = name => row(name).findAllByType('View').find(node => 'accessibilityElementsHidden' in node.props && node.findAllByType('Pressable').some(button => button.props.accessibilityLabel === `Block ${name}`));
    assert.equal(actions('Sam').props.pointerEvents, 'none');
    assert.equal(row('Sam').props.onMoveShouldSetPanResponder(null, { dx: -10, dy: 40 }), false);
    assert.equal(row('Sam').props.onMoveShouldSetPanResponder(null, { dx: 30, dy: 0 }), false);
    assert.equal(row('Sam').props.onMoveShouldSetPanResponder(null, { dx: -100, dy: 2 }), true);
    async function swipe(name, dx) {
      await act(async () => {
        row(name).props.onPanResponderGrant();
        row(name).props.onPanResponderMove(null, { dx, dy: 0 });
        row(name).props.onPanResponderRelease();
      });
    }
    await swipe('Sam', -100);
    assert.equal(actions('Sam').props.pointerEvents, 'auto');
    assert.equal(state.navigation.length, 0);
    await swipe('Mira', -100);
    assert.equal(actions('Sam').props.pointerEvents, 'none');
    assert.equal(actions('Mira').props.pointerEvents, 'auto');
    await swipe('Mira', 110);
    assert.equal(actions('Mira').props.pointerEvents, 'none');
    await swipe('Sam', -20);
    assert.equal(actions('Sam').props.pointerEvents, 'none');
    await act(async () => {
      const control = row('Sam').findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Open direct message with Sam');
      control.props.onAccessibilityAction({ nativeEvent: { actionName: 'showActions' } });
    });
    assert.equal(actions('Sam').props.pointerEvents, 'auto');
    await screen.type('Search chats and people by name', 'Sam');
    assert.equal(actions('Sam').props.pointerEvents, 'none');
  });

  test(`${platform}: DM actions confirm, prevent duplicate writes, and recover from a block failure`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.chat.friends = [{ id: friendId, user_a_id: 'me', user_b_id: 'peer', accepted_at: '2026-10-01', requested_at: '2026-10-01', user_b: { id: 'peer', display_name: 'Sam' } }];
    state.chat.directPreviews[friendId] = { status: 'ready', message: null };
    const calls = [];
    let finish;
    let fail = true;
    state.auth.api.removeFriend = async id => { calls.push(['unfriend', id]); };
    state.auth.api.blockFriend = async id => {
      calls.push(['block', id]);
      if (fail) throw new Error('Offline');
      await new Promise(resolve => { finish = resolve; });
    };
    const screen = await render(t, Groups);
    await screen.press('Unfriend Sam');
    assert.equal(calls.length, 0, 'Tapping a circle waits for confirmation');
    assert.equal(state.alerts.at(-1)[2][0].style, 'cancel');
    await act(async () => { state.alerts.at(-1)[2][1].onPress(); });
    assert.deepEqual(calls, [['unfriend', friendId]]);
    await screen.press('Block Sam');
    await act(async () => { state.alerts.at(-1)[2][1].onPress(); });
    assert.match(screen.text(), /Couldn’t update this friendship/);
    fail = false;
    await screen.press('Block Sam');
    const confirm = state.alerts.at(-1)[2][1].onPress;
    await act(async () => { confirm(); confirm(); });
    assert.equal(calls.length, 3);
    const block = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Block Sam');
    assert.equal(block.props.disabled, true);
    await act(async () => { finish(); });
    assert.match(screen.text(), /Blocked Sam/);
    assert.equal(block.props.disabled, false);
  });

  test(`${platform}: Chats distinguishes a first group from observed expiry and retries a failed load`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const screen = await render(t, Groups);
    assert.match(screen.text(), /Your chats start with a scan/);
    assert.doesNotMatch(screen.text(), /Your group access ended/);
    await screen.type('Search chats and people by name', 'Cafe');
    assert.doesNotMatch(screen.text(), /No group yet/);
    state.chat.groupAccessEnded = true; await screen.update();
    assert.doesNotMatch(screen.text(), /Your group access ended/);
    await screen.type('Search chats and people by name', '');
    assert.match(screen.text(), /Your group access ended/);
    await screen.press('Scan a QR code');
    assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
    assert.match(screen.text(), /Your group access ended/);
    assert.match(screen.text(), /Your friends and DMs stay/);
    state.chat.error = 'Offline'; state.chat.ready = false; state.chat.groupAccessEnded = false; await screen.update();
    assert.match(screen.text(), /Couldn’t load your chats\./);
    assert.doesNotMatch(screen.text(), /Your group access ended/);
    let retried = false; state.chat.refresh = async () => { retried = true; };
    await screen.press('Retry');
    assert.equal(retried, true);
  });

  test(`${platform}: inline request actions recover from failure and acceptance becomes a DM`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const incoming = { id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'peer', requested_at: '2026-10-01T10:00:00Z', accepted_at: null, user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } };
    state.chat.friends = [incoming];
    let fail = true;
    state.auth.api.acceptFriend = async () => {
      if (fail) throw new Error('Offline');
      state.chat.friends = [{ ...incoming, accepted_at: '2026-10-02T10:00:00Z' }];
      state.chat.directPreviews[friendId] = { status: 'ready', message: null };
    };
    const screen = await render(t, Groups);
    await screen.press("Accept Sam's friend request");
    assert.match(screen.text(), /Couldn’t update this request. Try again./);
    assert.match(screen.text(), /Sent you a friend request/);
    fail = false;
    await screen.press("Accept Sam's friend request");
    assert.match(screen.text(), /You and Sam are now friends/);
    assert.doesNotMatch(screen.text(), /Sent you a friend request/);
    await screen.press('Open direct message with Sam');
    assert.equal(state.navigation.at(-1)[1].params.id, friendId);
  });

  test(`${platform}: accessible request actions prevent duplicate acceptance while pending`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.chat.friends = [{ id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'peer', requested_at: '2026-10-01T10:00:00Z', accepted_at: null, user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } }];
    let finish;
    let calls = 0;
    state.auth.api.acceptFriend = async () => { calls++; await new Promise(resolve => { finish = resolve; }); };
    const screen = await render(t, Groups);
    const accept = () => screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === "Accept Sam's friend request");
    await act(async () => { accept().props.onPress(); });
    assert.equal(accept().props.accessibilityState.disabled, true);
    assert.match(screen.text(), /Accepting…/);
    await act(async () => { accept().props.onPress(); });
    assert.equal(calls, 1);
    await act(async () => { finish(); });
    assert.equal(accept().props.accessibilityState.disabled, false);
    assert.match(screen.text(), /You and Sam are now friends/);
  });

  test(`${platform}: the access ring refreshes once a minute and clears stale countdown timers`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.chat.group = group;
    const originalNow = Date.now;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const start = Date.parse('2026-10-01T00:00:00Z');
    let now = start;
    const intervals = [];
    let screen;
    try {
      Date.now = () => now;
      globalThis.setInterval = (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        intervals.push(timer);
        return timer;
      };
      globalThis.clearInterval = timer => { timer.cleared = true; };
      state.chat.expiresAt = new Date(start + 2.5 * 60 * 60_000).toISOString();
      screen = await render(t, Groups);
      assert.match(screen.text(), /2h left/);
      assert.equal(intervals.length, 1);
      assert.equal(intervals[0].delay, 60_000);

      now += 60 * 60_000;
      await act(async () => { intervals[0].callback(); });
      assert.match(screen.text(), /1h left/);

      state.chat.expiresAt = null;
      await screen.update();
      assert.equal(intervals[0].cleared, true, 'removing expiry clears the old timer');
      assert.match(screen.text(), /Time unavailable/);

      state.chat.expiresAt = new Date(now + 5 * 60 * 60_000).toISOString();
      await screen.update();
      assert.match(screen.text(), /5h left/, 'a replacement expiry is calculated against the current time immediately');
      assert.equal(intervals.length, 2);
      await screen.unmount();
      assert.equal(intervals[1].cleared, true, 'unmount clears the active timer');
    } finally {
      if (screen) await screen.unmount();
      Date.now = originalNow;
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test(`${platform}: Chats loading skeleton uses the unified list structure`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.chat.ready = false;
    const screen = await render(t, Groups);
    assert.match(screen.text(), /Loading chats/);
    assert.doesNotMatch(screen.text(), /Active group|Direct messages|Toggle friend requests/);
    assert.doesNotMatch(screen.text(), /Friend requests|Direct messages/);
    assert.doesNotMatch(screen.text(), /Your group access ended/);
  });

  test(`${platform}: a failed DM preview has a separate retry action`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const accepted = { id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'me', requested_at: '2026-09-30T10:00:00Z', accepted_at: '2026-09-30T11:00:00Z', user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } };
    state.chat.friends = [accepted];
    state.chat.directPreviews[friendId] = { status: 'error' };
    let refreshed = false; state.chat.refresh = async () => { refreshed = true; };
    const screen = await render(t, Groups);
    assert.match(screen.text(), /Preview unavailable/);
    await screen.press('Retry');
    assert.equal(refreshed, true);
  });


}
