import { useState } from "react";

export type OutboxItem = { key: string; conversation: string; text: string; failed: boolean; sentId?: string };
type Send = (text: string) => Promise<unknown>;

/** Messages appear the moment they are sent; a failed one stays, marked, until a retry goes through. */
export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const update = (key: string, change: Partial<OutboxItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  async function deliver(key: string, text: string, send: Send) {
    update(key, { failed: false });
    try {
      const sent = await send(text) as { id?: number | string } | null;
      // Without an id to match, rely on the refreshed list and drop the placeholder.
      if (sent?.id === undefined) setItems((current) => current.filter((item) => item.key !== key));
      else update(key, { sentId: String(sent.id) });
    }
    catch { update(key, { failed: true }); }
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
