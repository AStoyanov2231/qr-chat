import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state } from './support/native-harness.mjs';

const { default: SignIn } = await import('../src/app/sign-in.tsx');

for (const platform of ['ios', 'android']) {
  test(`${platform}: native product sign-in offers only Google and completes its secure callback`, async t => {
    reset(); process.env.EXPO_OS = platform;
    const calls = [];
    state.auth.api = { client: { auth: { signInWithOAuth: async options => {
      calls.push(options);
      return { data: { url: 'https://auth.example/google' }, error: null };
    } } } };
    state.openAuthSession = async (url, callback) => {
      assert.equal(url, 'https://auth.example/google');
      assert.equal(callback, 'qrchat://auth/callback');
      return { type: 'success', url: `${callback}?code=temporary-code` };
    };
    state.completeSignIn = async url => calls.push(url);
    const screen = await render(t, SignIn);
    assert.doesNotMatch(screen.text(), /Continue with Apple|email|password/);
    await screen.press('Continue with Google');
    assert.deepEqual(calls, [
      { provider: 'google', options: { redirectTo: 'qrchat://auth/callback', skipBrowserRedirect: true } },
      'qrchat://auth/callback?code=temporary-code',
    ]);
  });

  test(`${platform}: a failed Google start remains retryable without opening an invalid URL`, async t => {
    reset(); process.env.EXPO_OS = platform;
    state.auth.api = { client: { auth: { signInWithOAuth: async () => ({ data: {}, error: new Error('Offline') }) } } };
    state.openAuthSession = () => assert.fail('Invalid OAuth response must not open a browser');
    const screen = await render(t, SignIn);
    await screen.press('Continue with Google');
    assert.match(screen.text(), /Could not start sign-in/);
    const button = screen.root.findAll(node => node.type === 'SwiftUIButton' || node.type === 'ComposeButton')[0];
    assert.equal(button.props.enabled ?? !button.props.modifiers.some(modifier => modifier.$type === 'disabled' && modifier.value), true);
  });
}
