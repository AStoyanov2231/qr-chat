import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { emptySnapshot, loadChatSnapshot, watchChanges, type ChatSnapshot, type ConnectionState } from '@qr-chat/api';
import { z } from '@qr-chat/validation';
import { useAuth } from './auth-provider';

export function errorMessage(reason: unknown) {
  return reason instanceof z.ZodError ? 'Check your input and try again.' : reason instanceof Error ? reason.message : 'Could not connect. Please try again.';
}
function useBackend() {
  const { api, userId, active } = useAuth();
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [roomConnection, setRoomConnection] = useState<ConnectionState>('connecting');
  const generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  const alive = useRef(false);
  const pages = useRef({ groupId: '', count: 1 });
  const refresh = useCallback(async () => {
    if (!api || !userId || !alive.current) return;
    const ticket = ++generation.current;
    try {
      const next = await loadChatSnapshot(api, pages.current);
      if (!alive.current || ticket !== generation.current) return;
      if (next.session?.id !== userId) throw new Error('Please sign in again.');
      if (pages.current.groupId !== (next.group?.id ?? '')) pages.current = { groupId: next.group?.id ?? '', count: 1 };
      setSnapshot(next); setReady(true); setError('');
    } catch (reason) {
      if (!alive.current || ticket !== generation.current) return;
      setSnapshot(emptySnapshot); setReady(false); setError(errorMessage(reason));
      throw reason;
    }
  }, [api, userId]);
  useEffect(() => {
    alive.current = active;
    if (!api || !userId || !active) return;
    void refresh().catch(() => {});
    const watcher = watchChanges(api.client, [
      { table: 'group_memberships', column: 'user_id', id: userId },
      { table: 'friend_connections', column: 'user_a_id', id: userId },
      { table: 'friend_connections', column: 'user_b_id', id: userId },
    ], refresh, setConnection);
    return () => { alive.current = false; invalidate(); watcher.stop(); };
  }, [active, api, userId, refresh, invalidate]);
  const groupId = snapshot.group?.id;
  useEffect(() => {
    if (!api || !groupId || !active) return;
    const watcher = watchChanges(api.client, [
      { table: 'group_memberships', column: 'group_id', id: groupId },
      { table: 'group_messages', column: 'group_id', id: groupId },
    ], refresh, setRoomConnection);
    return () => watcher.stop();
  }, [active, api, groupId, refresh]);
  useEffect(() => {
    if (!snapshot.expiresAt || !active) return;
    const timer = setTimeout(() => { void refresh().catch(() => {}); }, Math.max(1000, Date.parse(snapshot.expiresAt) - Date.now() + 100));
    return () => clearTimeout(timer);
  }, [active, snapshot.expiresAt, refresh]);
  return { ...snapshot, ready, error, refresh, connection: active && connection === 'connected' && (!groupId || roomConnection === 'connected') ? 'connected' : 'reconnecting',
    async loadOlder() { const previous = pages.current.count; pages.current.count++; try { await refresh(); } catch (error) { pages.current.count = previous; throw error; } },
  };
}
const Context = createContext<ReturnType<typeof useBackend> | null>(null);
export function ChatProvider({ children }: PropsWithChildren) { const value = useBackend(); return <Context value={value}>{children}</Context>; }
export function useChat() { const value = use(Context); if (!value) throw new Error('ChatProvider is required.'); return value; }
