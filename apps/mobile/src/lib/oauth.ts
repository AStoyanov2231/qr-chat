import { createSignInCompleter } from './auth-callback';
import { authCallback, getNativeApi } from './supabase';

export const completeSignIn = createSignInCompleter(authCallback, async (code, flowId) => {
  const api = getNativeApi();
  if (!api) throw new Error('Sign-in is not configured.');
  const { error } = await api.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (error) throw new Error('Could not complete sign-in. Please try again.');
});
