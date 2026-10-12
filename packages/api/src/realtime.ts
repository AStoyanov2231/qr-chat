import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { userIdSchema } from "@qr-chat/validation";

/** "polling": realtime is refused or keeps dropping, so data refreshes on a short timer until it returns. */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "polling";
/** Private Broadcast topics (supabase/migrations/20261012130000_realtime_broadcast.sql):
 * group:<id> carries a QR group's traffic; user:<id> a user's memberships, friendships and direct messages. */
export type Topic = `group:${string}` | `user:${string}`;
export type ChangeEvent = { table: string; eventType: string; id: number | null; filterId?: string };
// Supabase Realtime quota refusals; polling starts on the first one instead of the second failure.
const REFUSED = /too_many_connections|too_many_joins|tenant_events/i;
/** Supabase allows 100 channels per connection; the client keeps one socket for all of them. */
export const MAX_TOPICS = 100;

export function topic(kind: "group" | "user", id: string): Topic {
  return `${kind}:${userIdSchema.parse(id)}`;
}

/** Events invalidate queries; payloads carry ids only and are never treated as an authorized snapshot.
 * Periodic reconciliation also handles server-side deletes and expiry without events.
 */
export function watchChanges(
  client: SupabaseClient<Database>,
  topics: Topic[],
  refresh: () => void | Promise<void>,
  onState: (state: ConnectionState) => void,
  options: {
    pollMs?: number; retryMs?: number; onChange?: (event: ChangeEvent) => void; random?: () => number; coordinated?: boolean;
    /** Polling fallback while realtime is unavailable; onPoll defaults to the reconnect refresh. */
    fallbackMs?: number; onPoll?: () => void | Promise<void>;
  } = {},
) {
  const random = options.random ?? Math.random;
  const parse = (list: Topic[]) => [...new Set(list)].slice(0, MAX_TOPICS)
    .map((name) => topic(name.startsWith("user:") ? "user" : "group", name.slice(name.indexOf(":") + 1)));
  let wanted: string[] = parse(topics);
  const channels = new Map<string, RealtimeChannel>();
  const ready = new Set<string>();
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let running = false;
  let dirty = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const subscribed = () => channels.size > 0 && ready.size === channels.size;
  // While polling, reconnect attempts keep reporting "polling" so hosts do not flap their banner.
  const report = (state: ConnectionState) => onState(fallback && state !== "connected" ? "polling" : state);
  function startPolling() {
    if (fallback || stopped || !options.fallbackMs) return;
    const next = () => {
      fallback = setTimeout(() => {
        if (stopped) return;
        void Promise.resolve((options.onPoll ?? reconcile)()).catch(() => {});
        next();
      }, options.fallbackMs! * (0.8 + random() * 0.4));
    };
    next();
    onState("polling");
  }
  function stopPolling() { clearTimeout(fallback); fallback = undefined; }
  async function reconcile() {
    if (stopped) return;
    if (options.coordinated) {
      try { await refresh(); if (!stopped && subscribed()) onState("connected"); }
      catch { if (!stopped) report("reconnecting"); }
      return;
    }
    dirty = true;
    if (running) return;
    running = true;
    try {
      while (dirty && !stopped) {
        dirty = false;
        await refresh();
        if (!stopped && subscribed()) onState("connected");
      }
    } catch {
      if (!stopped) report("reconnecting");
    } finally {
      running = false;
    }
  }
  function close(name: string) {
    const channel = channels.get(name);
    channels.delete(name);
    ready.delete(name);
    if (channel) void client.removeChannel(channel);
  }
  function reconnect(reason = "") {
    if (stopped) return;
    if (REFUSED.test(reason) || attempt > 0) startPolling();
    report("reconnecting");
    for (const name of [...channels.keys()]) close(name);
    clearTimeout(retry);
    retry = setTimeout(connect, Math.min((options.retryMs ?? 1000) * 2 ** attempt++, 30000) * (0.8 + random() * 0.2));
  }
  function open(name: string) {
    const channel = client.channel(name, { config: { private: true } });
    channels.set(name, channel);
    channel.on("broadcast", { event: "change" }, ({ payload }) => {
      if (stopped || channels.get(name) !== channel) return;
      const id = Number(payload?.id);
      const groupId = typeof payload?.group_id === "string" ? payload.group_id : undefined;
      if (options.onChange) options.onChange({ table: String(payload?.table ?? ""), eventType: String(payload?.type ?? "UNKNOWN"), filterId: groupId, id: Number.isSafeInteger(id) && id > 0 ? id : null });
      else void reconcile();
    });
    channel.subscribe((status, error) => {
      if (stopped || channels.get(name) !== channel) return;
      if (status === "SUBSCRIBED") {
        ready.add(name);
        // Refetch once every topic is live, closing the gap between the last read and the join.
        if (subscribed()) { attempt = 0; stopPolling(); void reconcile(); }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reconnect(error?.message);
      }
    });
  }
  function connect() {
    retry = undefined;
    if (stopped) return;
    // realtime-js hands back a still-closing channel for a reused topic, so wait until it is gone.
    const owned = new Set(channels.values());
    if (client.getChannels().some((channel) => !owned.has(channel) && wanted.includes(channel.topic.replace(/^realtime:/, "")))) {
      retry = setTimeout(connect, 250);
      return;
    }
    // Joining one more topic next to live ones is not a reconnect; keep the current state.
    if (!ready.size && wanted.some((name) => !channels.has(name))) report(attempt ? "reconnecting" : "connecting");
    for (const name of wanted) if (!channels.has(name)) open(name);
  }
  // Hosts own the safety scheduler; explicit polling remains for standalone callers.
  const interval = options.pollMs ? setInterval(() => { void reconcile(); }, options.pollMs) : undefined;
  connect();
  return {
    refresh: reconcile,
    /** Joins new topics and leaves dropped ones without touching the others. During a retry wait, the retry picks them up. */
    update(next: Topic[]) {
      if (stopped) return;
      wanted = parse(next);
      for (const name of [...channels.keys()]) if (!wanted.includes(name)) close(name);
      if (channels.size) { clearTimeout(retry); connect(); }
      if (subscribed()) onState(fallback ? "polling" : "connected");
    },
    stop() {
      stopped = true;
      clearInterval(interval);
      clearTimeout(retry);
      stopPolling();
      for (const name of [...channels.keys()]) close(name);
    },
  };
}
