import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { userIdSchema } from "@qr-chat/validation";

let channelSequence = 0;

/** "polling": realtime is refused or keeps dropping, so data refreshes on a short timer until it returns. */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "polling";
export type ChangeFilter = (
  | { table: "profiles"; column: "id"; id: string }
  | { table: "messages" | "group_members"; column: "group_id"; id: string }
  | { table: "group_members"; column: "user_id"; id: string }
  | { table: "friendships"; column: "user_a_id" | "user_b_id" | "group_id"; id: string }
) & { event?: "*" | "DELETE" };
export type ChangeEvent = { table: string; eventType: string; id: number | null; filterId?: string };
// Supabase Realtime quota refusals; polling starts on the first one instead of the second failure.
const REFUSED = /too_many_connections|too_many_joins|tenant_events/i;

/** Events invalidate queries; payloads are never treated as an authorized snapshot.
 * Periodic reconciliation also handles unfilterable DELETEs and expiry without events.
 */
export function watchChanges(
  client: SupabaseClient<Database>,
  filters: ChangeFilter[],
  refresh: () => void | Promise<void>,
  onState: (state: ConnectionState) => void,
  options: {
    pollMs?: number; retryMs?: number; onChange?: (event: ChangeEvent) => void; random?: () => number; coordinated?: boolean;
    /** Polling fallback while realtime is unavailable; onPoll defaults to the reconnect refresh. */
    fallbackMs?: number; onPoll?: () => void | Promise<void>;
  } = {},
) {
  filters.forEach((filter) => userIdSchema.parse(filter.id));
  let stopped = false;
  let channel: RealtimeChannel | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let subscribed = false;
  let running = false;
  let dirty = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const random = options.random ?? Math.random;
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
      try { await refresh(); if (!stopped && subscribed) onState("connected"); }
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
        if (!stopped && subscribed) onState("connected");
      }
    } catch {
      if (!stopped) report("reconnecting");
    } finally {
      running = false;
    }
  }
  function connect() {
    if (stopped) return;
    report(attempt ? "reconnecting" : "connecting");
    const current = client.channel(`chat:${++channelSequence}`);
    channel = current;
    const reconnect = (reason = "") => {
      if (stopped || channel !== current) return;
      subscribed = false;
      if (REFUSED.test(reason) || attempt > 0) startPolling();
      report("reconnecting");
      channel = undefined;
      void client.removeChannel(current);
      retry = setTimeout(connect, Math.min((options.retryMs ?? 1000) * 2 ** attempt++, 30000) * (0.8 + random() * 0.2));
    };
    for (const filter of filters) {
      current.on("postgres_changes", {
        event: filter.event ?? "*", schema: "public", table: filter.table,
        filter: `${filter.column}=eq.${filter.id}`,
      }, (payload) => {
        if (stopped || channel !== current) return;
        const id = payload?.new && "id" in payload.new ? Number(payload.new.id) : null;
        if (options.onChange) options.onChange({ table: filter.table, eventType: payload?.eventType ?? "UNKNOWN", filterId: filter.id, id: Number.isSafeInteger(id) && id! > 0 ? id : null });
        else void reconcile();
      });
    }
    // The channel join acknowledgement can precede PostgreSQL replication readiness.
    // Refetch again after the system acknowledgement to close that startup gap.
    current.on("system", {}, (payload) => {
      if (stopped || channel !== current || payload.extension !== "postgres_changes") return;
      if (payload.status === "ok") {
        attempt = 0;
        subscribed = true;
        stopPolling();
        void reconcile();
      } else {
        reconnect(String(payload.message ?? ""));
      }
    });
    current.subscribe((status, error) => {
      if (stopped || channel !== current) return;
      if (status === "SUBSCRIBED") {
        void reconcile();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reconnect(error?.message);
      }
    });
  }
  // Hosts own the safety scheduler; explicit polling remains for standalone callers.
  const interval = options.pollMs ? setInterval(() => { void reconcile(); }, options.pollMs) : undefined;
  connect();
  return {
    refresh: reconcile,
    stop() {
      stopped = true;
      clearInterval(interval);
      clearTimeout(retry);
      stopPolling();
      if (channel) void client.removeChannel(channel);
    },
  };
}
