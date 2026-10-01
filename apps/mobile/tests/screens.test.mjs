import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act } from './support/native-harness.mjs';

const { default: Scan } = await import('../src/app/(app)/scan.tsx');
const { default: Join } = await import('../src/app/(app)/join.tsx');
const { default: Room } = await import('../src/app/(app)/room.tsx');
const { Conversation } = await import('../src/components/conversation.tsx');
const { default: Groups } = await import('../src/app/(app)/index.tsx');
const { default: Members } = await import('../src/app/(app)/members.tsx');
const { default: EditProfile } = await import('../src/app/(app)/edit-profile.tsx');
const { default: Direct } = await import('../src/app/(app)/direct/[id].tsx');
const { default: Person } = await import('../src/app/(app)/person/[id].tsx');
const { useDirectMessages } = await import('../src/hooks/use-direct-messages.ts');
const group = { id: 'room-one', venue: { id: 'room-one', name: 'Cafe', codes: ['Cafe-A'], label: 'A conversation for this QR code.' }, members: [{ id: 'me', name: 'Andy' }, { id: 'peer', name: 'Sam' }], messages: [], nextCursor: null };
const friendId = '11111111-1111-4111-8111-111111111111';

function assertNativeButtonsHosted(screen) {
  const buttons = screen.root.findAllByType('Button');
  assert.ok(buttons.length, 'Expected a native action button');
  for (const button of buttons) {
    let host = button.parent;
    while (host && host.type !== 'Host') host = host.parent;
    assert.ok(host, 'Platform buttons must render inside an Expo UI Host');
    assert.equal(host.props.matchContents, true);
    assert.equal(host.props.colorScheme, 'light');
    assert.ok(host.props.seedColor, 'The native host uses the app color palette');
    assert.equal(button.props.style.height, 44, 'The platform button keeps a 44 point touch height');
  }
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: scanning the current code opens its conversation without joining again`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.chat.group = group;
    const screen = await render(t, Scan);
    await act(async () => { screen.root.findByType('CameraView').props.onBarcodeScanned({ data: 'https://chat.example/chats?code=Cafe-A' }); });
    assert.equal(state.navigation.length, 1);
    assert.equal(state.navigation[0][0], 'replace');
    assert.equal(state.navigation[0][1].pathname, '/room');
    assert.equal(state.navigation[0][1].params.groupId, group.id);
  });

  test(`${platform}: joining waits for the profile and replaces the modal with the joined room`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { code: 'New-Room' };
    state.chat.scannedCode = 'New-Room';
    state.chat.ready = false; state.chat.session = null;
    const calls = [];
    state.auth.api = {
      saveProfile: async value => calls.push(value),
      resolveQrChatName: async () => ({ kind: 'missing' }),
      joinNamedGroup: async (code, displayName) => { calls.push([code, displayName]); return { group_id: 'room-two', display_name: displayName }; },
    };
    const screen = await render(t, Join);
    state.chat.ready = true; state.chat.session = { id: 'me', name: 'Andy' };
    await screen.update();
    assert.equal(screen.root.findAllByType('TextInput').find(input => input.props.accessibilityLabel === 'Your name').props.value, 'Andy');
    await screen.type('Chat name', 'Cafe');
    await screen.press('Join chat');
    assert.deepEqual(calls, [{ display_name: 'Andy' }, ['New-Room', 'Cafe']]);
    assert.deepEqual(state.navigation, [['replace', { pathname: '/room', params: { groupId: 'room-two', code: 'New-Room', name: 'Cafe' } }]]);
  });

  test(`${platform}: an unnamed active room is named in place and failed refresh preserves the draft`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { code: 'Old-Room' };
    state.chat.scannedCode = 'Old-Room';
    state.chat.group = { ...group, venue: { ...group.venue, name: 'Unnamed chat', nameMissing: true, codes: ['Old-Room'] } };
    const calls = [];
    state.auth.api = {
      saveProfile: async () => calls.push('profile'),
      resolveQrChatName: async () => ({ kind: 'missing' }),
      nameCurrentQrChatIfEmpty: async (code, name) => { calls.push(['name-current', code, name]); return 'Cafe'; },
    };
    state.chat.refresh = async () => { state.chat.ready = false; throw new Error('Offline'); };
    const screen = await render(t, Join);
    await screen.type('Chat name', 'Cafe');
    await screen.press('Join chat');
    assert.deepEqual(calls, ['profile', ['name-current', 'Old-Room', 'Cafe']]);
    assert.match(screen.text(), /Offline/);
    assert.equal(screen.root.findAllByType('TextInput').find(input => input.props.accessibilityLabel === 'Chat name').props.value, 'Cafe');
    assert.equal(state.navigation.length, 0);
  });

  test(`${platform}: an unnamed current group scan opens its naming preview instead of its room`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.chat.group = { ...group, venue: { ...group.venue, name: 'Unnamed chat', nameMissing: true } };
    const screen = await render(t, Scan);
    await act(async () => { screen.root.findByType('CameraView').props.onBarcodeScanned({ data: 'Cafe-A' }); });
    assert.deepEqual(state.navigation, [['replace', { pathname: '/join', params: { code: 'Cafe-A' } }]]);
  });

  test(`${platform}: an old metadata response cannot replace a later scan or its draft`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { code: 'First-Room' }; state.chat.scannedCode = 'First-Room';
    const deferred = new Map();
    const signals = new Map();
    state.auth.api = {
      resolveQrChatName: (code, signal) => new Promise(resolve => { deferred.set(code, resolve); signals.set(code, signal); }),
    };
    const screen = await render(t, Join);
    assert.match(screen.text(), /Finding the chat name/);
    state.params = { code: 'Second-Room' }; state.chat.scannedCode = 'Second-Room';
    await screen.update();
    assert.equal(signals.get('First-Room').aborted, true);
    deferred.get('First-Room')({ kind: 'suggested', name: 'Stale Venue' });
    await screen.update();
    assert.match(screen.text(), /Finding the chat name/);
    assert.doesNotMatch(screen.text(), /Stale Venue/);
    deferred.get('Second-Room')({ kind: 'missing' });
    await screen.update();
    assert.equal(screen.root.findAllByType('TextInput').find(input => input.props.accessibilityLabel === 'Chat name').props.value, '');
  });

  test(`${platform}: a room that expires or is replaced cannot show the new group's messages`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.params = { groupId: group.id, code: group.venue.codes[0], name: group.venue.name };
    state.chat.group = group;
    const screen = await render(t, Room);
    state.chat.group = { ...group, id: 'different', messages: [{ id: '1', user: 'peer', name: 'Sam', text: 'different-room-private-text', time: 0 }] };
    await screen.update();
    assert.doesNotMatch(screen.text(), /different-room-private-text/);
    assert.equal(screen.root.findAllByType('TextInput').length, 0);
    await screen.press('Scan to rejoin');
    assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
  });

  test(`${platform}: scanner rejects invalid input, handles permission recovery, and stops in the background`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.permission = { granted: false, canAskAgain: false };
    const screen = await render(t, Scan);
    assert.equal(screen.root.findAllByType('CameraView').length, 0);
    await screen.press('Open settings');
    assert.equal(state.settingsOpened, true);
    state.permission = { granted: true, canAskAgain: true };
    await screen.update();
    assert.equal(screen.root.findAllByType('CameraView').length, 1);
    await act(async () => { screen.root.findByType('CameraView').props.onBarcodeScanned({data:'x'.repeat(513)}); });
    assert.match(screen.text(), /QR code is invalid/);
    assert.equal(screen.root.findAllByType('TextInput').length, 0);
    assert.doesNotMatch(screen.text(), /Enter a code/);
    state.auth.active = false;
    await screen.update();
    assert.equal(screen.root.findAllByType('CameraView').length, 0);
    assert.deepEqual(state.navigation, []);
    state.auth.active = true; await screen.update();
    await act(async () => { screen.root.findByType('CameraView').props.onBarcodeScanned({data:'Case-Sensitive'}); });
    assert.deepEqual(state.navigation, [['replace', { pathname: '/join', params: { code: 'Case-Sensitive' } }]]);
  });

  test(`${platform}: Chats shows the current group, collapsible requests, and real DM previews`, async (t) => {
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
    assert.match(screen.text(), /Active group/);
    assert.match(screen.text(), /Brew & Chat/);
    assert.match(screen.text(), /BC/);
    assert.match(screen.text(), /Sam: Workshop starts soon/);
    assert.match(screen.text(), /Your group access ends in 2 hours\./);
    assert.match(screen.text(), /3 pending requests/);
    assert.match(screen.text(), /See you at the cafe\./);
    assert.doesNotMatch(screen.text(), /Recent|Nearby|My Groups/);
    const searchField = screen.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'Search chats by name');
    assert.ok(searchField, 'Search is always visible');
    assert.equal(searchField.props.placeholder, 'Search groups or people...');
    await screen.press('Open your profile');
    assert.deepEqual(state.navigation.at(-1), ['push', '/profile']);
    await screen.press('Scan a QR code');
    assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
    const groupCard = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel.startsWith('Open Brew & Chat'));
    assert.ok(groupCard);
    assert.match(groupCard.props.accessibilityLabel, /Your group access ends in 2 hours/);
    assert.equal(groupCard.findAllByType('SymbolView').length, 0, 'the group card has no disclosure arrow');
    await screen.press(groupCard.props.accessibilityLabel);
    assert.equal(state.navigation.at(-1)[1].pathname, '/room');

    await screen.press('Toggle friend requests');
    const requestActions = screen.root.findAllByType('Button').filter(button => ['Accept', 'Decline', 'Cancel'].includes(button.props.title));
    assert.ok(requestActions.some(button => button.props.title === 'Accept' && button.props.variant !== 'text'));
    assert.ok(requestActions.filter(button => ['Decline', 'Cancel'].includes(button.props.title)).every(button => button.props.variant === 'text'));
    await screen.press('View Sam’s profile');
    assert.deepEqual(state.navigation.at(-1), ['push', { pathname: '/person/[id]', params: { id: 'peer' } }]);
    await screen.press('Accept');
    await screen.press('Decline', 1);
    await screen.press('Cancel');
    assert.deepEqual(calls, [['accept', incoming.id], ['remove', decline.id], ['remove', outgoing.id]]);

    await screen.type('Search chats by name', 'unknown room');
    assert.match(screen.text(), /No chats match “unknown room”\./);
    await screen.press('Clear search');
    await screen.type('Search chats by name', 'jordan');
    assert.match(screen.text(), /Open chat with Jordan/);
    assert.doesNotMatch(screen.text(), /Open Brew & Chat, 2 members/);
    await screen.type('Search chats by name', '');
    state.chat.group = { ...group, messages: [] }; await screen.update();
    assert.equal(screen.root.findAllByType('Text').some((node) => node.props.children === 'Now'), false);
    assert.doesNotMatch(screen.text(), /New message|new-message|Start a conversation/);
    const jordanRow = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Open chat with Jordan');
    assert.ok(jordanRow, 'an accepted friend with no message history stays directly available');
    assert.equal(jordanRow.findAllByType('SymbolView').length, 0, 'DM rows have no disclosure arrow');
    await screen.press('Open chat with Jordan');
    assert.equal(state.navigation.at(-1)[1].params.id, accepted.id);
    assert.equal(calls.length, 3, 'Opening a direct message does not create a friendship');
  });

  test(`${platform}: Chats distinguishes a first group from observed expiry and retries a failed load`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const screen = await render(t, Groups);
    assert.match(screen.text(), /No group yet/);
    assert.doesNotMatch(screen.text(), /Your group access ended/);
    await screen.type('Search chats by name', 'Cafe');
    assert.doesNotMatch(screen.text(), /No group yet/);
    state.chat.groupAccessEnded = true; await screen.update();
    assert.doesNotMatch(screen.text(), /Your group access ended/);
    await screen.type('Search chats by name', '');
    assert.match(screen.text(), /Your group access ended/);
    await screen.press('Scan a QR code');
    assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
    assert.match(screen.text(), /Your group access ended/);
    assert.match(screen.text(), /Your friends and DMs stay/);
    state.chat.error = 'Offline'; state.chat.ready = false; state.chat.groupAccessEnded = false; await screen.update();
    assert.match(screen.text(), /We couldn’t load your chats\. Offline/);
    assert.doesNotMatch(screen.text(), /Your group access ended/);
    let retried = false; state.chat.refresh = async () => { retried = true; };
    await screen.press('Retry');
    assert.equal(retried, true);
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
      assert.match(screen.text(), /Expires in 2h/);
      assert.equal(intervals.length, 1);
      assert.equal(intervals[0].delay, 60_000);

      now += 60 * 60_000;
      await act(async () => { intervals[0].callback(); });
      assert.match(screen.text(), /Expires in 1h/);

      state.chat.expiresAt = null;
      await screen.update();
      assert.equal(intervals[0].cleared, true, 'removing expiry clears the old timer');
      assert.match(screen.text(), /Time unavailable/);

      state.chat.expiresAt = new Date(now + 5 * 60 * 60_000).toISOString();
      await screen.update();
      assert.match(screen.text(), /Expires in 5h/, 'a replacement expiry is calculated against the current time immediately');
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

  test(`${platform}: Chats loading skeleton preserves the section structure`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.chat.ready = false;
    const screen = await render(t, Groups);
    assert.match(screen.text(), /Loading chats/);
    assert.match(screen.text(), /Active group/);
    assert.match(screen.text(), /Friend requests/);
    assert.match(screen.text(), /Direct messages/);
    assert.doesNotMatch(screen.text(), /Your group access ended/);
  });

  test(`${platform}: a failed DM preview has a separate retry action`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const accepted = { id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'me', requested_at: '2026-09-30T10:00:00Z', accepted_at: '2026-09-30T11:00:00Z', user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } };
    state.chat.friends = [accepted];
    state.chat.directPreviews[friendId] = { status: 'error' };
    let refreshed = false; state.chat.refresh = async () => { refreshed = true; };
    const screen = await render(t, Groups);
    assert.match(screen.text(), /Preview unavailable\. Tap to retry\./);
    await screen.press('Retry preview');
    assert.equal(refreshed, true);
  });

  test(`${platform}: member actions stop when that membership is no longer current`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { groupId: group.id }; state.chat.group = group;
    const calls = [];
    state.auth.api = { requestFriend: async id => calls.push(['request', id]), leaveGroup: async () => calls.push(['leave']) };
    const screen = await render(t, Members);
    await screen.press("View Sam's profile");
    assert.deepEqual(state.navigation.at(-1), ['push', {pathname:'/person/[id]',params:{id:'peer'}}]);
    assert.deepEqual(calls, []);
    await screen.press('Leave group');
    await act(async () => { state.alerts.at(-1)[2].find(button => button.text === 'Leave').onPress(); });
    assert.deepEqual(state.navigation.at(-1), ['dismissTo', '/']);
    state.chat.group = { ...group, id: 'new-room' }; await screen.update();
    assert.match(screen.text(), /membership has ended/);
    assert.equal(screen.root.findAllByType('Pressable').length, 0);
  });

  test(`${platform}: editing a profile preserves a failed save and closes after success`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    let fail = true; const names = [];
    state.auth.api.saveProfileWithAvatar = async (display_name) => { if(fail) throw new Error('Offline'); names.push(display_name); };
    const screen = await render(t, EditProfile);
    await screen.type('Display name', 'New name'); await screen.press('Save profile');
    assert.match(screen.text(), /Offline/); assert.equal(state.navigation.length, 0);
    assert.equal(screen.root.findByType('TextInput').props.value, 'New name');
    fail = false; await screen.press('Save profile');
    assert.deepEqual(names, ['New name']); assert.deepEqual(state.navigation, [['back']]);
  });

  test(`${platform}: a member profile supports requesting, accepting and messaging with live relationship changes`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params={id:'peer'}; state.chat.group=group;
    const friend = {id:friendId,user_a_id:'me',user_b_id:'peer',requested_by_id:'me',accepted_at:null,user_b:{id:'peer',display_name:'Sam',avatar_url:null}};
    const calls=[];
    state.auth.api={requestFriend:async id=>{calls.push(['request',id]);state.chat.friends=[friend];},removeFriend:async id=>{calls.push(['remove',id]);state.chat.friends=[];},acceptFriend:async id=>{calls.push(['accept',id]);friend.accepted_at='2026-09-30';}};
    const screen=await render(t,Person);
    await screen.press('Add friend');
    assert.match(screen.text(),/Request sent/);
    assert.doesNotMatch(screen.text(), /"children":"Message"/);
    await screen.press('Cancel request');
    friend.requested_by_id='peer';state.chat.friends=[friend];await screen.update();
    await screen.press('Accept');
    await screen.press('Message');
    assert.deepEqual(calls,[['request','peer'],['remove',friendId],['accept',friendId]]);
    assert.deepEqual(state.navigation.at(-1),['dismissTo',{pathname:'/direct/[id]',params:{id:friendId}}]);
    state.chat.group=null;await screen.update();
    assert.match(screen.text(),/Sam/,'An existing friendship remains visible after leaving the venue');
    state.chat.friends=[];await screen.update();
    assert.match(screen.text(),/profile is no longer available/);
  });

  test(`${platform}: selecting a photo normalizes it, keeps preview on failed save, and removal is explicit`, async (t) => {
    reset(); process.env.EXPO_OS=platform;
    state.pickerResult={canceled:false,assets:[{uri:'file:///source.png',width:1200,height:800}]};
    let fail=true;const saved=[];
    state.auth.api.saveProfileWithAvatar=async (name,photo)=>{if(fail)throw new Error('Offline');saved.push([name,photo]);};
    const screen=await render(t,EditProfile);
    await screen.press('Choose photo');
    assert.deepEqual(state.pickerOptions.mediaTypes,['images']);
    assert.ok(state.imageActions.some(([op,size])=>op==='resize'&&size.width===512&&size.height===512));
    await screen.press('Save profile');
    assert.match(screen.text(),/file:\/\/\/prepared.jpg/);
    assert.equal(state.navigation.length,0);
    fail=false;await screen.press('Save profile');
    assert.equal(saved[0][0],'Andy');assert.ok(saved[0][1].data instanceof ArrayBuffer);
    await screen.press('Remove photo');await screen.press('Save profile');
    assert.equal(saved[1][1],null);
  });

  test(`${platform}: opening a join link without a scan opens the camera without joining`, async (t) => {
    reset(); process.env.EXPO_OS=platform;state.params={code:'Room-A'};
    state.auth.api.joinGroup=()=>assert.fail('A link cannot start a new join');
    const screen=await render(t,Join);
    assert.deepEqual(state.navigation,[['replace','/scan']]);
    assert.equal(screen.root.findAllByType('TextInput').length,0);
  });

  test(`${platform}: removing a friendship clears its direct conversation and composer`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { id: friendId };
    state.chat.friends = [{ id: friendId, user_a_id: 'me', user_b_id: 'peer', accepted_at: '2026-09-19', user_b: { display_name: 'Sam' } }];
    state.loadDirectSnapshot = async () => ({ messages: [{id: 1, sender_id: 'peer', body: 'private-direct-text', created_at: '2026-09-19'}], nextCursor: null });
    const screen = await render(t, Direct);
    assert.match(screen.text(), /private-direct-text/);
    state.chat.friends = []; await screen.update();
    assert.doesNotMatch(screen.text(), /private-direct-text/);
    assert.equal(screen.root.findAllByType('TextInput').length, 0);
    assert.equal(state.watchers[0].stopped, true);
  });

  test(`${platform}: every direct message shows the actual sender photo and opens that profile`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { id: friendId };
    const ownAvatar = 'https://images.example/andy.jpg';
    const peerAvatar = 'https://images.example/sam.jpg';
    state.chat.session = { id: 'me', name: 'Andy', avatarUrl: ownAvatar };
    state.chat.friends = [{
      id: friendId, user_a_id: 'me', user_b_id: 'peer', accepted_at: '2026-09-19',
      user_b: { id: 'peer', display_name: 'Sam', avatar_url: peerAvatar },
    }];
    state.loadDirectSnapshot = async () => ({ messages: [
      { id: 1, sender_id: 'peer', body: 'Incoming note', created_at: '2026-09-19T10:00:00Z' },
      { id: 2, sender_id: 'me', body: 'My reply', created_at: '2026-09-19T10:01:00Z' },
    ], nextCursor: null });
    const screen = await render(t, Direct);
    const sources = screen.root.findAllByType('Image').map(image => image.props.source);
    assert.ok(sources.includes(ownAvatar), 'the own-message avatar uses the signed-in profile photo');
    assert.ok(sources.includes(peerAvatar), 'the received-message avatar uses the friend profile photo');
    assert.match(screen.text(), /Incoming note/);
    assert.match(screen.text(), /My reply/);
    await screen.press("View Andy's profile");
    assert.deepEqual(state.navigation.at(-1), ['push', '/edit-profile']);
    await screen.press("View Sam's profile");
    assert.deepEqual(state.navigation.at(-1), ['push', { pathname: '/person/[id]', params: { id: 'peer' } }]);
  });

  test(`${platform}: an accepted friend’s empty DM shows a greeting only after its first read succeeds`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { id: friendId };
    state.chat.friends = [{ id: friendId, user_a_id: 'me', user_b_id: 'peer', accepted_at: '2026-09-19', user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } }];
    let finishRead;
    state.loadDirectSnapshot = () => new Promise((resolve) => { finishRead = resolve; });
    const screen = await render(t, Direct);
    assert.doesNotMatch(screen.text(), /Say hello to Sam|Send your first message/);
    await act(async () => { finishRead({ messages: [], nextCursor: null }); });
    assert.match(screen.text(), /Say hello to Sam/);
    assert.match(screen.text(), /Send your first message/);
    const composer = screen.root.findAllByType('TextInput').find(input => input.props.accessibilityLabel === 'Message Sam');
    assert.ok(composer);
    assert.equal(composer.props.placeholder, 'Message Sam…');
  });

  test(`${platform}: a failed empty-DM read keeps its retry state instead of showing a first-message greeting`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.params = { id: friendId };
    state.chat.friends = [{ id: friendId, user_a_id: 'me', user_b_id: 'peer', accepted_at: '2026-09-19', user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } }];
    state.loadDirectSnapshot = async () => { throw new Error('Offline'); };
    const screen = await render(t, Direct);
    assert.match(screen.text(), /Offline/);
    assert.doesNotMatch(screen.text(), /Say hello to Sam|Send your first message/);
  });
}

