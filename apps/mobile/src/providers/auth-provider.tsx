import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Linking } from 'react-native';
import { getNativeApi, webOrigin } from '@/lib/supabase';
import { codeFromLink } from '@/lib/qr-link';

type Auth = { api: ReturnType<typeof getNativeApi>; userId: string | null; loading: boolean; active: boolean; error: string; pendingCode: string | null; clearPendingCode: () => void };
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [api] = useState(getNativeApi);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const clearPendingCode = useCallback(() => setPendingCode(null), []);
  useEffect(() => {
    let stopped = false;
    let receivedLink = false;
    const accept = (url: string | null) => {
      const code = codeFromLink(url, webOrigin);
      if (!stopped && code) setPendingCode(code);
    };
    const listener = Linking.addEventListener('url', ({ url }) => { receivedLink = true; accept(url); });
    void Linking.getInitialURL().then(url => { if (!receivedLink) accept(url); }).catch(() => {});
    return () => { stopped = true; listener.remove(); };
  }, []);
  useEffect(() => {
    if (!api) return;
    let stopped = false;
    let authChanged = false;
    const { data } = api.client.auth.onAuthStateChange((event, session) => {
      authChanged = true;
      if (!stopped) { setUserId(session?.user.id ?? null); setLoading(false); setError(''); if (event === 'SIGNED_OUT') setPendingCode(null); }
    });
    void api.client.auth.getSession().then(({ data, error }) => {
      if (stopped || authChanged) return;
      if (error) setError('Could not restore your session. Please sign in again.');
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    }).catch(() => { if (!stopped) { setError('Could not read secure storage. Restart the app and try again.'); setLoading(false); } });
    const change = (state: string) => {
      setActive(state === 'active');
      if (state === 'active') void api.client.auth.startAutoRefresh();
      else void api.client.auth.stopAutoRefresh();
    };
    change(AppState.currentState);
    const subscription = AppState.addEventListener('change', change);
    return () => { stopped = true; data.subscription.unsubscribe(); subscription.remove(); void api.client.auth.stopAutoRefresh(); };
  }, [api]);
  return <Context value={{ api, userId, loading: !!api && loading, active, error, pendingCode, clearPendingCode }}>{children}</Context>;
}
export function useAuth() {
  const value = use(Context);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
