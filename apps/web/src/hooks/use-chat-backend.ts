"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createChatApi, watchChanges, type ConnectionState, type Tables } from "@qr-chat/api";
import { createClient } from "@/lib/supabase/client";
import { z } from "@qr-chat/validation";
import type { Group, Session, Message } from "@/lib/chat-view";

type Api = ReturnType<typeof createChatApi>;
type Friends = Awaited<ReturnType<Api["friends"]>>;
type Snapshot = { session: Session | null; group: Group | null; friends: Friends; expiresAt: string | null };
const empty: Snapshot = { session: null, group: null, friends: [], expiresAt: null };
export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return "Check your input and try again.";
  return error instanceof Error ? error.message : "Could not connect. Please try again.";
}

export function useChatBackend() {
  const [api] = useState(() => createChatApi(createClient()));
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [roomConnection, setRoomConnection] = useState<ConnectionState>("connecting");
  const generation = useRef(0);
  const alive = useRef(false);
  const pages = useRef({ groupId: "", count: 1 });

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const id = await api.userId();
      const [profile, membership, friends] = await Promise.all([api.profile(), api.currentMembership(), api.friends()]);
      let group: Group | null = null;
      if (membership?.qr_groups?.qr_codes) {
        const room = membership.qr_groups;
        const code = room.qr_codes!;
        if (pages.current.groupId !== room.id) pages.current = { groupId: room.id, count: 1 };
        const members = await api.members(room.id);
        const messages: Message[] = [];
        let before: number | undefined;
        let nextCursor: number | null = null;
        for (let page = 0; page < pages.current.count; page++) {
          const data = await api.groupMessages(room.id, { before });
          messages.push(...data.items.map((message) => ({
            id: String(message.id), user: message.sender_id ?? "deleted", name: message.profiles?.display_name ?? "Former participant",
            text: message.body, time: Date.parse(message.created_at),
          })));
          nextCursor = data.nextCursor;
          if (nextCursor === null) break;
          before = nextCursor;
        }
        // Recheck authorization after a multi-query snapshot, including group switches in another tab.
        const current = await api.currentMembership();
        if (current?.group_id === room.id) group = {
          id: room.id,
          venue: { id: room.id, name: code.display_name ?? code.code_key, codes: [code.code_key], kind: "place", label: "A conversation for this QR code." },
          members: members.map((member) => ({ id: member.user_id, name: member.profiles?.display_name ?? "Participant" })),
          messages: messages.reverse(), nextCursor,
        };
      }
      if (!alive.current || ticket !== generation.current) return;
      setSnapshot({ session: { id, name: profile?.display_name ?? "", avatarUrl: profile?.avatar_url ?? null, hidden: [] }, group, friends, expiresAt: membership?.expires_at ?? null });
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
    connection: connection === "connected" && (!groupId || roomConnection === "connected") ? "connected" : "reconnecting",
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
  const reload = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let stopped = false;
    let ticket = 0;
    pages.current = 1;
    async function refresh() {
      const request = ++ticket;
      if (!connectionId) return;
      try {
        const friends = await api.friends();
        if (!friends.some((friend) => friend.id === connectionId && friend.accepted_at)) throw new Error("This friendship is no longer available.");
        const rows: Tables<"direct_messages">[] = [];
        let before: number | undefined;
        let cursor: number | null = null;
        for (let i = 0; i < pages.current; i++) {
          const page = await api.directMessages(connectionId, { before });
          rows.push(...page.items);
          cursor = page.nextCursor;
          if (cursor === null) break;
          before = cursor;
        }
        if (stopped || request !== ticket) return;
        setLoadedFor(connectionId);
        setMessages(rows.reverse()); setNextCursor(cursor); setError(""); setLoading(false);
      } catch (reason) {
        if (stopped || request !== ticket) return;
        setMessages([]); setNextCursor(null); setError(errorMessage(reason)); setLoading(false);
        throw reason;
      }
    }
    reload.current = refresh;
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
  return { messages: loadedFor === connectionId ? messages : [], nextCursor: loadedFor === connectionId ? nextCursor : null, error, loading: loading || loadedFor !== connectionId, connection, refresh: () => reload.current(), async loadOlder() { pages.current++; await reload.current(); } };
}
