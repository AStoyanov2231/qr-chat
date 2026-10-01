"use client";

import { messageDayLabel } from "@qr-chat/domain";
import type { ChatNameResolution } from "@qr-chat/api";
import { useRouter } from "next/navigation";
import QrScanner from "qr-scanner";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CornersOut, QrCode } from "@phosphor-icons/react";
import { ConversationHeader } from "@/components/conversation-header";
import { GroupSidebar } from "@/components/group-sidebar";
import { ProfileView } from "@/components/profile-view";
import { ChatsOverview } from "@/components/chats-overview";
import { DirectMessageBubble, DirectMessageComposer, FirstDirectMessageEmpty } from "@/components/direct-message-parts";
import { Avatar } from "@/components/avatar";
import { MemberProfile } from "@/components/member-profile";
import { Icon } from "@/components/icon";
import { directConversationScopeIsCurrent, resolveCode, type DirectConversationScope, type Venue } from "@/lib/chat-view";
import { useChatBackend, useDirectMessages, errorMessage } from "@/hooks/use-chat-backend";

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

export default function QrChatApp({ view = "chats" }: { view?: "chats" | "profile" }) {
  const router = useRouter();
  const backend = useChatBackend();
  const { session, api, ready } = backend;
  const groups = backend.group ? [backend.group] : [];
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [directId, setDirectId] = useState<string | null>(null);
  const directFriend = backend.friends.find((friend) => friend.id === directId && friend.accepted_at);
  const direct = useDirectMessages(api, directFriend?.id ?? null);
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
  const dialog = useRef<HTMLDialogElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const directBottom = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const scanLocked = useRef(false);
  const directScope = useRef<DirectConversationScope>({ connectionId: null, version: 0 });

  function switchDirectConversation(connectionId: string | null) {
    directScope.current = { connectionId, version: directScope.current.version + 1 };
    setDirectId(connectionId);
    setDirectSendError("");
    setSendingDirect(false);
  }

  // The current-membership query is authoritative, even if the member list is capped.
  const group = groups.find((item) => item.id === active?.id);
  const groupCode = group?.venue.codes[0];
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
      setEntry(true);
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
          switchDirectConversation(null);
          setActive(current.venue);
          setEntry(false);
          setDraft("");
          router.push(`/?code=${encodeURIComponent(venue.codes[0])}`);
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
    if (current?.venue.codes[0] === value) openConversation(current.venue);
    else startEntry();
  });
  const openScannedCode = useEffectEvent((value: string) => openCode(value));

  useEffect(() => {
    if (!ready || view === "profile") return;
    const init = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("code");
      if (query !== null) openInitialCode(query);
    }, 0);
    return () => window.clearTimeout(init);
  }, [ready, view]);

  useEffect(() => {
    if (entry) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [entry]);

  useEffect(() => {
    if (!entry || pending || !video.current) return;

    let disposed = false;
    const scanner = new QrScanner(
      video.current,
      (result) => {
        if (disposed || scanLocked.current) return;
        scanLocked.current = true;
        const accepted = openScannedCode(result.data);
        if (!accepted) {
          window.setTimeout(() => {
            scanLocked.current = false;
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
      .catch((reason: unknown) => {
        if (disposed) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setCameraState("error");
        setCameraError(
          /permission|denied|notallowed/i.test(message)
            ? "Camera access is blocked. Allow it in your browser settings, then try again."
            : /notfound|device|camera/i.test(message)
              ? "No camera was found on this device."
              : "The camera could not start. Check your browser permissions and try again.",
        );
      });

    return () => {
      disposed = true;
      scanner.destroy();
      setCameraState("idle");
    };
  }, [entry, pending, cameraAttempt]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [latestGroupMessageId, active]);

  useEffect(() => {
    directBottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [latestDirectMessageId, directId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function startEntry() {
    setError("");
    setPending(null);
    setCameraError("");
    scanLocked.current = false;
    setEntry(true);
  }

  function openPerson(id: string) {
    if (id === session?.id) { router.push("/profile"); return; }
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
      switchDirectConversation(null);
      setActive(destination);
      setEntry(false);
      setPending(null);
      setDraft("");
      router.push(`/?code=${encodeURIComponent(pending.codes[0])}`);
    });
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!active || !session || !draft.trim()) return;
    void perform(async () => {
      await api.sendGroupMessage(active.id, draft);
      setDraft("");
      await backend.refresh();
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

  function openConversation(venue: Venue) {
    setSidebar(false);
    setActive(venue);
    switchDirectConversation(null);
    setDraft("");
    setDirectSendError("");
    router.push(`/?code=${encodeURIComponent(venue.codes[0])}`);
  }

  function openDirectMessage(friendId: string) {
    setSidebar(false);
    setActive(null);
    switchDirectConversation(friendId);
    setDraft("");
    setDirectSendError("");
    router.push("/");
  }

  function leaveCurrentChat() {
    setSidebar(false);
    void perform(async () => {
      await api.leaveGroup();
      await backend.refresh();
      setActive(null);
      router.push("/");
    });
  }

  return (
    <div className="qr-app">
      <main className={`app-content ${view === "chats" && (active || directId) ? "has-chat" : ""}`}>
        {view === "profile" ? <>
          {backend.error && <div className="connection-banner" role="alert">{backend.error} <button onClick={() => void perform(backend.refresh)}>Retry</button></div>}
          <ProfileView session={session} group={backend.group} ready={ready} busy={busy} onSave={(display_name, photo) => perform(async () => { await api.saveProfileWithAvatar(display_name, photo); await backend.refresh(); setNotice("Profile saved."); })} onLeave={leaveCurrentChat} onSignOut={() => void perform(async () => { await api.signOut(); router.replace("/sign-in"); router.refresh(); })} />
        </> : !ready && !backend.error ? <ChatsOverview loading profileName={session?.name} profileAvatarUrl={session?.avatarUrl} connected={backend.connection === "connected"} onOpenOwnProfile={() => router.push("/profile")} /> : !active && !directId && (
          <ChatsOverview
            profileName={session?.name}
            profileAvatarUrl={session?.avatarUrl}
            connected={backend.connection === "connected"}
            onOpenOwnProfile={() => router.push("/profile")}
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
            onAcceptRequest={(friendId) => { void perform(async () => { await api.acceptFriend(friendId); await backend.refresh(); }); }}
            onRemoveRequest={(friendId) => { void perform(async () => { await api.removeFriend(friendId); await backend.refresh(); }); }}
          />
        )}

        {view === "chats" && backend.error && (active || directId) && (
          <section className="conversation-view">
            <ConversationHeader title={active?.name ?? peer?.display_name ?? "Direct message"} subtitle="Access could not be checked" onBack={() => { setSidebar(false); setActive(null); switchDirectConversation(null); router.push("/"); }} settingsLabel="Conversation settings" disabled onSettings={() => {}} />
            <div className="chat-conversation-surface conversation-load-error" role="alert">
              <h2>Couldn’t load this chat.</h2>
              <p>We couldn’t verify your access. Try again to reload the conversation.</p>
              <button type="button" className="scan-primary" disabled={busy} onClick={() => void perform(backend.refresh)}>Retry</button>
            </div>
          </section>
        )}

        {view === "chats" && active && !backend.error && (
          <section className="conversation-view">
            <ConversationHeader title={active.name} subtitle={`${group?.members.length ?? 0} members`} imageUrl={group && groupPhoto?.code === groupCode ? groupPhoto?.url : null} onBack={() => { setSidebar(false); setActive(null); router.push("/"); }} settingsLabel="Group settings" disabled={!group} onSettings={() => setSidebar(true)} />
            <div className="chat-conversation-surface">
              <div className="chat-surface-handle" aria-hidden="true" />
              <div className="message-stream" aria-live="polite">
                {group?.nextCursor !== null && group?.nextCursor !== undefined && <button className="text-button" disabled={busy} onClick={() => void perform(backend.loadOlder)}>Load older messages</button>}
                {!group?.messages.length && (
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
                          {message.user !== session?.id && <span className="message-meta">
                            <button className="person-link" disabled={!profileAvailable} onClick={() => openPerson(message.user)}>{message.name}</button>
                          </span>}
                          <p>{message.text}</p>
                          <time>
                            {new Date(message.time).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </article>
                    </Fragment>
                  ); })}
                <div ref={bottom} />
              </div>

              {group ? (
                <form className="message-composer" onSubmit={submitMessage}>
                  <div className="message-composer-pill">
                    <label className="sr-only" htmlFor="message">Message</label>
                    <input
                      id="message"
                      value={draft}
                      disabled={busy}
                      maxLength={4000}
                      onChange={(event) => setDraft(event.target.value)}
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

        {view === "chats" && directId && !backend.error && (
          <section className="conversation-view">
            <ConversationHeader title={peer?.display_name ?? "Direct message"} subtitle={direct.connection === "connected" ? "Friend" : "Reconnecting…"} imageUrl={peer?.avatar_url} onBack={() => { switchDirectConversation(null); setDraft(""); }} settingsLabel="Conversation settings" disabled={!peer?.id} onSettings={() => { if (peer?.id) openPerson(peer.id); }} />
            <div className="chat-conversation-surface">
              <div className="chat-surface-handle" aria-hidden="true" />
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
          </section>
        )}

      </main>

      {view === "chats" && !active && !directId && <div className="scan-overlay">
        <button type="button" className="floating-scan" aria-label="Scan a QR code" disabled={!ready || !!backend.error} onClick={startEntry}>
          <span className="scan-symbol" aria-hidden="true"><CornersOut size={34} weight="bold" /><QrCode size={21} weight="bold" /></span>
        </button>
      </div>}

      {personId && session && <MemberProfile key={personId} person={person} friend={personFriend} userId={session.id} canRequest={!!personMember} busy={busy} error={personError || backend.error} onClose={() => setPersonId(null)}
        onRequest={() => { if (personMember) void changeFriend(() => api.requestFriend(personMember.id)); }}
        onAccept={() => { if (personFriend) void changeFriend(() => api.acceptFriend(personFriend.id)); }}
        onRemove={() => { if (personFriend) void changeFriend(() => api.removeFriend(personFriend.id)); }}
        onMessage={() => { if (!personFriend?.accepted_at) return; setPersonId(null); openDirectMessage(personFriend.id); }} />}

      <dialog
        className={pending ? "join-dialog" : "camera-dialog"}
        ref={dialog}
        aria-label="Join a conversation"
        onCancel={() => setEntry(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setEntry(false);
        }}
      >
        <div className={pending ? "entry-panel" : "camera-panel"}>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={() => setEntry(false)}
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
                    value={chatNameDraft}
                    onChange={(event) => setChatNameDraftState({ code: pending.codes[0], value: event.target.value })}
                    placeholder="Cafe name"
                    maxLength={100}
                    required
                  />
                  <p>We couldn’t identify this place. Give this chat a name for everyone.</p>
                </>}
                <button type="submit" className="scan-primary" disabled={busy || !ready || findingChatName || !chosenChatName || !name.trim()}>
                  Join chat <Icon name="arrow" size={18} />
                </button>
              </form>
              <button type="button" className="text-button" onClick={() => setPending(null)}>
                Scan another code
              </button>
            </>
          ) : (
            <>
              <div className="camera-frame">
                <video ref={video} muted playsInline aria-label="Camera preview" />
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
