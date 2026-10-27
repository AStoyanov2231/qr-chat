import { createContext, use, useCallback, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { emptySnapshot, errorMessage, getChatStore, type ConnectionState } from '@qr-chat/api';
import { useOutbox } from '@/hooks/use-outbox';
import { useAuth } from './auth-provider';

export { errorMessage };
const empty = { snapshot: emptySnapshot, ready: false, error: '', connection: 'connecting' as ConnectionState, hasObservedGroup: false, groupLoading: false, groupErrors: {} as Record<string, string>, directs: {} };
const idle = async () => {};
const noGroup = (_groupId: string) => () => {};
function useBackend() {
  const { api, userId, active } = useAuth();
  const store = useMemo(() => api ? getChatStore(api) : null, [api]);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : () => {}, [store]);
  const getState = useCallback(() => store?.getState() ?? empty, [store]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (!store || !userId || !active) return;
    void store.start();
    return () => store.pause();
  }, [store, userId, active]);
  return { ...state.snapshot, ready: state.ready, error: state.error ? errorMessage(new Error(state.error)) : '', groupAccessEnded: state.ready && state.hasObservedGroup && !state.snapshot.groups.length,
    groupLoading: state.groupLoading, groupErrors: state.groupErrors, connection: active ? state.connection : 'reconnecting' as ConnectionState,
    refresh: store?.refresh ?? idle, refreshGroup: store?.refreshGroup ?? idle, openGroup: store?.openGroup ?? noGroup,
    loadOlder: store?.loadOlderGroup ?? idle };
}
const Context = createContext<ReturnType<typeof useBackend> & { outbox: ReturnType<typeof useOutbox> } | null>(null);
/** Keyed by account in the app layout; the outbox lives here so failed messages outlast the conversation screen. */
export function ChatProvider({ children }: PropsWithChildren) { const value = useBackend(); const outbox = useOutbox(); return <Context value={{ ...value, outbox }}>{children}</Context>; }
export function useChat() { const value = use(Context); if (!value) throw new Error('ChatProvider is required.'); return value; }
