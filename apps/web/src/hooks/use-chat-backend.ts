"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createChatApi, watchChanges, loadChatSnapshot, loadDirectSnapshot, emptySnapshot, type ChatSnapshot, type ConnectionState, type Tables } from "@qr-chat/api";
import { createClient } from "@/lib/supabase/client";
import { z } from "@qr-chat/validation";

type Api = ReturnType<typeof createChatApi>;
const empty = emptySnapshot;
export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return "Check your input and try again.";
  return error instanceof Error ? error.message : "Could not connect. Please try again.";
}

export function useChatBackend() {
  const [api] = useState(() => createChatApi(createClient(), { qrNameEndpoint: "/api/qr-name" }));
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [roomConnection, setRoomConnection] = useState<ConnectionState>("connecting");
  const [previewConnection, setPreviewConnection] = useState<ConnectionState>("connecting");
  const [hasObservedGroup, setHasObservedGroup] = useState(false);
  const generation = useRef(0);
  const alive = useRef(false);
  const pages = useRef({ groupId: "", count: 1 });
  const observedGroup = useRef<{ userId: string | null; hadGroup: boolean }>({ userId: null, hadGroup: false });

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const next = await loadChatSnapshot(api, pages.current);
      if (!alive.current || ticket !== generation.current) return;
      if (pages.current.groupId !== (next.group?.id ?? "")) pages.current = { groupId: next.group?.id ?? "", count: 1 };
      if (observedGroup.current.userId !== next.session?.id) {
        observedGroup.current = { userId: next.session?.id ?? null, hadGroup: false };
      }
      if (next.group) observedGroup.current.hadGroup = true;
      setHasObservedGroup(observedGroup.current.hadGroup);
      setSnapshot(next);
      setError("");
      setReady(true);
    } catch (reason) {
      if (!alive.current || ticket !== generation.current) return;
      // Never keep potentially unauthorized messages visible after a failed reconciliation.
      setSnapshot(empty);
      setError(errorMessage(reason));
      setReady(false);
      throw reason;
    }
  }, [api]);

  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => { void refresh().catch(() => {}); }, 0);
    const resume = () => { if (!document.hidden) void refresh().catch(() => {}); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    const poll = setInterval(resume, 30000);
    const offline = () => setConnection("reconnecting");
    window.addEventListener("offline", offline);
    const { data } = api.client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        ++generation.current;
        observedGroup.current = { userId: null, hadGroup: false };
        setHasObservedGroup(false);
        setSnapshot(empty);
        setReady(false);
        window.location.replace("/sign-in");
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        setTimeout(() => { if (alive.current) void refresh().catch(() => {}); }, 0);
      }
    });
    return () => {
      alive.current = false;
      // This counter invalidates async requests; it is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      clearTimeout(timer);
      clearInterval(poll);
      data.subscription.unsubscribe();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [api, refresh]);

  const id = snapshot.session?.id;
  const groupId = snapshot.group?.id;
  useEffect(() => {
    if (!id) return;
    const watcher = watchChanges(api.client, [
      { table: "group_memberships", column: "user_id", id },
      { table: "friend_connections", column: "user_a_id", id },
      { table: "friend_connections", column: "user_b_id", id },
    ], refresh, setConnection);
    return () => watcher.stop();
  }, [api, id, refresh]);
  useEffect(() => {
    if (!groupId) return;
    const watcher = watchChanges(api.client, [
      { table: "group_memberships", column: "group_id", id: groupId },
      { table: "group_messages", column: "group_id", id: groupId },
    ], refresh, setRoomConnection);
    return () => watcher.stop();
  }, [api, groupId, refresh]);
  const acceptedDirectConnectionKey = snapshot.friends
    .filter((friend) => friend.accepted_at !== null)
    .map((friend) => friend.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!acceptedDirectConnectionKey) return;
    const watcher = watchChanges(api.client, acceptedDirectConnectionKey.split(",").map((id) => ({
      table: "direct_messages" as const,
      column: "friend_connection_id" as const,
      id,
    })), refresh, setPreviewConnection);
    return () => watcher.stop();
  }, [acceptedDirectConnectionKey, api, refresh]);
  useEffect(() => {
    if (!snapshot.expiresAt) return;
    const timer = setTimeout(() => {
      // The clock schedules reconciliation; only PostgreSQL decides expiration.
      void refresh().catch(() => {});
    }, Math.max(1000, Date.parse(snapshot.expiresAt) - Date.now() + 100));
    return () => clearTimeout(timer);
  }, [snapshot.expiresAt, refresh]);
  return {
    ...snapshot, api, ready, error, refresh,
    hasObservedGroup,
    connection: connection === "connected"
      && (!groupId || roomConnection === "connected")
      && (!acceptedDirectConnectionKey || previewConnection === "connected")
      ? "connected"
      : "reconnecting",
    async loadOlder() { pages.current.count++; await refresh(); },
  };
}

export function useDirectMessages(api: Api, connectionId: string | null) {
  const [messages, setMessages] = useState<Tables<"direct_messages">[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const pages = useRef(1);
  const activeConnectionId = useRef(connectionId);
  const reload = useRef<{ connectionId: string | null; run: () => Promise<void> }>({ connectionId: null, run: async () => {} });
  useLayoutEffect(() => { activeConnectionId.current = connectionId; }, [connectionId]);
  useEffect(() => {
    let stopped = false;
    let ticket = 0;
    pages.current = 1;
    async function refresh() {
      const request = ++ticket;
      if (!connectionId) return;
      try {
        const next = await loadDirectSnapshot(api, connectionId, pages.current);
        if (stopped || request !== ticket) return;
        setLoadedFor(connectionId);
        setMessages(next.messages); setNextCursor(next.nextCursor); setError(""); setLoading(false);
      } catch (reason) {
        if (stopped || request !== ticket) return;
        setMessages([]); setNextCursor(null); setError(errorMessage(reason)); setLoading(false);
        throw reason;
      }
    }
    reload.current = { connectionId, run: refresh };
    const timer = setTimeout(() => {
      setMessages([]); setNextCursor(null); setLoading(true); setError("");
      void refresh().catch(() => {});
    }, 0);
    const watcher = connectionId ? watchChanges(api.client, [{ table: "direct_messages", column: "friend_connection_id", id: connectionId }], refresh, setConnection) : null;
    const resume = () => { if (!document.hidden) void refresh().catch(() => {}); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; clearTimeout(timer); watcher?.stop(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [api, connectionId]);
  return {
    messages: loadedFor === connectionId ? messages : [],
    nextCursor: loadedFor === connectionId ? nextCursor : null,
    error,
    loading: loading || loadedFor !== connectionId,
    connection,
    refresh: () => {
      const current = reload.current;
      return activeConnectionId.current === connectionId && current.connectionId === connectionId
        ? current.run()
        : Promise.resolve();
    },
    async loadOlder() {
      const current = reload.current;
      if (activeConnectionId.current !== connectionId || current.connectionId !== connectionId || !connectionId) return;
      pages.current++;
      await current.run();
    },
  };
}
