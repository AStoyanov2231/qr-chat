"use client";
import { createContext, use, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { createChatApi, getChatStore } from "@qr-chat/api";
import { createClient } from "@/lib/supabase/client";
import { z } from "@qr-chat/validation";

type Api = ReturnType<typeof createChatApi>;
const Context = createContext<{ api: Api; store: ReturnType<typeof getChatStore> } | null>(null);
export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return "Check your input and try again.";
  return error instanceof Error ? error.message : "Could not connect. Please try again.";
}

/** Mounted in the protected layout so route navigation retains data and subscriptions. */
export function ChatSessionProvider({ children }: PropsWithChildren) {
  const [value] = useState(() => {
    const api = createChatApi(createClient(), { qrNameEndpoint: "/api/qr-name" });
    return { api, store: getChatStore(api) };
  });
  useEffect(() => {
    const activity = () => {
      if (document.hidden || !navigator.onLine) value.store.pause();
      else void value.store.start();
    };
    activity();
    window.addEventListener("online", activity);
    window.addEventListener("offline", activity);
    document.addEventListener("visibilitychange", activity);
    const { data } = value.api.client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.replace("/sign-in");
    });
    return () => {
      value.store.dispose(); data.subscription.unsubscribe();
      window.removeEventListener("online", activity); window.removeEventListener("offline", activity);
      document.removeEventListener("visibilitychange", activity);
    };
  }, [value]);
  return <Context value={value}>{children}</Context>;
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
