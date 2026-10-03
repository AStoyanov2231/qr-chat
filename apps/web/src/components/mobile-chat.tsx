"use client";

import { messageDayLabel } from "@qr-chat/domain";
import type { ChatApi, ChatNameResolution } from "@qr-chat/api";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import QrScanner from "qr-scanner";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
} from "react";
import { CornersOut, QrCode } from "@phosphor-icons/react";
import { useScreenTransition } from "@/hooks/use-screen-transition";
import { useScannerDialog } from "@/hooks/use-scanner-dialog";
import { cameraErrorMessage } from "@/lib/camera-error";
import { observeChatViewport } from "@/lib/chat-viewport";
import { ConversationHeader } from "@/components/conversation-header";
import { GroupSidebar } from "@/components/group-sidebar";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { ProfileView } from "@/components/profile-view";
import { ChatsOverview } from "@/components/chats-overview";
import { DirectMessageBubble, DirectMessageComposer, FirstDirectMessageEmpty } from "@/components/direct-message-parts";
import { Avatar } from "@/components/avatar";
import { MemberProfile } from "@/components/member-profile";
import { Icon } from "@/components/icon";
import { directConversationScopeIsCurrent, resolveCode, type DirectConversationScope, type Venue } from "@/lib/chat-view";
import { useChatBackend, useDirectMessages, errorMessage } from "@/hooks/use-chat-backend";

function subscribeNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

function MessageDay({ time, previousTime }: { time: number; previousTime?: number }) {
  const label = messageDayLabel(time, previousTime);
  return label ? <div className="chat-date-divider">{label}</div> : null;
}

function MessageSkeleton() {
  return (
    <div className="message-skeleton" role="status" aria-label="Loading messages">
      <span className="skeleton-block" />
      <span className="skeleton-block" />
      <span className="skeleton-block" />
    </div>
  );
}

type PreviewCommands = "saveProfile" | "saveProfileWithAvatar" | "sendGroupMessage" | "sendDirectMessage" | "leaveGroup" | "requestFriend" | "acceptFriend" | "removeFriend" | "signOut";
export type ChatViewApi = Pick<ChatApi, "joinNamedGroup" | "nameCurrentQrChatIfEmpty" | "resolveQrChatName" | "resolveQrChatImage"> & {
  [K in PreviewCommands]: (...args: Parameters<ChatApi[K]>) => Promise<unknown>;
};
export type ChatViewBackend = Omit<ReturnType<typeof useChatBackend>, "api"> & { api: ChatViewApi };
type ChatViewProps = {
  view?: "chats" | "profile";
  backend: ChatViewBackend;
  direct: ReturnType<typeof useDirectMessages>;
  directId: string | null;
  setDirectId: (id: string | null) => void;
};

export default function QrChatApp() {
  const view = usePathname() === "/profile" ? "profile" : "chats";
  const backend = useChatBackend();
  const [directId, setDirectId] = useState<string | null>(null);
  const friend = backend.friends.find((friend) => friend.id === directId && friend.accepted_at);
  const direct = useDirectMessages(backend.api, friend?.id ?? null);
  return <ChatView view={view} backend={backend} direct={direct} directId={directId} setDirectId={setDirectId} />;
}

