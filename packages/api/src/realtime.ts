import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "@qr-chat/types";
import { userIdSchema } from "@qr-chat/validation";

let channelSequence = 0;

export type ConnectionState = "connecting" | "connected" | "reconnecting";
export type ChangeFilter =
  | { table: "group_messages" | "group_memberships"; column: "group_id"; id: string }
  | { table: "group_memberships"; column: "user_id"; id: string }
  | { table: "friend_connections"; column: "user_a_id" | "user_b_id"; id: string }
  | { table: "direct_messages"; column: "friend_connection_id"; id: string };

/** Events invalidate queries; payloads are never treated as an authorized snapshot.
 * Periodic reconciliation also handles unfilterable DELETEs and expiry without events.
 */
export function watchChanges(
  client: SupabaseClient<Database>,
  filters: ChangeFilter[],
  refresh: () => void | Promise<void>,
  onState: (state: ConnectionState) => void,
  options: { pollMs?: number; retryMs?: number } = {},
) {
  filters.forEach((filter) => userIdSchema.parse(filter.id));
  let stopped = false;
  let channel: RealtimeChannel | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let subscribed = false;
  let running = false;
  let dirty = false;
  async function reconcile() {
    if (stopped) return;
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
      if (!stopped) onState("reconnecting");
    } finally {
      running = false;
    }
  }
  function connect() {
    if (stopped) return;
    onState(attempt ? "reconnecting" : "connecting");
    const current = client.channel(`chat:${++channelSequence}`);
    channel = current;
    const reconnect = () => {
      if (stopped || channel !== current) return;
      subscribed = false;
      onState("reconnecting");
      channel = undefined;
      void client.removeChannel(current);
      retry = setTimeout(connect, Math.min((options.retryMs ?? 1000) * 2 ** attempt++, 30000));
    };
    for (const filter of filters) {
      current.on("postgres_changes", {
        event: "*", schema: "public", table: filter.table,
        filter: `${filter.column}=eq.${filter.id}`,
      }, () => { void reconcile(); });
    }
    // The channel join acknowledgement can precede PostgreSQL replication readiness.
    // Refetch again after the system acknowledgement to close that startup gap.
    current.on("system", {}, (payload) => {
      if (stopped || channel !== current || payload.extension !== "postgres_changes") return;
      if (payload.status === "ok") {
        attempt = 0;
        subscribed = true;
        void reconcile();
      } else {
        reconnect();
      }
    });
    current.subscribe((status) => {
      if (stopped || channel !== current) return;
      if (status === "SUBSCRIBED") {
        void reconcile();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reconnect();
      }
    });
  }
  const interval = setInterval(() => { void reconcile(); }, options.pollMs ?? 30000);
  connect();
  return {
    refresh: reconcile,
    stop() {
      stopped = true;
      clearInterval(interval);
      clearTimeout(retry);
      if (channel) void client.removeChannel(channel);
    },
  };
}
