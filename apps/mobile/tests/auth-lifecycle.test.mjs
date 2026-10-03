import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { reset, render, state, act } from './support/native-harness.mjs';
const { AuthProvider, useAuth } = await import('../src/providers/auth-provider.tsx');
const { default: AppLayout } = await import('../src/app/(app)/_layout.tsx');

function authFixture(getSession = async () => ({ data: { session: null }, error: null })) {
  reset();
  const calls = [];
  state.nativeApi = { client: { auth: {
    getSession,
    onAuthStateChange(callback) { state.authEvent = callback; return { data: { subscription: { unsubscribe: () => calls.push('unsubscribe') } } }; },
    startAutoRefresh: async () => calls.push('start'),
    stopAutoRefresh: async () => calls.push('stop'),
  } } };
  let auth;
  function Probe() { auth = useAuth(); return null; }
  function App() { return React.createElement(AuthProvider, null, React.createElement(Probe)); }
  return { App, calls, get auth() { return auth; } };
}

test('native auth retains a QR destination through sign-in and clears protected identity on sign-out', async (t) => {
  const fixture = authFixture();
  state.initialURL = 'qrchat://join?code=Room-A';
  await render(t, fixture.App);
  assert.equal(fixture.auth.pendingCode, 'Room-A');
  assert.equal(fixture.auth.userId, null);
  await act(async () => { state.authEvent('SIGNED_IN', { user: { id: 'me' } }); });
  assert.equal(fixture.auth.pendingCode, 'Room-A');
  assert.equal(fixture.auth.userId, 'me');
  await act(async () => { fixture.auth.clearPendingCode(); });
  assert.equal(fixture.auth.pendingCode, null);
  await act(async () => { state.authEvent('SIGNED_OUT', null); });
  assert.equal(fixture.auth.userId, null);
});

test('token refresh follows foreground/background and a late session read cannot undo sign-out', async (t) => {
  let resolveSession;
  const fixture = authFixture(() => new Promise(resolve => { resolveSession = resolve; }));
  await render(t, fixture.App);
  await act(async () => { for (const listener of state.appListeners) listener('background'); });
  assert.equal(fixture.auth.active, false);
  await act(async () => { for (const listener of state.appListeners) listener('active'); });
  assert.deepEqual(fixture.calls, ['start', 'stop', 'start']);
  await act(async () => {
    state.authEvent('SIGNED_OUT', null);
    resolveSession({ data: { session: { user: { id: 'old-user' } } }, error: null });
  });
  assert.equal(fixture.auth.userId, null);
  assert.equal(fixture.auth.loading, false);
});

test('the newest QR event wins over a delayed initial link and OAuth callbacks cannot replace it', async (t) => {
  const fixture = authFixture();
  let resolveInitial;
  state.initialURL = new Promise(resolve => { resolveInitial = resolve; });
  await render(t, fixture.App);
  await act(async () => {
    for (const listener of state.linkListeners) listener({ url: 'qrchat://join?code=Newest' });
    resolveInitial('qrchat://join?code=Old');
  });
  assert.equal(fixture.auth.pendingCode, 'Newest');
  await act(async () => { for (const listener of state.linkListeners) listener({ url: 'qrchat://auth/callback?code=oauth' }); });
  assert.equal(fixture.auth.pendingCode, 'Newest');
});

test('a pending external QR opens the scanner', async (t) => {
  reset();
  const code = 'com.qrchat.mobile://expo-development-client/?url=http%3A%2F%2F192.168.100.56%3A8081';
  state.auth = { ...state.auth, pendingCode: code, clearPendingCode: () => { state.auth.pendingCode = null; } };
  const screen = await render(t, AppLayout);
  assert.deepEqual(state.navigation, [['replace', '/scan']]);
  assert.equal(state.auth.pendingCode, null);
  await screen.update();
  assert.equal(state.navigation.length, 1);
});

test('native offline state pauses networking and reconnect activates exactly once', async t => {
  const fixture=authFixture();state.networkState={isConnected:false,isInternetReachable:false};
  const screen=await render(t,fixture.App);
  assert.equal(fixture.auth.active,false);assert.deepEqual(fixture.calls,['stop']);
  state.networkState={isConnected:true,isInternetReachable:true};await screen.update();
  assert.equal(fixture.auth.active,true);assert.deepEqual(fixture.calls,['stop','start']);
  await screen.update();assert.deepEqual(fixture.calls,['stop','start']);
  state.networkState={isConnected:true,isInternetReachable:false};await screen.update();
  assert.equal(fixture.auth.active,false);assert.deepEqual(fixture.calls,['stop','start','stop']);
});
