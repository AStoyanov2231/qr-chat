import { createContext, use, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { emptySnapshot, getChatStore, type ConnectionState } from '@qr-chat/api';
import { z } from '@qr-chat/validation';
import { useAuth } from './auth-provider';

export function errorMessage(reason: unknown) {
  if (reason instanceof z.ZodError) return 'Check your input and try again.';
  const message = reason instanceof Error ? reason.message : '';
  if (/failed to fetch|fetch failed|load failed|network(?:error| request failed)|network connection was lost|internet connection.*offline/i.test(message)) {
    return 'Could not connect. Check your internet connection and try again.';
  }
  return message || 'Could not connect. Please try again.';
}
const empty = { snapshot: emptySnapshot, ready: false, error: '', connection: 'connecting' as ConnectionState, hasObservedGroup: false, groupLoading: false, directs: {} };
const idle = async () => {};
const noGroup = () => () => {};
function useBackend() {
  const { api, userId, active } = useAuth();
  const store = useMemo(() => api ? getChatStore(api) : null, [api]);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : () => {}, [store]);
  const getState = useCallback(() => store?.getState() ?? empty, [store]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  const [scannedCode, acceptScan] = useState<string | null>(null);
  const clearScan = useCallback(() => acceptScan(null), []);
  useEffect(() => {
    if (!store || !userId || !active) return;
    void store.start();
    return () => store.pause();
  }, [store, userId, active]);
  return { ...state.snapshot, ready: state.ready, error: state.error ? errorMessage(new Error(state.error)) : '', groupAccessEnded: state.ready && state.hasObservedGroup && !state.snapshot.group,
    groupLoading: state.groupLoading, connection: active ? state.connection : 'reconnecting' as ConnectionState,
    refresh: store?.refresh ?? idle, refreshGroup: store?.refreshGroup ?? idle, openGroup: store?.openGroup ?? noGroup,
    loadOlder: store?.loadOlderGroup ?? idle, scannedCode, acceptScan, clearScan };
}
const Context = createContext<ReturnType<typeof useBackend> | null>(null);
export function ChatProvider({ children }: PropsWithChildren) { const value = useBackend(); return <Context value={value}>{children}</Context>; }
export function useChat() { const value = use(Context); if (!value) throw new Error('ChatProvider is required.'); return value; }
