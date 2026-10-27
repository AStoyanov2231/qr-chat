"use client";

import { groupFallbackName, messageAge, messageDayLabel, scannedCode, venueLink } from "@qr-chat/domain";
import type { ChatApi } from "@qr-chat/api";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { appOrigin } from "@/lib/app-origin";
import { cameraErrorMessage } from "@/lib/camera-error";
import { observeChatViewport } from "@/lib/chat-viewport";
import { ConversationHeader } from "@/components/conversation-header";
import { GroupSidebar } from "@/components/group-sidebar";
import { ProfileView } from "@/components/profile-view";
import { ChatsOverview } from "@/components/chats-overview";
import { DirectMessageBubble, DirectMessageComposer, FirstDirectMessageEmpty, FriendRequestDecision, OutboxBubble } from "@/components/direct-message-parts";
import { Avatar } from "@/components/avatar";
import { ClearButton } from "@/components/clear-button";
import { MemberProfile } from "@/components/member-profile";
import { Icon } from "@/components/icon";
import { resolveCode, type Venue } from "@/lib/chat-view";
import { useChatBackend, useDirectMessages, errorMessage } from "@/hooks/use-chat-backend";
import { useOutbox } from "@/hooks/use-outbox";

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

type PreviewCommands = "saveProfile" | "saveProfileWithAvatar" | "sendGroupMessage" | "sendDirectMessage" | "leaveGroup" | "requestFriend" | "acceptFriend" | "removeFriend" | "blockFriend" | "signOut" | "deleteAccount" | "nameProductGroup";
export type ChatViewApi = Pick<ChatApi, "joinGroup" | "resolveGroup"> & {
  [K in PreviewCommands]: (...args: Parameters<ChatApi[K]>) => Promise<unknown>;
};
export type ChatViewBackend = Omit<ReturnType<typeof useChatBackend>, "api"> & { api: ChatViewApi };
type ChatViewProps = {
  view?: "chats" | "profile";
  backend: ChatViewBackend;
  direct: ReturnType<typeof useDirectMessages>;
  directId: string | null;
  setDirectId: (id: string | null) => void;
  business?: boolean;
};

export default function QrChatApp() {
  const view = usePathname() === "/profile" ? "profile" : "chats";
  const backend = useChatBackend();
  const [directId, setDirectId] = useState<string | null>(null);
  const friend = backend.friends.find((friend) => friend.id === directId && friend.accepted_at);
  const direct = useDirectMessages(backend.api, friend?.id ?? null);
  const [business, setBusiness] = useState(false);
  useEffect(() => { if (backend.ready) void backend.api.isBusiness().then(setBusiness, () => {}); }, [backend.ready, backend.api]);
  return <ChatView view={view} backend={backend} direct={direct} directId={directId} setDirectId={setDirectId} business={business} />;
}

