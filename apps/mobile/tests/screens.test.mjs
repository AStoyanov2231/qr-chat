import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act } from './support/native-harness.mjs';

const { default: Scan } = await import('../src/app/(app)/scan.tsx');
const { default: Join } = await import('../src/app/(app)/join.tsx');
const { default: Room } = await import('../src/app/(app)/room.tsx');
const { Conversation } = await import('../src/components/conversation.tsx');
const { default: Groups } = await import('../src/app/(app)/(tabs)/chats.tsx');
const { default: Members } = await import('../src/app/(app)/members.tsx');
const { default: EditProfile } = await import('../src/app/(app)/edit-profile.tsx');
const { default: Direct } = await import('../src/app/(app)/direct/[id].tsx');
const { default: Person } = await import('../src/app/(app)/person/[id].tsx');
const { useDirectMessages } = await import('../src/hooks/use-direct-messages.ts');
const group = { id: 'room-one', venue: { id: 'room-one', name: 'Cafe', codes: ['Cafe-A'], label: 'A conversation for this QR code.' }, members: [{ id: 'me', name: 'Andy' }, { id: 'peer', name: 'Sam' }], messages: [], nextCursor: null };
const friendId = '11111111-1111-4111-8111-111111111111';

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

  test(`${platform}: friend request actions and group search use the current web flow`, async (t) => {
    reset(); process.env.EXPO_OS = platform; state.chat.group = group;
    const friend = { id: friendId, user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'peer', accepted_at: null, user_b: { display_name: 'Sam' } };
    state.chat.friends = [friend];
    const calls = [];
    state.auth.api = { acceptFriend: async id => calls.push(['accept', id]), removeFriend: async id => calls.push(['remove', id]) };
    const screen = await render(t, Groups);
    await screen.press('Accept');
    await screen.press('Decline');
    assert.deepEqual(calls, [['accept', friendId], ['remove', friendId]]);
    friend.requested_by_id = 'me'; await screen.update();
    await screen.press('Cancel');
    friend.accepted_at = '2026-09-19T00:00:00Z'; await screen.update();
    await screen.press('Message');
    assert.deepEqual(state.navigation.at(-1), ['push', { pathname: '/direct/[id]', params: { id: friendId } }]);
    await screen.press('Remove');
    await act(async () => { state.alerts.at(-1)[2].find(button => button.text === 'Remove').onPress(); });
    assert.equal(calls.filter(([action]) => action === 'remove').length, 3);
    await screen.press('Search groups'); await screen.type('Search groups by name', 'Unknown room');
    assert.match(screen.text(), /No groups found/);
    await screen.type('Search groups by name', 'cafe');
    assert.match(screen.text(), /You’re in. Say hello/);
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
    assert.deepEqual(state.navigation.at(-1), ['dismissTo', '/chats']);
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
  await screen.type('Message', 'Hello');
  await screen.press('Send message');
  assert.equal(screen.root.findByType('TextInput').props.value, 'Hello');
  failSend = false;
  await screen.press('Send message');
  assert.deepEqual(sent, ['Hello']);
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
