import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { test } from 'node:test';

const requireFromTest = createRequire(import.meta.url);
const React = requireFromTest('react');
const jsxRuntime = requireFromTest('react/jsx-runtime');
const { renderToStaticMarkup } = requireFromTest('react-dom/server');
const typescript = requireFromTest('typescript');
const domain = requireFromTest('@qr-chat/domain');

const Avatar = ({ name, url, size = 44 }) => React.createElement('span', {
  className: 'user-avatar',
  style: { width: size, height: size },
}, url ? React.createElement('img', { src: url, alt: '' }) : name.slice(0, 2).toUpperCase());
const Icon = ({ name }) => React.createElement('span', { 'data-icon': name, 'aria-hidden': 'true' });
const icons = Object.fromEntries(['Prohibit', 'UserMinus', 'Check', 'UserPlus', 'ArrowRight', 'ChatCircle', 'DeviceMobile', 'Globe', 'QrCode', 'Users', 'CaretLeft', 'CaretRight', 'Clock', 'MagnifyingGlass', 'X', 'Bell', 'BookmarkSimple', 'Gear', 'LockSimple', 'PencilSimple', 'Question', 'User'].map((name) => [
  name,
  (props) => React.createElement('svg', { ...props, 'data-icon': name, 'aria-hidden': 'true' }),
]));