export function ChatView({ view = "chats", backend, direct, directId, setDirectId, business }: ChatViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = pathname === "/design-preview";
  const chatsUrl = preview ? "/design-preview" : "/";
  const profileUrl = preview ? "/design-preview?view=profile" : "/profile";
  const online = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  const { session, api, ready } = backend;
  const groups = backend.groups;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const directFriend = backend.friends.find((friend) => friend.id === directId && friend.accepted_at);
  const request = backend.friends.find((friend) => friend.id === directId && !friend.accepted_at && friend.requested_by_id !== session?.id);
  const peerLink = directFriend ?? request;
  const peer = peerLink?.user_a_id === session?.id ? peerLink?.user_b : peerLink?.user_a;
  const [sidebar, setSidebar] = useState(false);
  const [active, setActive] = useState<Venue | null>(null);
  const [pending, setPending] = useState<Venue | null>(null);
  const [entry, setEntry] = useState(false);
  const [draft, setDraft] = useState("");
  const [productName, setProductName] = useState("");
  const outbox = useOutbox();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personError, setPersonError] = useState("");
  const personFriend = backend.friends.find((friend) => friend.user_a_id === personId || friend.user_b_id === personId);
  const personPeer = personFriend?.user_a_id === session?.id ? personFriend?.user_b : personFriend?.user_a;
  const personMember = groups.flatMap((item) => item.members).find((member) => member.id === personId);
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

  function switchDirectConversation(connectionId: string | null) {
    setDirectId(connectionId);
  }

  // The current-membership query is authoritative, even if the member list is capped.
  const group = groups.find((item) => item.id === active?.id);
  const openGroup = backend.openGroup;
  useEffect(() => {
    const element = app.current;
    if (element) return observeChatViewport(element);
  }, []);
  useEffect(() => active && view !== "profile" && !directId ? openGroup(active.id) : undefined, [active, view, directId, openGroup]);

  const hiddenUsers = useMemo(
    () => new Set(session?.hidden ?? []),
    [session?.hidden],
  );

  const visibleGroupMessages = group?.messages.filter((message) => !hiddenUsers.has(message.user)) ?? [];
  const latestGroupMessageId = group?.messages.at(-1)?.id;
  const latestDirectMessageId = direct.messages.at(-1)?.id;
  const groupOutbox = active ? outbox.visible(`g:${active.id}`, group?.messages.map((message) => message.id) ?? []) : [];
  const directOutbox = directId ? outbox.visible(`d:${directId}`, direct.messages.map((message) => message.id)) : [];
  const groupTitle = group?.venue.name ?? active?.name ?? "";

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
      const venue = resolveCode(value, appOrigin());
      setPending(null);
      setError("");

      accepted = true;

      const current = groups.find((item) => item.venue.codes[0] === venue.codes[0]);
      if (current && !current.venue.nameMissing) dismissEntry(() => openConversation(current.venue));
      else join(current?.venue ?? venue, !!current);
    } catch {
      setNotice("Could not complete this action. Please try again.");
    }
    return accepted;
  }

  const openInitialCode = useEffectEvent((value: string) => {
    // External links can open a group you're already in. New joins require the camera.
    const current = groups.find((item) => item.venue.codes[0] === value);
    if (current) {
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
    const venue = code ? groups.find((item) => item.venue.codes.includes(code))?.venue ?? null : null;
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
    let paintFrame = 0;
    let scanTimer = 0;
    let videoFrame: number | undefined;
    let stream: MediaStream | null = null;
    const previewVideo = video.current;
    // The first code in view wins, QR or retail barcode alike; there is no scan mode.
    const scan = async (detector: { detect(source: HTMLVideoElement): Promise<{ format: string; rawValue: string }[]> }) => {
      if (previewVideo.readyState >= 2 && entryRequested.current && !scanLocked.current) {
        const [found] = await detector.detect(previewVideo).catch(() => []);
        if (found && !disposed && entryRequested.current && !scanLocked.current) {
          scanLocked.current = true;
          if (!openScannedCode(scannedCode(found.format, found.rawValue))) {
            window.setTimeout(() => {
              if (!disposed && entryRequested.current) scanLocked.current = false;
            }, 1200);
          }
        }
      }
      if (!disposed) scanTimer = window.setTimeout(() => void scan(detector), 1000 / 12);
    };

    setCameraState("starting");
    setCameraError("");
    scanLocked.current = false;
    Promise.all([
      Promise.resolve().then(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })),
      import("barcode-detector/ponyfill"),
    ])
      .then(async ([media, { BarcodeDetector }]) => {
        stream = media;
        if (disposed) { media.getTracks().forEach((track) => track.stop()); return; }
        previewVideo.srcObject = media;
        await previewVideo.play();
        if (disposed) return;
        void scan(new BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e"] }));
        // Let WebKit commit the first camera frame at its final cover size.
        const reveal = () => {
          if (disposed) return;
          paintFrame = window.requestAnimationFrame(() => {
            paintFrame = window.requestAnimationFrame(() => {
              if (!disposed) setCameraState("active");
            });
          });
        };
        if (typeof previewVideo.requestVideoFrameCallback === "function") videoFrame = previewVideo.requestVideoFrameCallback(reveal);
        else reveal();
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
      window.cancelAnimationFrame(paintFrame);
      window.clearTimeout(scanTimer);
      if (videoFrame !== undefined) previewVideo.cancelVideoFrameCallback(videoFrame);
      stream?.getTracks().forEach((track) => track.stop());
      previewVideo.srcObject = null;
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
  }, [latestGroupMessageId, groupOutbox.length, active]);

  useEffect(() => {
    const stream = directBottom.current?.parentElement;
    stream?.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [latestDirectMessageId, directOutbox.length, directId]);

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

  /** Joins (unless already a member), then lets the server fill the name and photo before the room opens. */
  function join(venue: Venue, member: boolean) {
    if (!session || !ready) return;
    setPending(venue);
    void perform(async () => {
      setError("");
      try {
        const joined = member ? null : await api.joinGroup(venue.codes[0]);
        const groupId = joined?.group_id ?? venue.id;
        const name = await api.resolveGroup(venue.codes[0], joined ? joined.name : venue.nameMissing ? null : venue.name);
        await backend.refresh();
        const destination = { ...venue, id: groupId, name: name ?? groupFallbackName(venue.codes[0]), nameMissing: !name };
        dismissEntry(() => openConversation(destination));
      } catch (reason) { setError(errorMessage(reason)); throw reason; }
    });
  }

  const sendGroup = (groupId: string) => async (body: string) => {
    const message = await api.sendGroupMessage(groupId, body);
    void backend.refreshGroup(groupId).catch(() => {});
    return message;
  };
  const sendDirect = (connectionId: string) => async (body: string) => {
    const message = await api.sendDirectMessage(connectionId, body);
    void direct.refresh().catch(() => {});
    return message;
  };

  // The draft clears and the message shows at once; the input keeps focus so the keyboard stays open.
  function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!active || !session || !draft.trim()) return;
    outbox.send(`g:${active.id}`, draft, sendGroup(active.id));
    setDraft("");
  }

  function submitDirectMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!directId || !directFriend || !draft.trim()) return;
    outbox.send(`d:${directId}`, draft, sendDirect(directId));
    setDraft("");
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
    navigateChat(venue.codes[0], null);
  }

  function openDirectMessage(friendId: string) {
    if (view === "chats" && directId === friendId) return;
    motion.prepare(1);
    setSidebar(false);
    setActive(null);
    switchDirectConversation(friendId);
    setDraft("");
    navigateChat(null, friendId);
  }

  function respondToRequest(kind: "accept" | "decline" | "block") {
    if (!request) return;
    const name = peer?.display_name ?? "Participant";
    if (kind === "block" && !window.confirm(`Block ${name}? They won’t be able to send you friend requests.`)) return;
    void perform(async () => {
      await (kind === "accept" ? api.acceptFriend(request.id) : kind === "decline" ? api.removeFriend(request.id) : api.blockFriend(request.id));
      await backend.refresh();
      setNotice(kind === "accept" ? `You and ${name} are now friends.` : kind === "decline" ? `Declined ${name}’s friend request.` : `Blocked ${name}.`);
      if (kind !== "accept") backToChats();
    });
  }

  return (
    <div ref={app} className="qr-app">
      {(!online || backend.connection === "reconnecting") && <div className="connection-status" role="status">{online ? "Reconnecting… Your chats will refresh when connected." : "You’re offline. Reconnect to load chats and send messages."}</div>}
      <main ref={motion.surface} data-screen={screen} className={`app-content ${view === "chats" ? active || directId ? "has-chat" : "has-overview" : "has-profile"}`}>
        {view === "profile" ? <>
          {backend.error && <div className="connection-banner" role="alert">{backend.error} <button onClick={() => void perform(backend.refresh)}>Retry</button></div>}
          <ProfileView session={session} ready={ready} busy={busy} business={business} onBack={backToChats} onSave={(display_name, photo) => perform(async () => { await api.saveProfileWithAvatar(display_name, photo); await backend.refresh(); setNotice("Profile saved."); })} onSignOut={() => void perform(async () => { await api.signOut(); router.replace("/sign-in"); router.refresh(); })} onDeleteAccount={() => void perform(async () => { await api.deleteAccount(); router.replace("/sign-in"); router.refresh(); })} />
        </> : !ready && !backend.error ? <ChatsOverview loading profileName={session?.name} profileAvatarUrl={session?.avatarUrl} connected={backend.connection === "connected"} onOpenOwnProfile={openOwnProfile} /> : !active && !directId && (
          <ChatsOverview
            profileName={session?.name}
            profileAvatarUrl={session?.avatarUrl}
            connected={backend.connection === "connected"}
            onOpenOwnProfile={openOwnProfile}
            groups={groups}
            friends={backend.friends}
            directPreviews={backend.directPreviews}
            unread={backend.unread}
            hasObservedGroup={backend.hasObservedGroup}
            sessionId={session?.id ?? null}
            busy={busy}
            error={backend.error}
            onRetry={() => { void perform(backend.refresh); }}
            onScan={startEntry}
            onOpenGroup={(groupId) => { const target = groups.find((item) => item.id === groupId); if (target) openConversation(target.venue); }}
            onOpenDirect={openDirectMessage}
            onRemoveRequest={async (friendId) => { await api.removeFriend(friendId); await backend.refresh(); }}
            onUnfriend={async (friendId) => { await api.removeFriend(friendId); await backend.refresh(); }}
            onBlock={async (friendId) => { await api.blockFriend(friendId); await backend.refresh(); }}
            onLeaveGroup={async (groupId) => { await api.leaveGroup(groupId); await backend.refresh(); }}
          />
        )}

        {view === "chats" && backend.error && (active || directId) && (
          <section className="conversation-view">
            <ConversationHeader title={active?.name ?? peer?.display_name ?? "Direct message"} subtitle="Access could not be checked" onBack={backToChats} disabled settingsLabel="Group members" onSettings={active ? () => {} : undefined} />
            <div className="chat-conversation-surface conversation-load-error" role="alert">
              <h2>Couldn’t load this chat.</h2>
              <p>We couldn’t verify your access. Try again to reload the conversation.</p>
              <button type="button" className="scan-primary" disabled={busy} onClick={() => void perform(backend.refresh)}>Retry</button>
            </div>
          </section>
        )}

        {view === "chats" && active && ready && !backend.error && (
          <section className="conversation-view">
            <ConversationHeader title={groupTitle} onBack={backToChats} settingsLabel="Group members" members={group?.members.length} disabled={!group} onSettings={() => setSidebar(true)} venueLink={group ? venueLink(group.venue, window.location.origin) : null} />
            <div className="chat-conversation-surface">
              <div className="message-stream" aria-live="polite">
                {group?.nextCursor !== null && group?.nextCursor !== undefined && <button className="text-button" disabled={busy} onClick={() => void perform(() => backend.loadOlder(active.id))}>Load older messages</button>}
                {backend.groupLoading && <MessageSkeleton />}
                {!backend.groupLoading && !group && <p className="first-message">Your membership has ended.</p>}
                {visibleGroupMessages.map((message, index) => {
                  const profileAvailable = message.user === session?.id || group?.members.some((member) => member.id === message.user) || backend.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user);
                  return (
                    <Fragment key={message.id}>
                      <MessageDay time={message.time} previousTime={visibleGroupMessages[index - 1]?.time} />
                      <article className={message.user === session?.id ? "own" : ""}>
                        {message.user !== session?.id && <button className="message-profile" aria-label={`View ${message.name}'s profile`} disabled={!profileAvailable} onClick={() => openPerson(message.user)}><Avatar name={message.name} url={message.avatarUrl} size={44} /></button>}
                        <div>
                          {message.user === group?.venue.place?.ownerId && <span className="owner-tag">Owner</span>}
                          <p>{message.text}</p>
                        </div>
                      </article>
                    </Fragment>
                  ); })}
                {groupOutbox.map((item) => <OutboxBubble key={item.key} item={item} onRetry={() => outbox.retry(item, sendGroup(active.id))} />)}
                <div ref={bottom} />
              </div>

              {group?.venue.nameMissing && group.venue.codes[0]?.startsWith("gtin:") && (
                <form className="product-name-form" onSubmit={(event) => {
                  event.preventDefault();
                  void perform(async () => { await api.nameProductGroup(group.id, productName); setProductName(""); await backend.refresh(); });
                }}>
                  <label htmlFor="product-name">We couldn’t find this product. Name it for everyone who scans it:</label>
                  <div className="clear-field"><input id="product-name" value={productName} maxLength={100} placeholder=" " disabled={busy} autoComplete="off" onChange={(event) => setProductName(event.target.value)} /><ClearButton label="Clear product name" inputId="product-name" disabled={busy} onClear={() => setProductName("")} /></div>
                  <button type="submit" disabled={busy || !productName.trim()}>Save</button>
                </form>
              )}

              {group ? (
                <form className="message-composer" onSubmit={submitMessage} aria-busy={busy}>
                  <div className="message-composer-pill">
                    <label className="sr-only" htmlFor="message">Message</label>
                    <input
                      id="message"
                      value={draft}
                      disabled={busy}
                      maxLength={4000}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={`Message ${groupTitle}…`}
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
            {sidebar && group && <GroupSidebar key={group.id} group={group} userId={session?.id} onClose={() => setSidebar(false)} onProfile={openPerson} />}
          </section>
        )}

        {view === "chats" && directId && ready && !backend.error && (
          <section className="conversation-view">
            <ConversationHeader title={peer?.display_name ?? "Direct message"} subtitle={direct.connection === "connected" ? undefined : "Reconnecting…"} onBack={backToChats} />
            <div className="chat-conversation-surface">
              {!directFriend ? request ? <FriendRequestDecision name={peer?.display_name ?? "Participant"} avatarUrl={peer?.avatar_url ?? null} sentAge={messageAge(Date.parse(request.requested_at))} busy={busy}
                  onAccept={() => respondToRequest("accept")} onDecline={() => respondToRequest("decline")} onBlock={() => respondToRequest("block")} /> : <p className="first-message">This friendship is no longer available.</p> : <>
                <div className="message-stream" aria-live="polite">
                  {direct.error && <div className="connection-banner dm-load-error" role="alert">Couldn’t load messages. Your draft stays here. <button onClick={() => void perform(direct.refresh)}>Retry</button></div>}
                  {direct.loading && <MessageSkeleton />}
                  {!direct.loading && !direct.error && direct.messages.length === 0 && <FirstDirectMessageEmpty friendName={peer?.display_name ?? "your friend"} />}
                  {direct.nextCursor !== null && <button className="text-button" disabled={busy} onClick={() => void perform(direct.loadOlder)}>Load older messages</button>}
                  {direct.messages.map((message, index) => <Fragment key={message.id}>
                    <MessageDay time={Date.parse(message.created_at)} previousTime={direct.messages[index - 1] ? Date.parse(direct.messages[index - 1].created_at) : undefined} />
                    <DirectMessageBubble message={message} session={session} peer={peer ?? null} onOpenProfile={openPerson} />
                  </Fragment>)}
                  {directOutbox.map((item) => <OutboxBubble key={item.key} item={item} onRetry={() => outbox.retry(item, sendDirect(directId))} />)}
                  <div ref={directBottom} />
                </div>
                <DirectMessageComposer
                  draft={draft}
                  friendName={peer?.display_name ?? "your friend"}
                  busy={busy}
                  ready={ready}
                  loading={direct.loading}
                  loadError={direct.error}
                  onChange={setDraft}
                  onSubmit={submitDirectMessage}
                />
              </>}
            </div>

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
        className="camera-dialog"
        ref={dialog}
        aria-label="Join a conversation"
        onCancel={(event) => { event.preventDefault(); if (!busy) dismissEntry(); }}
        onClick={(event) => {
          if (event.target === dialog.current && !busy) dismissEntry();
        }}
      >
        <span className="browser-edge-tint browser-edge-top" data-camera-edge="top" aria-hidden="true" />
        <span className="browser-edge-tint browser-edge-bottom" data-camera-edge="bottom" aria-hidden="true" />
        <div className="camera-panel">
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            disabled={busy}
            onClick={() => dismissEntry()}
          >
            <Icon name="close" size={20} />
          </button>
          <div className="camera-frame" data-ready={cameraState === "active"}>
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
                : error || (pending ? "Joining…" : "Hold a QR code or barcode inside the frame.")}
            </p>
            {(cameraState === "error" || error) && (
              <button
                type="button"
                className="camera-retry"
                onClick={() => {
                  setError("");
                  setPending(null);
                  setCameraAttempt((attempt) => attempt + 1);
                }}
              >
                Try camera again
              </button>
            )}
          </div>
        </div>
      </dialog>

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
