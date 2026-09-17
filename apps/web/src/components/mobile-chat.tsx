"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import QrScanner from "qr-scanner";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Bell, CornersOut, Lightbulb, CaretRight, House, Users, User, MagnifyingGlass } from "@phosphor-icons/react";
import { ProfileView } from "@/components/profile-view";
import { Icon } from "@/components/icon";
import { resolveCode, type Venue } from "@/lib/chat-view";
import { useChatBackend, useDirectMessages, errorMessage } from "@/hooks/use-chat-backend";

function messageAge(time: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function venueIcon(venue: Venue): "coffee" | "sun" | "pin" {
  return venue.kind === "cafe"
    ? "coffee"
    : venue.kind === "event"
      ? "sun"
      : "pin";
}

export default function QrChatApp() {
  const pathname = usePathname();
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
  const [active, setActive] = useState<Venue | null>(null);
  const [pending, setPending] = useState<Venue | null>(null);
  const [entry, setEntry] = useState(false);
  const [name, setName] = useState("");
  const [groupFilter, setGroupFilter] = useState("Recent");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  // The current-membership query is authoritative, even if the member list is capped.
  const joined = groups;
  const group = groups.find((item) => item.id === active?.id);
  const hiddenUsers = useMemo(
    () => new Set(session?.hidden ?? []),
    [session?.hidden],
  );

  const latestGroupMessageId = group?.messages.at(-1)?.id;
  const latestDirectMessageId = direct.messages.at(-1)?.id;

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
        setDirectId(null);
        setActive(current.venue);
        setEntry(false);
        setDraft("");
        router.push(`/chats?code=${encodeURIComponent(venue.codes[0])}`);
      } else {
        setPending(venue);
        setName(session?.name ?? "");
      }
    } catch {
      setNotice("Could not complete this action. Please try again.");
    }
    return accepted;
  }

  const openInitialCode = useEffectEvent((value: string) => openCode(value));
  const openScannedCode = useEffectEvent((value: string) => openCode(value));

  useEffect(() => {
    if (!ready) return;
    const init = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search).get("code");
      if (query !== null) openInitialCode(query);
    }, 0);
    return () => window.clearTimeout(init);
  }, [ready]);

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

  function join(event: FormEvent) {
    event.preventDefault();
    if (!pending || !session || !name.trim()) return;
    void perform(async () => {
      await api.saveProfile({ display_name: name });
      const membership = await api.joinGroup(pending.codes[0]);
      await backend.refresh();
      setDirectId(null);
      setActive({ ...pending, id: membership.group_id });
      setEntry(false);
      setDraft("");
      router.push(`/chats?code=${encodeURIComponent(pending.codes[0])}`);
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

  function openConversation(venue: Venue) {
    setActive(venue);
    setDirectId(null);
    setDraft("");
    router.push(`/chats?code=${encodeURIComponent(venue.codes[0])}`);
  }

  function leaveCurrentChat() {
    void perform(async () => {
      await api.leaveGroup();
      await backend.refresh();
      setActive(null);
      router.push("/chats");
    });
  }

  const view =
    pathname === "/profile"
      ? "profile"
      : pathname === "/chats"
        ? "chats"
        : "scanner";

  return (
    <div className={`qr-app ${view === "scanner" ? "home-screen" : ""}`}>
      {backend.error ? (
        <div className="connection-banner" role="alert">{backend.error} <button onClick={() => void perform(backend.refresh)}>Retry</button></div>
      ) : !ready ? <div className="connection-banner" role="status">Loading your chats…</div> : null}
      <main
        className={`app-content ${(active || directId) && view === "chats" ? "has-chat" : ""}`}
      >
        {view === "scanner" && (
          <section className="scanner-view">
            <div className="home-toolbar"><button className="icon-button" aria-label="Notifications" onClick={() => setNotice("No new notifications.")}><Bell size={25} /></button></div>
            <div className="scanner-copy">
              <h1>Scan.<br />Join.<br />Chat.</h1>
              <p>Turn any QR code into<br />a group chat.</p>
            </div>
            <div className="scan-halo">
              <button type="button" className="scan-trigger" onClick={startEntry} disabled={!ready} aria-label="Scan a QR code"><CornersOut size={70} weight="bold" /></button>
              <span>Tap to scan</span>
            </div>
            <button className="scan-tip" onClick={startEntry} disabled={!ready}>
              <span className="tip-icon"><Lightbulb size={29} /></span>
              <span>See a QR code at a café,<br />venue or event? Scan it and<br />start chatting with people around you.</span>
              <CaretRight size={18} />
            </button>
          </section>
        )}

        {view === "chats" && !active && !directId && (
          <section className="chats-view">
            <div className="view-heading">
              <h1>Groups</h1>
              <button className="icon-button" aria-label="Search groups" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setSearch(""); }}><MagnifyingGlass size={25} /></button>
            </div>
            <div className="group-filters" aria-label="Filter groups">
              {["Recent", "Nearby", "My Groups"].map((filter) => <button key={filter} aria-pressed={groupFilter === filter} onClick={() => setGroupFilter(filter)}>{filter}</button>)}
            </div>
            {searchOpen && <input className="group-search" aria-label="Search groups by name" placeholder="Search groups" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} />}
            {backend.friends.length > 0 && <div className="friend-list" aria-label="Friends and requests">
              {backend.friends.map((friend) => {
                const other = friend.user_a_id === session?.id ? friend.user_b : friend.user_a;
                const incoming = friend.requested_by_id !== session?.id;
                return <div className="friend-row" key={friend.id}>
                  <span><strong>{other?.display_name ?? "Participant"}</strong><small>{friend.accepted_at ? "Friend" : incoming ? "Wants to be friends" : "Request sent"}</small></span>
                  {friend.accepted_at ? <button className="text-button" onClick={() => { setDirectId(friend.id); setDraft(""); }}>Message</button> : incoming && <button className="text-button" disabled={busy} onClick={() => void perform(async () => { await api.acceptFriend(friend.id); await backend.refresh(); })}>Accept</button>}
                  <button className="text-button" disabled={busy} onClick={() => void perform(async () => { await api.removeFriend(friend.id); await backend.refresh(); })}>{friend.accepted_at ? "Remove" : incoming ? "Decline" : "Cancel"}</button>
                </div>;
              })}
            </div>}
            {groupFilter === "Nearby" ? <div className="empty-view"><span><Icon name="pin" size={34} /></span><h2>Find a group nearby.</h2><p>Scan a QR code at a place around you.</p><button className="scan-primary" disabled={!ready} onClick={startEntry}>Scan a code</button></div> : joined.length ? (
              <div className="chat-list">
                {search && !joined.some((item) => item.venue.name.toLowerCase().includes(search.toLowerCase())) && <p className="first-message">No groups found.</p>}
                {joined.filter((item) => item.venue.name.toLowerCase().includes(search.toLowerCase())).map((item) => {
                  const venue = item.venue;
                  return (
                    <button type="button" key={item.id} onClick={() => openConversation(venue)}>
                      <span className="room-icon">
                        <Icon name={venueIcon(venue)} size={23} />
                      </span>
                      <span className="room-copy">
                        <strong>{venue.name}</strong>
                        <span className="member-count"><i />{item.members.length} members</span>
                        <small>{item.messages.at(-1) ? `${item.messages.at(-1)!.name}: ${item.messages.at(-1)!.text}` : "You’re in. Say hello."}</small>
                      </span>
                      <time className="room-time">{item.messages.at(-1) ? messageAge(item.messages.at(-1)!.time) : "Now"}</time>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-view">
                <span><Icon name="chat" size={34} /></span>
                <h2>No groups yet.</h2>
                <p>Your first room starts with a scan.</p>
                <button type="button" className="scan-primary" disabled={!ready} onClick={startEntry}>
                  Scan a code
                </button>
              </div>
            )}
          </section>
        )}

        {view === "chats" && active && (
          <section className="conversation-view">
            <header className="conversation-header">
              <button
                type="button"
                aria-label="Back to chats"
                onClick={() => {
                  setActive(null);
                  router.push("/chats");
                }}
              >
                ‹
              </button>
              <span className="room-icon">
                <Icon name={venueIcon(active)} size={21} />
              </span>
              <span>
                <strong>{active.name}</strong>
                <small>
                  <i />
                  {group?.members.length ?? 0} members
                </small>
              </span>
              <button type="button" className="more-button" aria-label="Leave conversation" disabled={busy || !group} onClick={leaveCurrentChat}>Leave</button>
            </header>

            <div className="message-stream" aria-live="polite">
              <div className="room-welcome">
                <span className="room-icon">
                  <Icon name={venueIcon(active)} size={28} />
                </span>
                <h2>{active.name}</h2>
                <p>{active.label}</p>
              </div>
              {group && <details className="participants">
                <summary>{group.members.length} members</summary>
                {group.members.filter((member) => member.id !== session?.id).map((member) => (
                  <div className="friend-row" key={member.id}><span>{member.name}</span><button className="text-button" disabled={busy || backend.friends.some((friend) => friend.user_a_id === member.id || friend.user_b_id === member.id)} onClick={() => void perform(async () => { await api.requestFriend(member.id); await backend.refresh(); setNotice("Friend request sent."); })}>Add friend</button></div>
                ))}
              </details>}
              {group?.nextCursor !== null && group?.nextCursor !== undefined && <button className="text-button" disabled={busy} onClick={() => void perform(backend.loadOlder)}>Load older messages</button>}
              {!group?.messages.length && (
                <p className="first-message">{!ready ? "Loading messages…" : group ? "Be the first to say hello." : "Your membership has ended."}</p>
              )}
              {group?.messages
                .filter((message) => !hiddenUsers.has(message.user))
                .map((message) => (
                  <article
                    key={message.id}
                    className={message.user === session?.id ? "own" : ""}
                  >
                    <span className="message-avatar">
                      {message.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <span className="message-meta">
                        {message.user === session?.id ? "You" : message.name}
                        {message.user !== session?.id && group.members.some((member) => member.id === message.user) && (
                          <button className="friend-request-button" disabled={busy || backend.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user)} onClick={() => void perform(async () => { await api.requestFriend(message.user); await backend.refresh(); setNotice("Friend request sent."); })}>Add friend</button>
                        )}
                      </span>
                      <p>{message.text}</p>
                      <time>
                        {new Date(message.time).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </article>
                ))}
              <div ref={bottom} />
            </div>

            {group ? (
              <form className="message-composer" onSubmit={submitMessage}>
                <label className="sr-only" htmlFor="message">Message</label>
                <input
                  id="message"
                  value={draft}
                  disabled={busy}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Message..."
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="send"
                  aria-label="Send message"
                  disabled={busy || !ready || !draft.trim()}
                >
                  <Icon name="arrow" size={18} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="scan-primary rejoin"
                disabled={!ready || busy}
                onClick={() => openCode(active.codes[0])}
              >
                Rejoin conversation
              </button>
            )}
          </section>
        )}

        {view === "chats" && directId && (
          <section className="conversation-view">
            <header className="conversation-header">
              <button aria-label="Back to chats" onClick={() => { setDirectId(null); setDraft(""); }}>‹</button>
              <span><strong>{peer?.display_name ?? "Direct message"}</strong><small>{direct.connection === "connected" ? "Friends" : "Reconnecting…"}</small></span>
            </header>
            {!directFriend ? <p className="first-message">This friendship is no longer available.</p> : <>
              {direct.error && <div className="connection-banner" role="alert">{direct.error} <button onClick={() => void perform(direct.refresh)}>Retry</button></div>}
              <div className="message-stream" aria-live="polite">
                {direct.loading && <p className="first-message">Loading messages…</p>}
                {direct.nextCursor !== null && <button className="text-button" disabled={busy} onClick={() => void perform(direct.loadOlder)}>Load older messages</button>}
                {direct.messages.map((message) => <article key={message.id} className={message.sender_id === session?.id ? "own" : ""}>
                  <div><span className="message-meta">{message.sender_id === session?.id ? "You" : peer?.display_name ?? "Friend"}</span><p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time></div>
                </article>)}
                <div ref={directBottom} />
              </div>
              <form className="message-composer" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await api.sendDirectMessage(directId, draft); setDraft(""); await direct.refresh(); }); }}>
                <label className="sr-only" htmlFor="direct-message">Direct message</label>
                <input id="direct-message" value={draft} disabled={busy} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder="Message..." autoComplete="off" />
                <button type="submit" className="send" aria-label="Send direct message" disabled={busy || !ready || direct.loading || !!direct.error || !draft.trim()}><Icon name="arrow" size={18} /></button>
              </form>
            </>}
          </section>
        )}

        {view === "profile" && <ProfileView session={session} group={backend.group} ready={ready} busy={busy} onSave={(display_name) => perform(async () => { await api.saveProfile({ display_name }); await backend.refresh(); setNotice("Profile saved."); })} onLeave={leaveCurrentChat} onSignOut={() => void perform(async () => { await api.signOut(); router.replace("/sign-in"); router.refresh(); })} />}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <Link href="/" className={view === "scanner" ? "active" : ""} aria-current={view === "scanner" ? "page" : undefined}><House size={29} weight={view === "scanner" ? "fill" : "regular"} /><span>Home</span></Link>
        <Link href="/chats" className={view === "chats" ? "active" : ""} aria-current={view === "chats" ? "page" : undefined}><Users size={30} weight={view === "chats" ? "fill" : "regular"} /><span>Groups</span></Link>
        <Link href="/profile" className={view === "profile" ? "active" : ""} aria-current={view === "profile" ? "page" : undefined}><User size={29} weight={view === "profile" ? "fill" : "regular"} /><span>Profile</span></Link>
      </nav>

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
              <h2>Join the room.</h2>
              <p>{pending.name}</p>
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
                <button type="submit" className="scan-primary" disabled={busy || !ready || !name.trim()}>
                  Join chat <Icon name="arrow" size={18} />
                </button>
              </form>
              <button type="button" className="text-button" onClick={() => setPending(null)}>
                Use another code
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
