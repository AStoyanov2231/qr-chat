"use client";
import { createContext, use, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { flushSync } from "react-dom";
import { createChatApi, getChatStore } from "@qr-chat/api";
import { signInPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

type Api = ReturnType<typeof createChatApi>;
const Context = createContext<{ api: Api; store: ReturnType<typeof getChatStore> } | null>(null);
export { errorMessage } from "@qr-chat/api";

/** Mounted in the protected layout so route navigation retains data and subscriptions. */
export function ChatSessionProvider({ children }: PropsWithChildren) {
  const [signedOut, setSignedOut] = useState(false);
  const [value] = useState(() => {
    const api = createChatApi(createClient(), { qrNameEndpoint: "/api/qr-name" });
    return { api, store: getChatStore(api) };
  });
  useEffect(() => {
    let checked = false;
    let stopped = false;
    const signIn = (explicitSignOut = false) => {
      flushSync(() => setSignedOut(true));
      // After an explicit sign-out the next account must not inherit this page as its return path.
      window.location.replace(explicitSignOut ? "/sign-in" : signInPath(window.location.pathname, window.location.search));
    };
    // The app shell is static, so the signed-out guard runs here from the stored session.
    // An error means the session could not be refreshed yet (e.g. offline): nothing starts, and the
    // next online/visibility event or auth event checks again. auth-js emits SIGNED_OUT if it is gone.
    const check = () => value.api.client.auth.getSession().then(({ data, error }) => {
      if (stopped || checked) return;
      if (data.session) { checked = true; activity(); }
      else if (!error) signIn();
    });
    const activity = () => {
      if (stopped) return;
      if (!checked) { void check(); return; }
      if (document.hidden || !navigator.onLine) value.store.pause();
      else void value.store.start();
    };
    activity();
    window.addEventListener("online", activity);
    window.addEventListener("offline", activity);
    document.addEventListener("visibilitychange", activity);
    const { data } = value.api.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") signIn(true);
      else if (session && !checked && !stopped) { checked = true; activity(); }
    });
    return () => {
      stopped = true;
      value.store.dispose(); data.subscription.unsubscribe();
      window.removeEventListener("online", activity); window.removeEventListener("offline", activity);
      document.removeEventListener("visibilitychange", activity);
    };
  }, [value]);
  return signedOut ? null : <Context value={value}>{children}</Context>;
}
function useSession() {
  const value = use(Context);
  if (!value) throw new Error("ChatSessionProvider is required.");
  return value;
}
export function useChatBackend() {
  const { api, store } = useSession();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { ...state.snapshot, api, ready: state.ready, error: state.error, connection: state.connection, hasObservedGroup: state.hasObservedGroup, groupLoading: state.groupLoading,
    refresh: store.refresh, refreshGroup: store.refreshGroup, openGroup: store.openGroup, loadOlder: store.loadOlderGroup };
}
export function useDirectMessages(_api: Api, connectionId: string | null) {
  const { store } = useSession();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => connectionId ? store.openDirect(connectionId) : undefined, [store, connectionId]);
  const direct = store.getDirect(connectionId);
  return { ...direct, error: state.error || direct.error, connection: state.connection,
    refresh: () => connectionId ? store.refreshDirect(connectionId) : Promise.resolve(),
    loadOlder: () => connectionId ? store.loadOlderDirect(connectionId) : Promise.resolve() };
}
