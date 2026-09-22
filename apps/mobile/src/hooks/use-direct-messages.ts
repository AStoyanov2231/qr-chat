import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDirectSnapshot, watchChanges, type ConnectionState } from '@qr-chat/api';
import { useAuth } from '@/providers/auth-provider';
import { errorMessage } from '@/providers/chat-provider';

export function useDirectMessages(connectionId: string | null) {
  const { api, active } = useAuth();
  const [state, setState] = useState({ messages: [] as Awaited<ReturnType<typeof loadDirectSnapshot>>['messages'], nextCursor: null as number | null, loadedFor: null as string | null, error: '' });
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const pages = useRef({ connectionId, count: 1 });
  const reload = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!api || !connectionId || !active) return;
    let stopped = false;
    let generation = 0;
    if (pages.current.connectionId !== connectionId) pages.current = { connectionId, count: 1 };
    const refresh = async () => {
      const ticket = ++generation;
      try {
        const next = await loadDirectSnapshot(api, connectionId, pages.current.count);
        if (!stopped && ticket === generation) setState({ ...next, loadedFor: connectionId, error: '' });
      } catch (reason) {
        if (!stopped && ticket === generation) setState({ messages: [], nextCursor: null, loadedFor: connectionId, error: errorMessage(reason) });
        throw reason;
      }
    };
    reload.current = refresh;
    void refresh().catch(() => {});
    const watcher = watchChanges(api.client, [{ table: 'direct_messages', column: 'friend_connection_id', id: connectionId }], refresh, setConnection);
    return () => { stopped = true; watcher.stop(); reload.current = async () => {}; };
  }, [api, connectionId, active]);
  const refresh = useCallback(() => reload.current(), []);
  const current = !!connectionId && state.loadedFor === connectionId;
  return { messages: current ? state.messages : [], nextCursor: current ? state.nextCursor : null, error: current ? state.error : '', loading: !!connectionId && !current, connection: active && connectionId ? connection : 'reconnecting', refresh,
    async loadOlder() { const budget = pages.current; budget.count++; try { await reload.current(); } catch (error) { budget.count--; throw error; } },
  };
}
