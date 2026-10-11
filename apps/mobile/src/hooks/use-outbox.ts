import { useState } from 'react';
import { randomUUID } from 'expo-crypto';

export type OutboxItem = { key: string; text: string; time: number; failed: boolean; sentId?: string };
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
    } catch { update(key, { failed: true }); }
  }
  return {
    send(text: string, send: Send) {
      const key = randomUUID();
      setItems((current) => [...current, { key, text, time: Date.now(), failed: false }]);
      void deliver(key, text, send);
    },
    retry(item: OutboxItem, send: Send) { void deliver(item.key, item.text, send); },
    /** Messages that are unsent, or sent but not yet in the loaded list. */
    visible(loadedIds: string[]) {
      const loaded = new Set(loadedIds);
      return items.filter((item) => !(item.sentId && loaded.has(item.sentId)));
    },
  };
}
