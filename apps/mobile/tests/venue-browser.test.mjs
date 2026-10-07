import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state, act, navigate } from './support/native-harness.mjs';

const { default: Scan } = await import('../src/app/(app)/scan.tsx');
const { default: Join } = await import('../src/app/(app)/join.tsx');
const { default: Room } = await import('../src/app/(app)/room.tsx');
const { roomRoute } = await import('../src/lib/room-route.ts');
const { venueUrl } = await import('../src/lib/qr-link.ts');
const origin = 'https://chat.example';
const groupId = '11111111-1111-4111-8111-111111111111';
const venue = 'https://order.venue.example/menu?table=12&session=a%2Fb#pay';
const label = 'Open venue page';
const browseButton = (room) => room.root.findAll(node => node.props.accessibilityLabel === label && node.props.onAccessibilityTap);

test('only third-party http(s) QR keys are venue pages, kept exactly as scanned', () => {
  assert.equal(venueUrl(venue, origin), venue);
  assert.equal(venueUrl('HTTP://Venue.example/a?b=%2F', origin), 'HTTP://Venue.example/a?b=%2F');
  assert.equal(venueUrl(`${origin}/somewhere?x=1`, origin), null);
  for (const code of ['Room-A', 'qrchat://join?code=A', 'ftp://venue.example', 'https://', undefined]) assert.equal(venueUrl(code, origin), null, code);
});

for (const platform of ['ios', 'android']) {
  test(`${platform}: a scanned venue URL reaches the room and opens unmodified next to settings`, async (t) => {
    process.env.EXPO_OS = platform;
    reset();
    state.auth.api = { saveProfile: async () => {}, resolveQrChatName: async () => ({ kind: 'missing' }), resolveQrChatImage: async () => null,
      joinNamedGroup: async (_code, name) => ({ group_id: groupId, display_name: name }) };
    const scanner = await render(t, Scan);
    await act(async () => { scanner.root.findByType('CameraView').props.onBarcodeScanned({ data: venue }); });
    navigate(state.navigation.at(-1)[1]);
    const join = await render(t, Join);
    await join.type('Chat name', 'Cafe');
    await join.press('Join chat');
    navigate(state.navigation.at(-1)[1]);
    state.chat.group = { id: groupId, venue: { id: groupId, name: 'Cafe', codes: [venue] }, members: [], messages: [], nextCursor: null };
    const room = await render(t, Room);
    const [button] = browseButton(room);
    assert.ok(button, 'browser button is shown');
    const actions = room.root.findAll(node => node.props.onAccessibilityTap).map(node => node.props.accessibilityLabel);
    assert.deepEqual(actions.slice(-2), [label, 'Group settings']);
    await act(async () => { button.props.onAccessibilityTap(); });
    assert.deepEqual(state.browserOpened, [venue, 'Cafe']);
  });

  test(`${platform}: no browser button for opaque, first-party or unknown QR keys`, async (t) => {
    process.env.EXPO_OS = platform;
    for (const code of ['Room-A', `${origin}/chats?other=1`, undefined]) {
      reset();
      navigate(code ? roomRoute({ id: groupId, venue: { codes: [code], name: 'Cafe' } }) : { pathname: '/room', params: { groupId, name: 'Cafe' } });
      const room = await render(t, Room);
      assert.equal(browseButton(room).length, 0, String(code));
      await room.unmount();
    }
  });
}

test('web renders no browser button', async (t) => {
  process.env.EXPO_OS = 'web';
  reset();
  navigate(roomRoute({ id: groupId, venue: { codes: [venue], name: 'Cafe' } }));
  const room = await render(t, Room);
  assert.equal(browseButton(room).length, 0);
});