test('resuming the app retains direct-message pagination and reconciles before reporting connected', async (t) => {
  reset(); const counts = []; let hook;
  state.loadDirectSnapshot = async (_api, _id, count) => { counts.push(count); return { messages: [], nextCursor: 5 }; };
  function Probe() { hook = useDirectMessages(friendId); return null; }
  const screen = await render(t, Probe);
  await act(async () => { await hook.loadOlder(); });
  assert.deepEqual(counts, [1, 2]);
  state.auth.active = false; await screen.update();
  assert.equal(state.watchers[0].stopped, true);
  assert.equal(hook.connection, 'reconnecting');
  state.auth.active = true; await screen.update();
  assert.deepEqual(counts, [1, 2, 2]);
});

test('message composer retains a failed draft and clears it before a failed refresh', async (t) => {
  reset();
  let failSend = true;
  const sent = [];
  const screen = await render(t, Conversation, {
    messages: [], userId: 'me', error: '', available: true, connected: true, nextCursor: null,
    refresh: async () => { throw new Error('Offline'); }, loadOlder: async () => {},
    send: async body => { if (failSend) throw new Error('Failed send'); sent.push(body); }, unavailable: 'Ended',
  });
  const sendButton = () => screen.root.findAllByType('Pressable').find(button => button.props.accessibilityLabel === 'Send message');
  assert.equal(sendButton().props.accessibilityState.disabled, true);
  await screen.type('Message', 'Hello');
  assert.equal(sendButton().props.accessibilityState.disabled, false);
  await screen.press('Send message');
  assert.equal(screen.root.findByType('TextInput').props.value, 'Hello');
  failSend = false;
  await screen.press('Send message');
  assert.deepEqual(sent, ['Hello']);
  assert.equal(screen.root.findByType('TextInput').props.value, '');
});

