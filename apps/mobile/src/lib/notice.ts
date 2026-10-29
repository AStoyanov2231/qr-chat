import { useSyncExternalStore } from 'react';

let message = '';
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const set = (next: string) => { message = next; listeners.forEach((listener) => listener()); };
/** App-wide toast, shown for 4.5s like web's. */
export function notify(next: string) { clearTimeout(timer); set(next); timer = setTimeout(() => set(''), 4500); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const get = () => message;
export const useNotice = () => useSyncExternalStore(subscribe, get, get);
