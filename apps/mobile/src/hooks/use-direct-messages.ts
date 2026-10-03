import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { getChatStore } from '@qr-chat/api';
import { useAuth } from '@/providers/auth-provider';
import { errorMessage } from '@/providers/chat-provider';

const empty = { messages: [], nextCursor: null, loading: true, error: '' };
export function useDirectMessages(connectionId: string | null) {
  const { api, active } = useAuth();
  const store = useMemo(() => api ? getChatStore(api) : null, [api]);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : () => {}, [store]);
  const getState = useCallback(() => store?.getState() ?? null, [store]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  useFocusEffect(useCallback(() => active && connectionId && store ? store.openDirect(connectionId) : undefined, [store, connectionId, active]));
  const direct = state?.ready && connectionId ? state.directs[connectionId] ?? empty : empty;
  const error = state?.error || direct.error;
  return { ...direct, error: error ? errorMessage(new Error(error)) : '', connection: active ? state?.connection ?? 'connecting' : 'reconnecting',
    refresh: () => active && connectionId && store ? store.refreshDirect(connectionId) : Promise.resolve(),
    loadOlder: () => active && connectionId && store ? store.loadOlderDirect(connectionId) : Promise.resolve() };
}