test('message composer displays a pending spinner and prevents duplicate sends', async (t) => {
  reset();
  let finishSend;
  let sendCount = 0;
  const screen = await render(t, Conversation, {
    messages: [], userId: 'me', error: '', available: true, connected: true, nextCursor: null,
    refresh: async () => {}, loadOlder: async () => {},
    send: async () => { sendCount += 1; await new Promise(resolve => { finishSend = resolve; }); }, unavailable: 'Ended',
  });
  await screen.type('Message', 'Hello');
  await screen.press('Send message');
  assert.equal(screen.root.findAllByType('ActivityIndicator').length, 1);
  assert.equal(screen.root.findAllByType('Pressable').some(button => button.props.accessibilityLabel === 'Sending message'), true);
  assert.equal(screen.root.findAllByType('Pressable').find(button => button.props.accessibilityLabel === 'Sending message').props.accessibilityState.disabled, true);
  assert.equal(sendCount, 1);
  await assert.rejects(screen.press('Sending message'), /Disabled button/);
  assert.equal(sendCount, 1, 'the disabled pending control cannot trigger another send');
  await act(async () => { finishSend(); await Promise.resolve(); });
  assert.equal(screen.root.findByType('TextInput').props.value, '');
});

test('retrying a direct conversation after a backend failure reconciles the friendship snapshot', async (t) => {
  reset(); state.params = { id: friendId }; state.chat.ready = false; state.chat.error = 'Offline';
  let refreshed = false;
  state.chat.refresh = async () => { refreshed = true; };
  const screen = await render(t, Direct);
  await screen.press('Retry');
  assert.equal(refreshed, true);
});