export function ChatView({ view = "chats", backend, direct, directId, setDirectId }: ChatViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = pathname === "/design-preview";
  const chatsUrl = preview ? "/design-preview" : "/";
  const profileUrl = preview ? "/design-preview?view=profile" : "/profile";
  const online = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  const { session, api, ready } = backend;
  const groups = backend.group ? [backend.group] : [];
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const directFriend = backend.friends.find((friend) => friend.id === directId && friend.accepted_at);
  const peer = directFriend?.user_a_id === session?.id ? directFriend?.user_b : directFriend?.user_a;
  const [sidebar, setSidebar] = useState(false);
  const [groupPhoto, setGroupPhoto] = useState<{ code: string; url: string | null } | null>(null);
  const [active, setActive] = useState<Venue | null>(null);
  const [pending, setPending] = useState<Venue | null>(null);
  const [chatNameDraftState, setChatNameDraftState] = useState<{ code: string; value: string } | null>(null);
  const [nameLookup, setNameLookup] = useState<{ code: string; result: ChatNameResolution | null } | null>(null);
  const [entry, setEntry] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [directSendError, setDirectSendError] = useState("");
  const [groupSendError, setGroupSendError] = useState("");
  const [sendingDirect, setSendingDirect] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personError, setPersonError] = useState("");
  const personFriend = backend.friends.find((friend) => friend.user_a_id === personId || friend.user_b_id === personId);
  const personPeer = personFriend?.user_a_id === session?.id ? personFriend?.user_b : personFriend?.user_a;
  const personMember = backend.group?.members.find((member) => member.id === personId);
  const person = personMember ?? (personPeer ? { id: personPeer.id, name: personPeer.display_name ?? 'Participant', avatarUrl: personPeer.avatar_url } : null);

  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "active" | "error"
  >("idle");
  const [cameraError, setCameraError] = useState("");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const scannerTrigger = useRef<HTMLElement | null>(null);
  const entryRequested = useRef(false);
  const afterEntry = useRef<(() => void) | null>(null);
  const stopCamera = useRef<(() => void) | null>(null);
  const dialog = useScannerDialog(entry, !!pending, scannerTrigger, () => {
    setPending(null);
    const action = afterEntry.current;
    afterEntry.current = null;
    action?.();
  });
  const screen = view === "profile" ? "profile" : directId ? `direct:${directId}` : active ? `group:${active.codes[0]}` : "overview";
  const motion = useScreenTransition(screen);
  const app = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const directBottom = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scanLocked = useRef(false);
  const historyPosition = useRef(0);
  const initialCodeHandled = useRef(false);
  const directScope = useRef<DirectConversationScope>({ connectionId: null, version: 0 });

  function switchDirectConversation(connectionId: string | null) {
    directScope.current = { connectionId, version: directScope.current.version + 1 };
    setDirectId(connectionId);
    setDirectSendError("");
    setGroupSendError("");
    setSendingDirect(false);
  }

  // The current-membership query is authoritative, even if the member list is capped.
  const group = groups.find((item) => item.id === active?.id);
  const groupCode = group?.venue.codes[0];
  const openGroup = backend.openGroup;
  useEffect(() => {
    const element = app.current;
    if (element) return observeChatViewport(element);
  }, []);
  useEffect(() => active && view !== "profile" && !directId ? openGroup(active.id) : undefined, [active, view, directId, openGroup]);
  useEffect(() => {
    if (!api || !groupCode) return;
    const controller = new AbortController();
    void api.resolveQrChatImage(groupCode, controller.signal).then((url) => {
      if (!controller.signal.aborted) setGroupPhoto({ code: groupCode, url });
    });
    return () => controller.abort();
  }, [api, groupCode]);

  const hiddenUsers = useMemo(
    () => new Set(session?.hidden ?? []),
    [session?.hidden],
  );

  const visibleGroupMessages = group?.messages.filter((message) => !hiddenUsers.has(message.user)) ?? [];
  const latestGroupMessageId = group?.messages.at(-1)?.id;
  const latestDirectMessageId = direct.messages.at(-1)?.id;
  const pendingCode = pending?.codes[0] ?? null;
  const chatNameDraft = chatNameDraftState?.code === pendingCode ? chatNameDraftState.value : "";
  const pendingNameResult = nameLookup?.code === pendingCode ? nameLookup.result : null;
  const findingChatName = pendingCode !== null && pendingNameResult === null;
  const suggestedChatName = pendingNameResult?.kind === "saved" || pendingNameResult?.kind === "suggested"
    ? pendingNameResult.name
    : null;
  const chosenChatName = pendingNameResult?.kind === "missing" ? chatNameDraft.trim() : suggestedChatName;

  useEffect(() => {
    if (!pendingCode) return;
    const controller = new AbortController();
    void api.resolveQrChatName(pendingCode, controller.signal).then((result) => {
      if (!controller.signal.aborted) setNameLookup({ code: pendingCode, result });
    }, () => { if (!controller.signal.aborted) setNameLookup({ code: pendingCode, result: { kind: "missing" } }); });
    return () => controller.abort();
  }, [api, pendingCode]);

  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await action(); return true; }
    catch (reason) { setNotice(errorMessage(reason)); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }

  function openCode(value: string) {
    let accepted = false;
    try {
      const venue = resolveCode(value, window.location.origin);
      setPending(null);
      setError("");

      accepted = true;

      const current = backend.group;
      if (current?.venue.codes[0] === venue.codes[0]) {
        if (current.venue.nameMissing) {
          setPending(current.venue);
          setName(session?.name ?? "");
          setChatNameDraftState({ code: venue.codes[0], value: "" });
        } else {
          dismissEntry(() => openConversation(current.venue));
        }
      } else {
        setPending(venue);
        setName(session?.name ?? "");
        setChatNameDraftState({ code: venue.codes[0], value: "" });
      }
    } catch {
      setNotice("Could not complete this action. Please try again.");
    }
    return accepted;
  }

  const openInitialCode = useEffectEvent((value: string) => {
    // External links can open an authorized current group. New joins require the camera.
    const current = backend.group;
    if (current?.venue.codes[0] === value) {
      motion.initialScreen(`group:${current.venue.codes[0]}`);
      setActive(current.venue);
      switchDirectConversation(null);
    }
    else startEntry();
  });
  const openScannedCode = useEffectEvent((value: string) => openCode(value));

  const restoreHistory = useEffectEvent(() => {
    if (!initialCodeHandled.current || view === "profile" || dialog.current?.open) return;
    const code = new URLSearchParams(window.location.search).get("code");
    const connectionId = window.history.state?.qrChatDirect ?? null;
    const venue = code && backend.group?.venue.codes.includes(code) ? backend.group.venue : null;
    if (active?.codes[0] === venue?.codes[0] && directId === connectionId) return;
    setSidebar(false);
    setPersonId(null);
    switchDirectConversation(connectionId);
    setActive(venue);
    setDraft("");
  });
  const historyChanged = useEffectEvent(() => {
    const nextPosition = window.history.state?.qrChatPosition ?? 0;
    motion.prepare(nextPosition > historyPosition.current ? 1 : -1);
    historyPosition.current = nextPosition;
    dismissEntry(() => restoreHistory());
  });
  useEffect(() => {
    const pop = () => historyChanged();
    window.addEventListener("popstate", pop, true);
    return () => window.removeEventListener("popstate", pop, true);
  }, []);
  useLayoutEffect(() => {
    const position = window.history.state?.qrChatPosition;
    if (position === undefined) {
      window.history.replaceState({ ...window.history.state, qrChatPosition: historyPosition.current }, "");
    } else historyPosition.current = position;
  }, [view]);
  useEffect(() => {
    const timer = window.setTimeout(() => restoreHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, view]);

  useEffect(() => {
    if (!ready || view === "profile" || initialCodeHandled.current) return;
    const init = window.setTimeout(() => {
      initialCodeHandled.current = true;
      const params = new URLSearchParams(window.location.search);
      const query = params.get("code");
      if (query !== null) openInitialCode(query);
    }, 0);
    return () => window.clearTimeout(init);
  }, [ready, view]);

  useEffect(() => {
    if (!entry || view !== "chats" || pending || !video.current) return;

    let disposed = false;
    const scanner = new QrScanner(
      video.current,
      (result) => {
        if (disposed || !entryRequested.current || scanLocked.current) return;
        scanLocked.current = true;
        const accepted = openScannedCode(result.data);
        if (!accepted) {
          window.setTimeout(() => {
            if (!disposed && entryRequested.current) scanLocked.current = false;
          }, 1200);
        }
      },
      {
        preferredCamera: "environment",
        maxScansPerSecond: 12,
        highlightScanRegion: false,
        highlightCodeOutline: false,
        returnDetailedScanResult: true,
      },
    );

    setCameraState("starting");
    setCameraError("");
    scanLocked.current = false;
    scanner
      .start()
      .then(() => {
        if (!disposed) setCameraState("active");
      })
      .catch(async (reason: unknown) => {
        if (disposed) return;
        const message = await cameraErrorMessage(reason, navigator.permissions);
        if (disposed) return;
        setCameraState("error");
        setCameraError(message);
      });

    const stop = () => {
      disposed = true;
      void scanner.pause(true);
      scanner.destroy();
    };
    stopCamera.current = stop;
    return () => {
      stop();
      if (stopCamera.current === stop) stopCamera.current = null;
      setCameraState("idle");
    };
  }, [entry, pending, cameraAttempt, view]);

  useEffect(() => {
    const element = app.current;
    if (!element || view !== "chats") return;
    let touchY = 0;
    const stopPageScroll = (event: Event, delta: number) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("dialog")) return;
      const stream = target?.closest<HTMLElement>(".message-stream, .chat-list-scroll");
      if (!stream || ((active || directId) && ((delta < 0 && stream.scrollTop <= 0) || (delta > 0 && stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 1)))) {
        if (event.cancelable) event.preventDefault();
      }
    };
    const startTouch = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const moveTouch = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const nextY = event.touches[0].clientY;
      stopPageScroll(event, touchY - nextY);
      touchY = nextY;
    };
    const wheel = (event: WheelEvent) => stopPageScroll(event, event.deltaY);
    element.addEventListener("touchstart", startTouch, { passive: true });
    element.addEventListener("touchmove", moveTouch, { passive: false });
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("touchstart", startTouch);
      element.removeEventListener("touchmove", moveTouch);
      element.removeEventListener("wheel", wheel);
    };
  }, [active, directId, view]);

  useEffect(() => {
    const stream = bottom.current?.parentElement;
    stream?.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [latestGroupMessageId, active]);

  useEffect(() => {
    const stream = directBottom.current?.parentElement;
    stream?.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [latestDirectMessageId, directId]);

  useEffect(() => {
    const stream = (directId ? directBottom : bottom).current?.parentElement;
    if (!stream) return;
    let atBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32;
    const trackScroll = () => { atBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32; };
    const observer = new ResizeObserver(() => {
      if (atBottom) stream.scrollTop = stream.scrollHeight;
    });
    observer.observe(stream);
    stream.addEventListener("scroll", trackScroll, { passive: true });
    return () => { observer.disconnect(); stream.removeEventListener("scroll", trackScroll); };
  }, [active, directId, ready, view, backend.error]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function dismissEntry(action?: () => void) {
    entryRequested.current = false;
    stopCamera.current?.();
    if (!dialog.current?.open) { action?.(); return; }
    afterEntry.current = action ?? null;
    setEntry(false);
  }

  function startEntry(event?: MouseEvent<HTMLButtonElement>) {
    scannerTrigger.current = event?.currentTarget ?? null;
    afterEntry.current = null;
    entryRequested.current = true;
    setCameraAttempt((attempt) => attempt + 1);
    setError("");
    setPending(null);
    setCameraError("");
    scanLocked.current = false;
    setEntry(true);
  }

  function openPerson(id: string) {
    if (id === session?.id) { openOwnProfile(); return; }
    setPersonError(""); setPersonId(id);
  }

  async function changeFriend(action: () => Promise<unknown>) {
    setPersonError("");
    await perform(async () => {
      try { await action(); await backend.refresh(); }
      catch (reason) { setPersonError(errorMessage(reason)); throw reason; }
    });
  }

  function join(event: FormEvent) {
    event.preventDefault();
    if (!pending || !session || !name.trim() || !pendingNameResult || !chosenChatName) return;
    void perform(async () => {
      setError("");
      try {
        await api.saveProfile({ display_name: name });
        const current = backend.group?.venue.codes[0] === pending.codes[0] ? backend.group : null;
        let destination: Venue;
        if (current) {
          const canonicalName = await api.nameCurrentQrChatIfEmpty(pending.codes[0], chosenChatName);
          destination = { ...current.venue, name: canonicalName, nameMissing: false };
        } else {
          const membership = await api.joinNamedGroup(pending.codes[0], chosenChatName);
          destination = { ...pending, id: membership.group_id, name: membership.display_name, nameMissing: false };
        }
        await backend.refresh();
        dismissEntry(() => openConversation(destination));
      } catch (reason) { setError(errorMessage(reason)); throw reason; }
    });
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!active || !session || !draft.trim()) return;
    const expectedScope = directScope.current;
    const isCurrent = () => directConversationScopeIsCurrent(directScope.current, expectedScope);
    void perform(async () => {
      setGroupSendError("");
      try { await api.sendGroupMessage(active.id, draft); }
      catch (reason) {
        if (isCurrent()) setGroupSendError("Could not send your message. Your draft is still here; try again.");
        throw reason;
      }
      if (!isCurrent()) return;
      setDraft("");
      try { await backend.refreshGroup(); }
      catch {
        if (isCurrent()) setGroupSendError("Your message was sent, but the chat could not refresh. Retry loading messages to confirm it appears.");
      }
    });
  }

  async function submitDirectMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!directId || !directFriend || !draft.trim() || sendingDirect) return;
    const expectedScope = directScope.current;
    if (expectedScope.connectionId !== directId) return;
    const connectionId = expectedScope.connectionId;
    const body = draft;
    const isCurrent = () => directConversationScopeIsCurrent(directScope.current, expectedScope);
    if (busyRef.current) return;
    setDirectSendError("");
    setSendingDirect(true);
    busyRef.current = true;
    setBusy(true);
    try {
      await api.sendDirectMessage(connectionId, body);
      if (isCurrent()) {
        setDraft("");
        try {
          await direct.refresh();
        } catch {
          if (isCurrent()) setDirectSendError("Your message was sent, but the chat could not refresh. Retry loading messages to confirm it appears.");
        }
      }
    } catch (reason) {
      if (isCurrent()) {
        setDirectSendError("Could not send your message. Your draft is still here; try again.");
        setNotice(errorMessage(reason));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (isCurrent()) setSendingDirect(false);
    }
  }

  function navigateChat(code: string | null, connectionId: string | null) {
    const url = code ? `${chatsUrl}?code=${encodeURIComponent(code)}` : chatsUrl;
    if (`${window.location.pathname}${window.location.search}` === url && (window.history.state?.qrChatDirect ?? null) === connectionId) return;
    window.history.pushState({ qrChatDirect: connectionId, qrChatPosition: ++historyPosition.current }, "", url);
  }

  function openOwnProfile() {
    if (view === "profile") return;
    motion.prepare(1);
    setSidebar(false);
    ++historyPosition.current;
    router.push(profileUrl);
  }

  function backToChats() {
    motion.prepare(-1);
    setSidebar(false);
    setActive(null);
    switchDirectConversation(null);
    if (directId) setDraft("");
    if (view === "profile") { ++historyPosition.current; router.push(chatsUrl); }
    else navigateChat(null, null);
  }

  function openConversation(venue: Venue) {
    if (view === "chats" && active?.codes[0] === venue.codes[0] && !directId) return;
    motion.prepare(1);
    setSidebar(false);
    setActive(venue);
    switchDirectConversation(null);
    setDraft("");
    setDirectSendError("");
    navigateChat(venue.codes[0], null);
  }

  function openDirectMessage(friendId: string) {
    if (view === "chats" && directId === friendId) return;
    motion.prepare(1);
    setSidebar(false);
    setActive(null);
    switchDirectConversation(friendId);
    setDraft("");
    setDirectSendError("");
    navigateChat(null, friendId);
  }

  function leaveCurrentChat() {
    setSidebar(false);
    void perform(async () => {
      await api.leaveGroup();
      await backend.refresh();
      backToChats();
    });
  }

  return (
    <div ref={app} className="qr-app">
      {(!online || backend.connection === "reconnecting") && <div className="connection-status" role="status">{online ? "Reconnecting… Your chats will refresh when connected." : "You’re offline. Reconnect to load chats and send messages."}</div>}
      <main ref={motion.surface} data-screen={screen} className={`app-content ${view === "chats" ? active || directId ? "has-chat" : "has-overview" : ""}`}>
        {view === "profile" ? <>
          {backend.error && <div className="connection-banner" role="alert">{backend.error} <button onClick={() => void perform(backend.refresh)}>Retry</button></div>}
          <ProfileView session={session} group={backend.group} ready={ready} busy={busy} onBack={backToChats} onSave={(display_name, photo) => perform(async () => { await api.saveProfileWithAvatar(display_name, photo); await backend.refresh(); setNotice("Profile saved."); })} onLeave={leaveCurrentChat} onSignOut={() => void perform(async () => { await api.signOut(); router.replace("/sign-in"); router.refresh(); })} />
        </> : !ready && !backend.error ? <ChatsOverview loading profileName={session?.name} profileAvatarUrl={session?.avatarUrl} connected={backend.connection === "connected"} onOpenOwnProfile={openOwnProfile} /> : !active && !directId && (
          <ChatsOverview
            profileName={session?.name}
            profileAvatarUrl={session?.avatarUrl}
            connected={backend.connection === "connected"}
            onOpenOwnProfile={openOwnProfile}
            group={backend.group}
            friends={backend.friends}
            directPreviews={backend.directPreviews}
            expiresAt={backend.expiresAt}
            hasObservedGroup={backend.hasObservedGroup}
            sessionId={session?.id ?? null}
            busy={busy}
            error={backend.error}
            onRetry={() => { void perform(backend.refresh); }}
            onScan={startEntry}
            onOpenGroup={() => { if (backend.group) openConversation(backend.group.venue); }}
            onOpenDirect={openDirectMessage}
            onOpenProfile={openPerson}
            onAcceptRequest={async (friendId) => { await api.acceptFriend(friendId); await backend.refresh(); }}
            onRemoveRequest={async (friendId) => { await api.removeFriend(friendId); await backend.refresh(); }}
          />
        )}

        {view === "chats" && backend.error && (active || directId) && (
          <section className="conversation-view">
            <ConversationHeader title={active?.name ?? peer?.display_name ?? "Direct message"} subtitle="Access could not be checked" onBack={backToChats} settingsLabel="Conversation settings" disabled onSettings={() => {}} />
            <div className="chat-conversation-surface conversation-load-error" role="alert">
              <h2>Couldn’t load this chat.</h2>
              <p>We couldn’t verify your access. Try again to reload the conversation.</p>
              <button type="button" className="scan-primary" disabled={busy} onClick={() => void perform(backend.refresh)}>Retry</button>
            </div>
          </section>
        )}

        {view === "chats" && active && ready && !backend.error && (
          <section className="conversation-view">
            <ConversationHeader title={active.name} subtitle={`${group?.members.length ?? 0} ${group?.members.length === 1 ? "member" : "members"}`} imageUrl={group && groupPhoto?.code === groupCode ? groupPhoto?.url : null} onBack={backToChats} settingsLabel="Group settings" disabled={!group} onSettings={() => setSidebar(true)} />
            <div className="chat-conversation-surface">
              <div className="message-stream" aria-live="polite">
                {group?.nextCursor !== null && group?.nextCursor !== undefined && <button className="text-button" disabled={busy} onClick={() => void perform(backend.loadOlder)}>Load older messages</button>}
                {backend.groupLoading && <MessageSkeleton />}
                {!backend.groupLoading && !group?.messages.length && (
                  <p className="first-message">{group ? "Be the first to say hello." : "Your membership has ended."}</p>
                )}
                {visibleGroupMessages.map((message, index) => {
                  const profileAvailable = message.user === session?.id || group?.members.some((member) => member.id === message.user) || backend.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user);
                  return (
                    <Fragment key={message.id}>
                      <MessageDay time={message.time} previousTime={visibleGroupMessages[index - 1]?.time} />
                      <article className={message.user === session?.id ? "own" : ""}>
                        {message.user !== session?.id && <button className="message-profile" aria-label={`View ${message.name}'s profile`} disabled={!profileAvailable} onClick={() => openPerson(message.user)}><Avatar name={message.name} url={message.avatarUrl} size={44} /></button>}
                        <div>
                          <p>{message.text}</p>
                        </div>
                      </article>
                    </Fragment>
                  ); })}
                <div ref={bottom} />
              </div>

              {group ? (
                <form className="message-composer" onSubmit={submitMessage} aria-busy={busy}>
                  <div className="message-composer-pill">
                    <label className="sr-only" htmlFor="message">Message</label>
                    <input
                      id="message"
                      value={draft}
                      disabled={busy}
                      maxLength={4000}
                      onChange={(event) => { setDraft(event.target.value); setGroupSendError(""); }}
                      placeholder={`Message ${active.name}…`}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="send"
                      aria-label={busy ? "Sending message" : "Send message"}
                      disabled={busy || !ready || !draft.trim()}
                    >
                      {busy ? <span className="send-spinner" aria-hidden="true" /> : <Icon name="send" size={19} />}
                    </button>
                  </div>
                  {groupSendError && <p className="composer-error" role="alert">{groupSendError}</p>}
                </form>
              ) : (
                <button
                  type="button"
                  className="scan-primary rejoin"
                  disabled={!ready || busy}
                  onClick={startEntry}
                >
                  Scan to rejoin
                </button>
              )}
            </div>
            {sidebar && group && <GroupSidebar key={group.id} group={group} userId={session?.id} busy={busy} onClose={() => setSidebar(false)} onProfile={openPerson} onLeave={leaveCurrentChat} />}
          </section>
        )}

        {view === "chats" && directId && ready && !backend.error && (
          <section className="conversation-view">
            <ConversationHeader title={peer?.display_name ?? "Direct message"} subtitle={direct.connection === "connected" ? "Friend" : "Reconnecting…"} imageUrl={peer?.avatar_url} onBack={backToChats} settingsLabel="Conversation settings" disabled={!peer?.id} onSettings={() => setSidebar(true)} />
            <div className="chat-conversation-surface">
              {!directFriend ? <p className="first-message">This friendship is no longer available.</p> : <>
                <div className="message-stream" aria-live="polite">
                  {direct.error && <div className="connection-banner dm-load-error" role="alert">Couldn’t load messages. Your draft stays here. <button onClick={() => void perform(direct.refresh)}>Retry</button></div>}
                  {direct.loading && <MessageSkeleton />}
                  {!direct.loading && !direct.error && direct.messages.length === 0 && <FirstDirectMessageEmpty friendName={peer?.display_name ?? "your friend"} />}
                  {direct.nextCursor !== null && <button className="text-button" disabled={busy} onClick={() => void perform(direct.loadOlder)}>Load older messages</button>}
                  {direct.messages.map((message, index) => <Fragment key={message.id}>
                    <MessageDay time={Date.parse(message.created_at)} previousTime={direct.messages[index - 1] ? Date.parse(direct.messages[index - 1].created_at) : undefined} />
                    <DirectMessageBubble message={message} session={session} peer={peer ?? null} onOpenProfile={openPerson} />
                  </Fragment>)}
                  <div ref={directBottom} />
                </div>
                <DirectMessageComposer
                  draft={draft}
                  friendName={peer?.display_name ?? "your friend"}
                  busy={busy}
                  sending={sendingDirect}
                  ready={ready}
                  loading={direct.loading}
                  loadError={direct.error}
                  sendError={directSendError}
                  onChange={(value) => { setDraft(value); setDirectSendError(""); }}
                  onSubmit={submitDirectMessage}
                />
              </>}
            </div>
            {sidebar && peer && <SettingsSidebar key={directId} label="Conversation settings" onClose={() => setSidebar(false)}>{() => <div className="group-sidebar-identity">
              <Avatar name={peer.display_name ?? "Participant"} url={peer.avatar_url} size={130} />
              <h2>{peer.display_name ?? "Participant"}</h2>
              <p>Friend</p>
            </div>}</SettingsSidebar>}
          </section>
        )}

      {view === "chats" && !active && !directId && <div className="scan-overlay">
        <button type="button" className="floating-scan" aria-label="Scan a QR code" disabled={!ready || !!backend.error} onClick={startEntry}>
          <span className="scan-symbol" aria-hidden="true"><CornersOut size={34} weight="bold" /><QrCode size={21} weight="bold" /></span>
        </button>
      </div>}

      </main>

      {personId && session && <MemberProfile key={personId} person={person} friend={personFriend} userId={session.id} canRequest={!!personMember} busy={busy} error={personError || backend.error} onClose={() => setPersonId(null)}
        onRequest={() => { if (personMember) void changeFriend(() => api.requestFriend(personMember.id)); }}
        onAccept={() => { if (personFriend) void changeFriend(() => api.acceptFriend(personFriend.id)); }}
        onRemove={() => { if (personFriend) void changeFriend(() => api.removeFriend(personFriend.id)); }}
        onMessage={() => { if (!personFriend?.accepted_at) return; setPersonId(null); openDirectMessage(personFriend.id); }} />}

      <dialog
        className={pending ? "join-dialog" : "camera-dialog"}
        ref={dialog}
        aria-label="Join a conversation"
        onCancel={(event) => { event.preventDefault(); if (!busy) dismissEntry(); }}
        onClick={(event) => {
          if (event.target === dialog.current && !busy) dismissEntry();
        }}
      >
        <div className={pending ? "entry-panel" : "camera-panel"}>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            disabled={busy}
            onClick={() => dismissEntry()}
          >
            <Icon name="close" size={20} />
          </button>
          {pending ? (
            <>
              <span className="entry-icon">
                <Icon name="chat" size={28} />
              </span>
              <h2>Join the room</h2>
              {findingChatName
                ? <p role="status">Finding the chat name…</p>
                : suggestedChatName
                  ? <p>{suggestedChatName}</p>
                  : <p>Unnamed chat</p>}
              {backend.group && backend.group.venue.codes[0] !== pending.codes[0] && <p>Joining this room leaves your current group.</p>}
              <form onSubmit={join}>
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  disabled={busy}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Capybara"
                  maxLength={50}
                  required
                  autoFocus
                />
                {pendingNameResult?.kind === "missing" && <>
                  <label htmlFor="chat-name">Chat name</label>
                  <input
                    id="chat-name"
                    disabled={busy}
                    value={chatNameDraft}
                    onChange={(event) => setChatNameDraftState({ code: pending.codes[0], value: event.target.value })}
                    placeholder="Cafe name"
                    maxLength={100}
                    required
                  />
                  <p>We couldn’t identify this place. Give this chat a name for everyone.</p>
                </>}
                <button type="submit" className="scan-primary" disabled={busy || !ready || findingChatName || !chosenChatName || !name.trim()}>
                  {busy ? "Joining…" : "Join chat"} <Icon name="arrow" size={18} />
                </button>
                {error && <p className="form-error" role="alert">{error}</p>}
              </form>
              <button type="button" className="text-button" disabled={busy} onClick={() => { setPending(null); setError(""); }}>
                Scan another code
              </button>
            </>
          ) : (
            <>
              <span className="browser-edge-tint browser-edge-top" aria-hidden="true" />
              <span className="browser-edge-tint browser-edge-bottom" aria-hidden="true" />
              <div className="camera-frame">
                <video key={cameraAttempt} ref={video} muted playsInline aria-label="Camera preview" />
                <span className="camera-shade camera-shade-top" />
                <span className="camera-shade camera-shade-right" />
                <span className="camera-shade camera-shade-bottom" />
                <span className="camera-shade camera-shade-left" />
                <span className="camera-target"><i /></span>
                {cameraState === "starting" && (
                  <span className="camera-loading">Starting camera…</span>
                )}
              </div>
              <div className="camera-copy">
                <h2>Find the code.</h2>
                <p>
                  {cameraState === "error"
                    ? cameraError
                    : error || "Hold the QR inside the frame."}
                </p>
                {(cameraState === "error" || error) && (
                  <button
                    type="button"
                    className="camera-retry"
                    onClick={() => {
                      setError("");
                      setCameraAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Try camera again
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </dialog>

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
