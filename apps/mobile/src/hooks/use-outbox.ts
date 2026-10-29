import { useState, useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import { createOutbox, visibleOutbox } from '@qr-chat/api';

export type { OutboxItem } from '@qr-chat/api';

/** The shared outbox for as long as the caller lives; native keeps it in ChatProvider so leaving a chat keeps failed messages. */
export function useOutbox() {
  const [outbox] = useState(() => createOutbox(randomUUID));
  const items = useSyncExternalStore(outbox.subscribe, outbox.items, outbox.items);
  return { send: outbox.send, retry: outbox.retry, visible: (conversation: string, loadedIds: (number | string)[]) => visibleOutbox(items, conversation, loadedIds) };
}