async function loadTsxModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const fixtureModule = { exports: {} };
  const fixtureRequire = (specifier) => {
    if (specifier === 'react') return React;
    if (specifier === 'react/jsx-runtime') return jsxRuntime;
    if (specifier === '@qr-chat/domain') return domain;
    if (specifier === '@phosphor-icons/react') return icons;
    if (specifier === './avatar') return { Avatar };
    if (specifier === '@/components/avatar') return { Avatar };
    if (specifier === '@/components/icon') return { Icon };
    if (specifier === '@/components/mobile-chat') return { default: () => null };
    if (specifier === '@/lib/avatar') return { prepareAvatar: async () => null };
    return requireFromTest(specifier);
  };
  const evaluate = runInThisContext(`(function (require, module, exports) { ${output}\n})`, {
    filename: sourceUrl.pathname,
  });
  evaluate(fixtureRequire, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const overviewModule = await loadTsxModule('../src/components/chats-overview.tsx');
const { ChatsOverview, chatNameMatches } = overviewModule;
const directParts = await loadTsxModule('../src/components/direct-message-parts.tsx');

const sessionId = 'user-current';
const noOp = () => {};

function friend({ id, peerId, peerName, acceptedAt = null, requestedBy = peerId, requestedAt = '2026-09-30T10:00:00.000Z', avatarUrl = null }) {
  return {
    id,
    user_a_id: sessionId,
    user_b_id: peerId,
    requested_by_id: requestedBy,
    requested_at: requestedAt,
    accepted_at: acceptedAt,
    user_a: { id: sessionId, display_name: 'Current User', avatar_url: null },
    user_b: { id: peerId, display_name: peerName, avatar_url: avatarUrl },
  };
}

function props(overrides = {}) {
  return {
    group: null,
    friends: [],
    directPreviews: {},
    expiresAt: null,
    hasObservedGroup: false,
    sessionId,
    busy: false,
    error: '',
    onRetry: noOp,
    onScan: noOp,
    onOpenGroup: noOp,
    onOpenDirect: noOp,
    onAcceptRequest: noOp,
    onRemoveRequest: noOp,
    onUnfriend: noOp,
    onBlock: noOp,
    ...overrides,
  };
}

function renderOverview(input = props()) {
  return renderToStaticMarkup(React.createElement(ChatsOverview, input));
}

const acceptedMaya = friend({
  id: 'friend-maya',
  peerId: 'user-maya',
  peerName: 'Maya Chen',
  acceptedAt: '2026-09-30T08:00:00.000Z',
  requestedAt: '2026-09-29T18:00:00.000Z',
  requestedBy: sessionId,
  avatarUrl: 'https://images.example/maya.jpg',
});
const acceptedJordan = friend({
  id: 'friend-jordan',
  peerId: 'user-jordan',
  peerName: 'Jordan Lee',
  acceptedAt: '2026-09-30T09:00:00.000Z',
  requestedAt: '2026-09-29T19:00:00.000Z',
  requestedBy: sessionId,
});
const incomingRequest = friend({ id: 'request-bea', peerId: 'user-bea', peerName: 'Bea Kim' });
const outgoingRequest = friend({ id: 'request-kai', peerId: 'user-kai', peerName: 'Kai Tan', requestedBy: sessionId });
const group = {
  id: 'group-brew',
  venue: { id: 'group-brew', name: 'Brew & Chat', label: 'A conversation for this QR code.', codes: ['brew'], kind: 'place' },
  members: [{ id: sessionId, name: 'Current User' }, { id: 'user-maya', name: 'Maya Chen' }],
  messages: [{ id: 'group-message-1', user: 'user-maya', name: 'Maya Chen', text: 'Anyone here for the workshop?', time: Date.now() - 4 * 60_000 }],
  nextCursor: null,
};

test('Chats loading uses one scrolling list below the persistent header and search placeholder', () => {
  const html = renderOverview({ loading: true });
  assert.match(html, /<h1>Chats<\/h1>/);
  assert.match(html, /class="chat-list-scroll"/);
  assert.doesNotMatch(html, /Active group|Friend requests|Direct messages/);
  assert.match(html, /Loading chats…/);
  assert.equal((html.match(/class="dm-loading-row"/g) ?? []).length, 5);
  assert.match(html, /aria-label="Open your profile"/);
  assert.doesNotMatch(html, /Recent|Nearby|My Groups/);
});

test('Chats orders the active group before individual requests and ordered DMs', () => {
  const mayaMessage = {
    id: 'direct-message-1',
    group_id: acceptedMaya.id,
    sender_id: sessionId,
    body: 'Thanks for the welcome!',
    created_at: new Date(Date.now() - 12 * 60_000 - 1_000).toISOString(),
  };
  const html = renderOverview(props({
    group,
    friends: [acceptedJordan, incomingRequest, acceptedMaya, outgoingRequest],
    directPreviews: {
      [acceptedMaya.id]: { status: 'ready', message: mayaMessage },
      [acceptedJordan.id]: { status: 'ready', message: null },
    },
    expiresAt: new Date(Date.now() + 18.5 * 60 * 60_000).toISOString(),
  }));

  assert.match(html, /<h1>Chats<\/h1>/);
  assert.doesNotMatch(html, /<h2|<details|<summary/);
  assert.match(html, /class="group-initials"[^>]*>BC<\/span>/);
  assert.match(html, /Brew &amp; Chat/);
  assert.match(html, /2 members/);
  const groupTitleRow = html.match(/<span class="group-title-row">([\s\S]*?)<\/span>/)?.[1] ?? '';
  assert.match(groupTitleRow, /Brew &amp; Chat/);
  assert.doesNotMatch(groupTitleRow, /2 members/);
  assert.match(html, /class="group-meta"/);
  assert.match(html, /class="group-author">Maya Chen/);
  assert.match(html, /class="group-preview">Anyone here for the workshop\?/);
  assert.match(html, /class="group-member-count"[^>]*>2<svg/);
  assert.doesNotMatch(html, /Group ·|Maya Chen: Anyone|Access ends in/);
  assert.match(html, /18h left/);
  assert.match(html, /Your group access ends in 18 hours\./);
  assert.match(html, /group-title-row/);
  assert.match(html, /group-preview-row/);
  assert.match(html, /data-icon="MagnifyingGlass"/);
  assert.match(html, /Sent you a friend request/);
  assert.match(html, /Friend request sent/);
  assert.match(html, /placeholder="Search chats and people..."/);
  assert.doesNotMatch(html, /search-toggle/);
  assert.match(html, /Accept Bea Kim&#x27;s friend request/);
  assert.match(html, /Decline Bea Kim&#x27;s friend request/);
  assert.match(html, /Cancel friend request to Kai Tan/);
  assert.doesNotMatch(html, /New message|new-message/);
  assert.match(html, /src="https:\/\/images.example\/maya.jpg"/);
  assert.match(html, /You: Thanks for the welcome!/);
  assert.match(html, /Say hello/);
  assert.match(html, /12m/);
  const dmStart = html.indexOf('<ul class="chat-list" aria-label="Chats and friend requests">');
  const dmEnd = html.indexOf('</ul>', dmStart);
  const dmList = html.slice(dmStart, dmEnd);
  assert.doesNotMatch(dmList, /CaretRight/);
  const groupStart = html.indexOf('<button type="button" class="group-card"');
  const groupEnd = html.indexOf('</button>', groupStart);
  assert.doesNotMatch(html.slice(groupStart, groupEnd), /CaretRight/);
  const mayaRow = dmList.indexOf('Open direct message with Maya Chen');
  const jordanRow = dmList.indexOf('Open direct message with Jordan Lee');
  assert.ok(mayaRow >= 0 && jordanRow >= 0 && mayaRow < jordanRow, 'the newest conversation appears before other DM rows');
  assert.ok(dmList.indexOf('Open Brew') < dmList.indexOf("Accept Bea"));
  assert.ok(dmList.indexOf('Cancel friend request to Kai') < mayaRow);
  assert.equal((html.match(/class="chat-list-scroll"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Recent|Nearby|My Groups|Alexandra Petrov|Niko/);
});

test('missing groups take no placeholder space and access-ended notices keep friend chats visible', () => {
  const initial = renderOverview(props({ friends: [acceptedJordan], directPreviews: { [acceptedJordan.id]: { status: 'ready', message: null } } }));
  assert.doesNotMatch(initial, /No group yet|Your chats start with a scan|No pending requests/);
  assert.doesNotMatch(initial, /Your group access ended/);
  assert.match(initial, /Jordan Lee/);

  const ended = renderOverview(props({
    hasObservedGroup: true,
    friends: [acceptedJordan],
    directPreviews: { [acceptedJordan.id]: { status: 'ready', message: null } },
  }));
  assert.match(ended, /Your group access ended/);
  assert.match(ended, /Your friends and DMs stay\./);
  assert.match(ended, /Dismiss group access notice/);
  assert.match(ended, /Jordan Lee/);
  assert.doesNotMatch(ended, /No group yet/);
});

test('failed chat loads and individual preview failures have explicit recovery without empty claims', () => {
  const loadError = renderOverview(props({ hasObservedGroup: true, error: 'offline' }));
  assert.match(loadError, /Couldn’t load your chats\./);
  assert.match(loadError, /Try again to see your group, requests, and messages\./);
  assert.match(loadError, />Retry</);
  assert.doesNotMatch(loadError, /No group yet|Your group access ended|No direct messages/);
  assert.doesNotMatch(loadError, /New message|new-message|accepted friend chooser/);

  const previewError = renderOverview(props({
    friends: [acceptedMaya],
    directPreviews: { [acceptedMaya.id]: { status: 'error' } },
  }));
  assert.match(previewError, /Preview unavailable/);
  assert.match(previewError, /aria-label="Retry loading message preview for Maya Chen"/);
});

test('search matches group and friend names case-insensitively and reports no matching chats', () => {
  assert.equal(chatNameMatches('Alexandra Petrov', 'alex'), true);
  assert.equal(chatNameMatches('Brew & Chat', 'BREW'), true);
  assert.equal(chatNameMatches('Alexandra Petrov', 'venue'), false);
  assert.equal(chatNameMatches('Alexandra Petrov', '  '), true);
});

test('requests are newest first, and requests alone prevent the onboarding empty state', () => {
  const older = { ...incomingRequest, requested_at: '2026-09-29T10:00:00Z' };
  const newer = { ...outgoingRequest, requested_at: '2026-10-01T10:00:00Z' };
  const html = renderOverview(props({ friends: [older, newer] }));
  assert.ok(html.indexOf('Cancel friend request to Kai') < html.indexOf('Accept Bea'));
  assert.doesNotMatch(html, /Your chats start with a scan|No pending requests|Direct messages/);
  const empty = renderOverview();
  assert.match(empty, /Your chats start with a scan/);
  assert.match(empty, /Scan a QR code/);
  assert.doesNotMatch(empty, /No group yet|No pending requests/);
});

test('first-DM copy and composer keep the addressed friend and recoverable draft visible', () => {
  const empty = renderToStaticMarkup(React.createElement(directParts.FirstDirectMessageEmpty, { friendName: 'Jordan Lee' }));
  assert.match(empty, /Say hello to Jordan Lee/);
  assert.match(empty, /Send your first message\./);

  const failedComposer = renderToStaticMarkup(React.createElement(directParts.DirectMessageComposer, {
    draft: 'A message I can retry',
    friendName: 'Jordan Lee',
    busy: false,
    sending: false,
    ready: true,
    loading: false,
    loadError: '',
    sendError: 'Could not send your message. Your draft is still here; try again.',
    onChange: noOp,
    onSubmit: noOp,
  }));
  assert.match(failedComposer, /value="A message I can retry"/);
  assert.match(failedComposer, /placeholder="Message Jordan Lee…"/);
  assert.match(failedComposer, /message-composer-pill/);
  assert.match(failedComposer, /data-icon="send"/);
  assert.match(failedComposer, /Your draft is still here/);

  const pendingComposer = renderToStaticMarkup(React.createElement(directParts.DirectMessageComposer, {
    draft: 'Sending a note',
    friendName: 'Jordan Lee',
    busy: true,
    sending: true,
    ready: true,
    loading: false,
    loadError: '',
    sendError: '',
    onChange: noOp,
    onSubmit: noOp,
  }));
  assert.match(pendingComposer, /aria-busy="true"/);
  assert.match(pendingComposer, /aria-label="Sending direct message"/);
  assert.match(pendingComposer, /send-spinner/);
  assert.match(pendingComposer, /value="Sending a note"/);
  assert.match(pendingComposer, /disabled/);
});

test('direct-message bubbles keep sent messages compact and show received sender avatars and profile actions', () => {
  const session = { id: sessionId, name: 'Current User', avatarUrl: 'https://images.example/current.jpg' };
  const peer = { id: 'user-jordan', display_name: 'Jordan Lee', avatar_url: 'https://images.example/jordan.jpg' };
  const renderBubble = (senderId) => renderToStaticMarkup(React.createElement(directParts.DirectMessageBubble, {
    message: { id: 10, sender_id: senderId, body: 'Hello there', created_at: '2026-10-01T11:00:00.000Z' },
    session,
    peer,
    onOpenProfile: noOp,
  }));

  const own = renderBubble(sessionId);
  assert.match(own, /class="own"/);
  assert.match(own, /<p>Hello there<\/p>/);
  assert.doesNotMatch(own, /<button|<img|message-meta/);

  const received = renderBubble(peer.id);
  assert.match(received, /src="https:\/\/images\.example\/jordan\.jpg"/);
  assert.match(received, /View Jordan Lee&#x27;s profile/);
  assert.match(received, /<p>Hello there<\/p>/);
  assert.doesNotMatch(received, /message-meta/);

  const opened = [];
  const receivedElement = directParts.DirectMessageBubble({
    message: { id: 11, sender_id: peer.id, body: 'Private note', created_at: '2026-10-01T11:00:00.000Z' },
    session,
    peer,
    onOpenProfile: (id) => opened.push(id),
  });
  receivedElement.props.children[0].props.onClick();
  assert.deepEqual(opened, [peer.id]);

  const deleted = renderBubble(null);
  assert.match(deleted, /Former participant/);
  assert.match(deleted, /disabled=""/);
  assert.doesNotMatch(deleted, /src="https:\/\/images\.example\//);
  const deletedElement = directParts.DirectMessageBubble({
    message: { id: 12, sender_id: null, body: 'Old message', created_at: '2026-10-01T11:00:00.000Z' },
    session,
    peer,
    onOpenProfile: (id) => opened.push(id),
  });
  assert.equal(deletedElement.props.children[0].props.disabled, true);
  deletedElement.props.children[0].props.onClick();
  assert.deepEqual(opened, [peer.id]);
});


test('legacy chats links reach the single home page without changing the QR key', async () => {
  const { default: ChatsPage } = await loadTsxModule('../src/app/(protected)/chats/page.tsx');
  const { getURLFromRedirectError } = requireFromTest('next/dist/client/components/redirect');
  const code = 'Room%2Fα +&';
  await assert.rejects(ChatsPage({ searchParams: Promise.resolve({ code }) }), (error) => {
    const destination = getURLFromRedirectError(error);
    assert.equal(destination, `/?code=${encodeURIComponent(code)}`);
    assert.equal(new URL(destination, 'https://chat.example').searchParams.get('code'), code);
    return true;
  });
  await assert.rejects(ChatsPage({ searchParams: Promise.resolve({}) }), (error) => {
    assert.equal(getURLFromRedirectError(error), '/');
    return true;
  });
});

test('the profile route leaves rendering to the persistent protected layout', async () => {
  const { default: ProfilePage } = await loadTsxModule('../src/app/(protected)/profile/page.tsx');
  assert.equal(ProfilePage(), null);
});

test('the profile page provides a back link to Chats and keeps its actions', async () => {
  const { ProfileView } = await loadTsxModule('../src/components/profile-view.tsx');
  const html = renderToStaticMarkup(React.createElement(ProfileView, {
    session: { id: sessionId, name: 'Andy' }, group: null, ready: true, busy: false,
    onSave: async () => true, onLeave: noOp, onSignOut: noOp,
  }));
  assert.match(html, /<a[^>]*aria-label="Back to chats"[^>]*href="\/"/);
  assert.match(html, /aria-label="Settings"/);
  assert.match(html, /Edit Profile/);
  assert.match(html, /Privacy/);
  assert.match(html, /Help &amp; Feedback/);
  assert.doesNotMatch(html, /Saved Places|Notifications|profile-stats|>Messages<|>Places</);
  assert.doesNotMatch(html, /profile-sheet|sheet-grabber/);
});


test('landing offers browser entry and keeps unavailable native download slots empty', async () => {
  const { LandingPage } = await loadTsxModule('../src/components/landing-page.tsx');
  const html = renderToStaticMarkup(React.createElement(LandingPage));
  assert.match(html, /A little/);
  assert.match(html, /href="\/sign-in"/);
  assert.match(html, /Open web app/);
  assert.match(html, /Scan to open QR Chat in your phone/);
  assert.match(html, /Sign in with Google/);
  assert.match(html, /one active group at a time/);
  assert.match(html, /up to 24 hours/);
  assert.equal((html.match(/class="landing-native-slot"[^>]*><\/div>/g) ?? []).length, 2);
  assert.equal((html.match(/Not available yet/g) ?? []).length, 2);
  assert.doesNotMatch(html, /apps\.apple\.com|play\.google\.com|Saved Places|Notifications/);
});


test('DM cards include hidden circular actions without a hover menu', () => {
  const html = renderOverview(props({ friends: [acceptedMaya], directPreviews: { [acceptedMaya.id]: { status: 'ready', message: null } } }));
  assert.match(html, /dm-swipe-row/);
  assert.match(html, /class="dm-swipe-actions" aria-hidden="true" inert=""/);
  assert.match(html, /aria-label="Unfriend Maya Chen"/);
  assert.match(html, /aria-label="Block Maya Chen"/);
  assert.doesNotMatch(html, /dm-actions-toggle|Show actions for/);
});


test('request cards show inline actions without a profile popup trigger', () => {
  const html = renderOverview(props({ friends: [incomingRequest, outgoingRequest] }));
  assert.match(html, /class="request-person"/);
  assert.doesNotMatch(html, /View .*profile/);
  assert.match(html, /Accept Bea Kim/);
  assert.match(html, /Cancel friend request to Kai Tan/);
});
