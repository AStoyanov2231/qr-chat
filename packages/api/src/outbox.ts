export type OutboxItem = { key: string; conversation: string; text: string; time: number; failed: boolean; sentId?: string; notice?: string };
/** Sends text with clientId as its idempotency key; retries reuse it, so the server stores the message once. */
export type OutboxSend = (text: string, clientId: string) => Promise<unknown>;
// A database rate limit explains itself; other failures keep the generic retry hint.
const rateLimitNotice = (error: unknown) => (error as { code?: string } | null)?.code === "RATE_LIMITED" ? (error as Error).message : undefined;

/** Messages appear the moment they are sent; a failed one stays, marked, until a retry goes through.
 * Each item's key doubles as its client id. Framework-free so web and native share it; each app wraps it in a hook. */
export function createOutbox(newKey: () => string) {
  let items: OutboxItem[] = [];
  const listeners = new Set<() => void>();
  const set = (next: OutboxItem[]) => { items = next; for (const listener of listeners) listener(); };
  const update = (key: string, change: Partial<OutboxItem>) => set(items.map((item) => item.key === key ? { ...item, ...change } : item));
  async function deliver(key: string, text: string, send: OutboxSend) {
    update(key, { failed: false, notice: undefined });
    try {
      const sent = await send(text, key) as { id?: number | string } | null;
      // Without an id to match, rely on the refreshed list and drop the placeholder.
      if (sent?.id === undefined) set(items.filter((item) => item.key !== key));
      else update(key, { sentId: String(sent.id) });
    } catch (error) { update(key, { failed: true, notice: rateLimitNotice(error) }); }
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    items: () => items,
    send(conversation: string, text: string, send: OutboxSend) {
      const key = newKey();
      set([...items, { key, conversation, text, time: Date.now(), failed: false }]);
      void deliver(key, text, send);
    },
    retry(item: OutboxItem, send: OutboxSend) { void deliver(item.key, item.text, send); },
  };
}

/** A conversation's unsent messages, plus sent ones the loaded list does not cover yet. A sent row that is
 * loaded, or older than the oldest loaded row (a reload kept only a newer page), is never shown again. */
export function visibleOutbox(items: OutboxItem[], conversation: string, loadedIds: (number | string)[]) {
  const loaded = new Set(loadedIds.map(Number));
  const oldest = loaded.size ? Math.min(...loaded) : -Infinity;
  return items.filter((item) => item.conversation === conversation && !(item.sentId && (loaded.has(Number(item.sentId)) || Number(item.sentId) < oldest)));
}
