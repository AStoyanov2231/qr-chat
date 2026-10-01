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
const icons = Object.fromEntries(['CaretRight', 'Clock', 'MagnifyingGlass', 'X'].map((name) => [
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
    if (specifier === '@/components/icon') return { Icon };
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
    onOpenProfile: noOp,
    onAcceptRequest: noOp,
    onRemoveRequest: noOp,
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

test('Chats loading skeleton follows the group, requests, and direct-message structure without fake controls', () => {
  const html = renderOverview({ loading: true });
  assert.match(html, /<h1>Chats<\/h1>/);
  assert.match(html, /Your group/);
  assert.match(html, /Friend requests/);
  assert.match(html, /Direct messages/);
  assert.match(html, /Loading chats…/);
  assert.equal((html.match(/class="dm-loading-row"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<button|Recent|Nearby|My Groups/);
});

test('active Chats overview shows real group details, collapsed requests, ordered DMs, previews, ages, and avatars', () => {
  const mayaMessage = {
    id: 'direct-message-1',
    friend_connection_id: acceptedMaya.id,
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
    expiresAt: new Date(Date.now() + 19 * 60 * 60_000).toISOString(),
  }));

  assert.match(html, /<h1>Chats<\/h1>/);
  assert.match(html, /Your group/);
  assert.match(html, /class="group-initials"[^>]*>BC<\/span>/);
  assert.match(html, /Brew &amp; Chat/);
  assert.match(html, /2 members/);
  assert.match(html, /Maya Chen: Anyone here for the workshop\?/);
  assert.match(html, /Your access ends in/);
  assert.match(html, /Friend requests \(2\)/);
  assert.match(html, /Accept Bea Kim&#x27;s friend request/);
  assert.match(html, /Decline Bea Kim&#x27;s friend request/);
  assert.match(html, /Cancel friend request to Kai Tan/);
  assert.match(html, /New message/);
  assert.match(html, /src="https:\/\/images.example\/maya.jpg"/);
  assert.match(html, /You: Thanks for the welcome!/);
  assert.match(html, /Say hello/);
  assert.match(html, /12m/);
  const dmStart = html.indexOf('<ul class="dm-list">');
  const dmEnd = html.indexOf('</ul>', dmStart);
  const dmList = html.slice(dmStart, dmEnd);
  const mayaRow = dmList.indexOf('Open direct message with Maya Chen');
  const jordanRow = dmList.indexOf('Open direct message with Jordan Lee');
  assert.ok(mayaRow >= 0 && jordanRow >= 0 && mayaRow < jordanRow, 'the newest conversation appears before other DM rows');
  assert.doesNotMatch(html, /Recent|Nearby|My Groups|Alexandra Petrov|Niko/);
});

test('first-time and observed access-ended states stay distinct and keep friend chats visible', () => {
  const initial = renderOverview(props({ friends: [acceptedJordan], directPreviews: { [acceptedJordan.id]: { status: 'ready', message: null } } }));
  assert.match(initial, /No group yet/);
  assert.match(initial, /Scan a QR code/);
  assert.doesNotMatch(initial, /Your group access ended/);
  assert.match(initial, /Jordan Lee/);

  const ended = renderOverview(props({
    hasObservedGroup: true,
    friends: [acceptedJordan],
    directPreviews: { [acceptedJordan.id]: { status: 'ready', message: null } },
  }));
  assert.match(ended, /Your group access ended/);
  assert.match(ended, /Your friends and DMs stay\./);
  assert.match(ended, /Scan a QR code/);
  assert.match(ended, /Jordan Lee/);
  assert.doesNotMatch(ended, /No group yet/);
});

test('failed chat loads and individual preview failures have explicit recovery without empty claims', () => {
  const loadError = renderOverview(props({ hasObservedGroup: true, error: 'offline' }));
  assert.match(loadError, /Couldn’t load your chats\./);
  assert.match(loadError, /Try again to see your group, requests, and messages\./);
  assert.match(loadError, />Retry</);
  assert.doesNotMatch(loadError, /No group yet|Your group access ended|No direct messages/);
  assert.match(loadError, /Couldn’t load accepted friends\. Retry to choose someone to message\./);
  assert.match(loadError, /aria-label="Close new message"/);
  assert.doesNotMatch(loadError, /No accepted friends yet/);

  const previewError = renderOverview(props({
    friends: [acceptedMaya],
    directPreviews: { [acceptedMaya.id]: { status: 'error' } },
  }));
  assert.match(previewError, /Could not load message/);
  assert.match(previewError, /aria-label="Retry loading message preview for Maya Chen"/);
});

test('search matches group and friend names case-insensitively and reports no matching chats', () => {
  assert.equal(chatNameMatches('Alexandra Petrov', 'alex'), true);
  assert.equal(chatNameMatches('Brew & Chat', 'BREW'), true);
  assert.equal(chatNameMatches('Alexandra Petrov', 'venue'), false);
  assert.equal(chatNameMatches('Alexandra Petrov', '  '), true);
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
  assert.match(pendingComposer, /value="Sending a note"/);
  assert.match(pendingComposer, /disabled/);
});
