import { useState, useSyncExternalStore } from "react";
import { createOutbox, visibleOutbox } from "@qr-chat/api";

export type { OutboxItem } from "@qr-chat/api";

/** The shared outbox for as long as the caller lives; web keeps it in the persistent chat layout. */
export function useOutbox() {
  const [outbox] = useState(() => createOutbox(() => crypto.randomUUID()));
  const items = useSyncExternalStore(outbox.subscribe, outbox.items, outbox.items);
  return { send: outbox.send, retry: outbox.retry, visible: (conversation: string, loadedIds: (number | string)[]) => visibleOutbox(items, conversation, loadedIds) };
}
