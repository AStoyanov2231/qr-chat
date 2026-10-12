import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, render, reset, state } from './support/native-harness.mjs';

const { ChatProvider, useChat, errorMessage } = await import(new URL('../src/providers/chat-provider.tsx', import.meta.url).href);

test('network failures explain recovery without exposing transport implementation text', () => {
  for (const message of ['Network request failed', 'TypeError: Failed to fetch', 'Load failed']) {
    assert.equal(errorMessage(new Error(message)), 'Could not connect. Check your internet connection and try again.');
  }
  assert.equal(errorMessage(new Error('Group access ended')), 'Group access ended');
});

test('database rate-limit notices reach the user unchanged', () => {
  for (const notice of ['You are sending messages too fast. Wait a moment and try again.', 'Slow mode is on in this busy chat. Wait a few seconds between messages.', 'You have joined a lot of chats this hour. Try again later.']) {
    assert.equal(errorMessage(Object.assign(new Error(notice), { name: 'ChatApiError', code: 'RATE_LIMITED' })), notice);
  }
});

test('group access is ended only after a successful snapshot observes active-to-none', async (t) => {
  reset();
  state.auth.api = { client: {}, userId: async () => 'me' };
  const activeSnapshot = {
    session: { id: 'me', name: 'Andy', avatarUrl: null, hidden: [] },
    groups: [{ id: 'room-one', expiresAt: '2026-10-02T00:00:00Z' }], friends: [], directPreviews: {},
  };
  state.loadChatSnapshot = async () => activeSnapshot;
  let chat;
  function Probe() { chat = useChat(); return React.createElement('Text', null, chat.groupAccessEnded ? 'ended' : 'active'); }
  function Root() { return React.createElement(ChatProvider, null, React.createElement(Probe)); }
  const screen = await render(t, Root);
  assert.equal(chat.groups[0].id, 'room-one');
  assert.equal(chat.groupAccessEnded, false);

  state.loadChatSnapshot = async () => { throw new Error('Offline'); };
  await act(async () => { await assert.rejects(chat.refresh(), /Offline/); });
  assert.equal(chat.groupAccessEnded, false, 'A failed read cannot be mistaken for expired membership');

  state.loadChatSnapshot = async () => ({ ...activeSnapshot, groups: [] });
  await act(async () => { await chat.refresh(); });
  assert.equal(chat.groupAccessEnded, true, 'A successful active-to-none read explains the expired access state');
  await screen.update();
});

test('accepted DM previews subscribe to message changes and stop after friendship removal', async (t) => {
  reset();
  state.auth.api = { client: {}, userId: async () => 'me' };
  const friendship = { id: '11111111-1111-4111-8111-111111111111', user_a_id: 'me', user_b_id: 'peer', requested_by_id: 'me', accepted_at: '2026-09-30T12:00:00Z', requested_at: '2026-09-30T12:00:00Z', user_b: { id: 'peer', display_name: 'Sam', avatar_url: null } };
  const snapshot = { session: { id: 'me', name: 'Andy', avatarUrl: null, hidden: [] }, groups: [], friends: [friendship], directPreviews: { [friendship.id]: { status: 'ready', message: null } } };
  state.loadChatSnapshot = async () => snapshot;
  let chat;
  function Probe() { chat = useChat(); return null; }
  function Root() { return React.createElement(ChatProvider, null, React.createElement(Probe)); }
  const screen = await render(t, Root);
  const directWatcher = state.watchers.find((watcher) => watcher.filters.some((filter) => filter.table === 'messages' && filter.id === friendship.id));
  assert.ok(directWatcher, 'Accepted friends need a Realtime invalidation filter for their previews');
  assert.equal(chat.connection, 'connected');
  await act(async () => { directWatcher.onState('reconnecting'); });
  assert.equal(chat.connection, 'reconnecting', 'The chat status includes the DM preview subscription');
  await act(async () => { directWatcher.onState('connected'); });
  assert.equal(chat.connection, 'connected');

  state.loadChatSnapshot = async () => ({ ...snapshot, friends: [], directPreviews: {} });
  await act(async () => { await chat.refresh(); });
  assert.equal(directWatcher.stopped, true, 'The message watcher is cleaned up when its friendship is removed');
  await screen.update();
});
