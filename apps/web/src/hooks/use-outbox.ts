import { useState } from "react";

export type OutboxItem = { key: string; conversation: string; text: string; failed: boolean; sentId?: string; notice?: string };
type Send = (text: string) => Promise<unknown>;
// A database rate limit explains itself; other failures keep the generic retry hint.
const rateLimitNotice = (error: unknown) => (error as { code?: string } | null)?.code === "RATE_LIMITED" ? (error as Error).message : undefined;

/** Messages appear the moment they are sent; a failed one stays, marked, until a retry goes through. */
export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const update = (key: string, change: Partial<OutboxItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  async function deliver(key: string, text: string, send: Send) {
    update(key, { failed: false, notice: undefined });
    try {
      const sent = await send(text) as { id?: number | string } | null;
      // Without an id to match, rely on the refreshed list and drop the placeholder.
      if (sent?.id === undefined) setItems((current) => current.filter((item) => item.key !== key));
      else update(key, { sentId: String(sent.id) });
    }
    catch (error) { update(key, { failed: true, notice: rateLimitNotice(error) }); }
  }
  return {
    send(conversation: string, text: string, send: Send) {
      const key = crypto.randomUUID();
      setItems((current) => [...current, { key, conversation, text, failed: false }]);
      void deliver(key, text, send);
    },
    retry(item: OutboxItem, send: Send) { void deliver(item.key, item.text, send); },
    /** This conversation's messages that are unsent, or sent but not yet in the loaded list. */
    visible(conversation: string, loadedIds: (number | string)[]) {
      const loaded = new Set(loadedIds.map(String));
      return items.filter((item) => item.conversation === conversation && !(item.sentId && loaded.has(item.sentId)));
    },
  };
}
