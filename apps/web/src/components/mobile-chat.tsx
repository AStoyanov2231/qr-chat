"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import {
  venues,
  getSession,
  saveSession,
  getGroup,
  joinGroup,
  leaveGroup,
  sendMessage,
  reportMessage,
  resolveCode,
  heartbeat,
  type Venue,
  type Session,
  type Group,
} from "@/lib/chat-store";

import { Icon } from "@/components/icon";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null),
    [groups, setGroups] = useState<Group[]>([]),
    [active, setActive] = useState<Venue | null>(null),
    [pending, setPending] = useState<Venue | null>(null);
  const [entry, setEntry] = useState(false),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [draft, setDraft] = useState(""),
    [info, setInfo] = useState(false),
    [menu, setMenu] = useState<string | null>(null),
    [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const bottom = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const group = groups.find((g) => g.id === active?.id),
    joined = groups.filter((g) => g.members.some((m) => m.id === session?.id));
  function openCode(value: string) {
    attempt(() => {
      const venue = resolveCode(value);
      setEntry(true);
      setPending(null);
      setError("");
      if (!venue) {
        setError(
          "That QR code isn’t recognized. Check the code or ask the venue for a new one.",
        );
        return;
      }
      if (venue.deleted) {
        setError(
          "This QR code is no longer available. Ask the venue for an updated code.",
        );
        return;
      }
      if (venue.closed) {
        setError(
          "This conversation has closed. Try a QR code at another location.",
        );
        return;
      }
      const current = getGroup(venue.id),
        user = getSession();
      if (current?.members.some((m) => m.id === user.id)) {
        setActive(venue);
        window.history.replaceState(null, "", "?code=" + venue.codes[0]);
        setDraft("");
        setMenu(null);
        setEntry(false);
        setInfo(false);
      } else {
        setPending(venue);
        setName(user.name);
      }
    });
  }
  const openInitialCode = useEffectEvent((value: string) => openCode(value));
  useEffect(() => {
    function refresh() {
      try {
        const user = getSession();
        if (!localStorage.getItem("qrchat:v1:session")) saveSession(user);
        setSession(user);
        setNow(Date.now());
        setGroups(
          venues.map((v) => getGroup(v.id)).filter((g): g is Group => !!g),
        );
      } catch {
        setNotice(
          "Browser storage is unavailable. Enable it to save your session and chat.",
        );
      }
    }
    const init = window.setTimeout(() => {
      refresh();
      setReady(true);
      const query = new URLSearchParams(window.location.search).get("code");
      if (query !== null) openInitialCode(query);
    }, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener("qrchat", refresh);
    return () => {
      window.clearTimeout(init);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("qrchat", refresh);
    };
  }, []);
  useEffect(() => {
    if (entry) dialog.current?.showModal();
    else dialog.current?.close();
  }, [entry]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [group?.messages.length, active]);
  useEffect(() => {
    if (!active) return;
    const beat = () => {
      try {
        heartbeat(active.id, getSession());
      } catch {
        /* The next write displays a storage error. */
      }
    };
    beat();
    const interval = window.setInterval(beat, 30000);
    return () => window.clearInterval(interval);
  }, [active]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  function attempt(action: () => void) {
    try {
      action();
    } catch {
      setNotice(
        "Couldn’t save this change. Your browser storage may be full or disabled. Please try again.",
      );
    }
  }
  function join(event: FormEvent) {
    event.preventDefault();
    if (!pending || !session || !name.trim()) return;
    attempt(() => {
      const user = { ...session, name: name.trim() };
      saveSession(user);
      joinGroup(pending.id, user);
      setActive(pending);
      setEntry(false);
      setInfo(false);
      setDraft("");
      window.history.replaceState(null, "", "?code=" + pending.codes[0]);
    });
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (
      !active ||
      !session ||
      !draft.trim() ||
      !group?.members.some((m) => m.id === session.id)
    )
      return;
    attempt(() => {
      sendMessage(active.id, session, draft.trim());
      setDraft("");
    });
  }
  function startEntry() {
    setCode("");
    setError("");
    setPending(null);
    setEntry(true);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            setActive(null);
            window.history.replaceState(null, "", "/");
          }}
          aria-label="QR Chat home"
        >
          <span className="brand-mark">
            <Icon name="qr" size={23} />
          </span>
          qr chat<span className="brand-dot">.</span>
        </button>
        <button className="new-chat" onClick={startEntry}>
          <Icon name="plus" /> Join a conversation
        </button>
        <div className="sidebar-label">
          Your conversations{" "}
          <span>{joined.length.toString().padStart(2, "0")}</span>
        </div>
        <nav aria-label="Your conversations">
          {joined.length ? (
            joined.map((g) => {
              const venue = venues.find((v) => v.id === g.id)!;
              return (
                <button
                  key={g.id}
                  className={
                    "conversation " + (active?.id === g.id ? "selected" : "")
                  }
                  onClick={() => {
                    setActive(venue);
                    window.history.replaceState(
                      null,
                      "",
                      "?code=" + venue.codes[0],
                    );
                    setDraft("");
                    setMenu(null);
                    setInfo(false);
                    setDraft("");
                  }}
                >
                  <span className="venue-icon">
                    <Icon
                      name={
                        venue.kind === "cafe"
                          ? "coffee"
                          : venue.kind === "event"
                            ? "sun"
                            : "pin"
                      }
                    />
                  </span>
                  <span>
                    <strong>{venue.name}</strong>
                    <small>
                      {g.messages.at(-1)?.text ?? "Say your first hello"}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="sidebar-empty">
              <Icon name="chat" size={27} />
              <p>
                Your next conversation
                <br />
                starts with a scan.
              </p>
              <small>Chats you join will appear here.</small>
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Icon name="pin" />
            <p>
              A shared place.
              <br />
              <strong>A new connection.</strong>
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {session?.name ? (
                session.name.slice(0, 2).toUpperCase()
              ) : (
                <Icon name="people" size={18} />
              )}
            </span>
            <span>
              <strong>{session?.name || "Make yourself at home"}</strong>
              <small>
                {session?.name
                  ? "Your name, your conversation"
                  : "No account needed"}
              </small>
            </span>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <main className={"main " + (active ? "chat-main" : "")}>
        <header className="topbar">
          <span>
            <Icon name={active ? "pin" : "sun"} size={17} />
            {active ? active.name : "A little closer to the people around you"}
          </span>
          <span className="local-badge">
            <span className="status-dot" />
            Local preview
          </span>
        </header>
        {!active ? (
          <div className="mobile-home">
            <section className="mobile-home-hero">
              <div className="mobile-home-copy">
                <h1>Real conversations start here.</h1>
                <p>Scan a code. Join the room.</p>
                <button
                  className="primary"
                  onClick={startEntry}
                  disabled={!ready}
                >
                  Get started <Icon name="arrow" size={18} />
                </button>
              </div>
              <div className="mobile-home-phone" aria-hidden="true">
                <Image
                  src="/product/scanner.png"
                  alt=""
                  width={220}
                  height={420}
                  priority
                />
              </div>
            </section>
            <section className="mobile-spaces">
              <h2>Choose a room.</h2>
              <div className="mobile-space-list">
                {venues.slice(0, 3).map((venue, index) => (
                  <button
                    key={venue.id}
                    onClick={() => openCode(venue.codes[0])}
                  >
                    <span className={"venue-icon color-" + index}>
                      <Icon
                        name={
                          index === 0 ? "coffee" : index === 1 ? "pin" : "sun"
                        }
                        size={22}
                      />
                    </span>
                    <strong>{venue.name}</strong>
                    <Icon name="arrow" size={18} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <>
            <div className="chat-heading">
              <span className="venue-icon color-0">
                <Icon
                  name={
                    active.kind === "cafe"
                      ? "coffee"
                      : active.kind === "event"
                        ? "sun"
                        : "pin"
                  }
                  size={25}
                />
              </span>
              <div>
                <h1>{active.name}</h1>
                <p>
                  <span className="status-dot" />
                  {group?.members.filter((m) => now - m.seen < 90000).length ??
                    0}{" "}
                  {group?.members.filter((m) => now - m.seen < 90000).length ===
                  1
                    ? "person here"
                    : "people here"}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Group information"
                onClick={() => setInfo(!info)}
              >
                <Icon name="info" />
              </button>
            </div>
            <div className="chat-body">
              <section
                className="messages"
                aria-label="Messages"
                aria-live="polite"
              >
                <div className="chat-intro">
                  <span className="intro-icon">
                    <Icon name="chat" size={30} />
                  </span>
                  <h2>You’re in.</h2>
                  <span className="date-label">
                    {group
                      ? new Date(group.created).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                        })
                      : "Today"}
                  </span>
                </div>
                {!group?.messages.length && (
                  <div className="empty-messages">
                    <h3>Be the first to say hello.</h3>
                    <p>A good conversation starts with one little message.</p>
                    <button
                      className="suggestion"
                      onClick={() => setDraft("Hi everyone! Nice to be here.")}
                    >
                      Hi everyone! Nice to be here.{" "}
                      <Icon name="plus" size={15} />
                    </button>
                  </div>
                )}
                {group?.messages
                  .filter((m) => !session?.hidden.includes(m.user))
                  .map((m) => (
                    <article
                      key={m.id}
                      className={
                        "message " + (m.user === session?.id ? "own" : "")
                      }
                    >
                      <span className="avatar">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="message-content">
                        <div className="message-meta">
                          <strong>
                            {m.name}
                            {m.user === session?.id ? " (you)" : ""}
                          </strong>
                          <time dateTime={new Date(m.time).toISOString()}>
                            {new Date(m.time).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                          <button
                            aria-label={"Options for message by " + m.name}
                            className="message-options"
                            onClick={() => setMenu(menu === m.id ? null : m.id)}
                          >
                            •••
                          </button>
                        </div>
                        <p>{m.text}</p>
                        {menu === m.id && (
                          <div className="message-menu">
                            <button
                              onClick={() =>
                                attempt(() => {
                                  reportMessage(m, session!.id);
                                  setNotice(
                                    "Report saved in this browser. Thank you for helping keep this space friendly.",
                                  );
                                  setMenu(null);
                                })
                              }
                            >
                              Report message
                            </button>
                            {m.user !== session?.id && (
                              <button
                                onClick={() =>
                                  attempt(() => {
                                    saveSession({
                                      ...session!,
                                      hidden: [...session!.hidden, m.user],
                                    });
                                    setNotice(
                                      "Participant hidden. You can undo this in group information.",
                                    );
                                    setMenu(null);
                                  })
                                }
                              >
                                Hide participant
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                <div ref={bottom} />
              </section>
              {info && (
                <aside className="group-info">
                  <div className="section-heading">
                    <h2>About this space</h2>
                    <button
                      className="icon-button"
                      aria-label="Close group information"
                      onClick={() => setInfo(false)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  <span className="venue-icon color-0">
                    <Icon
                      name={
                        active.kind === "cafe"
                          ? "coffee"
                          : active.kind === "event"
                            ? "sun"
                            : "pin"
                      }
                      size={28}
                    />
                  </span>
                  <h3>{active.name}</h3>
                  <p>People currently at this location.</p>
                  <dl>
                    <dt>Location codes</dt>
                    <dd>{active.codes.join(", ")}</dd>
                    <dt>Members</dt>
                    <dd>
                      {group?.members.length ?? 0}{" "}
                      {group?.members.length === 1 ? "person" : "people"}
                    </dd>
                  </dl>
                  <div className="guidelines">
                    <Icon name="shield" />
                    <strong>A little kindness goes a long way.</strong>
                    <p>
                      Be welcoming. Respect each other. Keep personal details
                      personal.
                    </p>
                  </div>
                  {!!session?.hidden.length && (
                    <button
                      className="text-button"
                      onClick={() =>
                        attempt(() => {
                          saveSession({ ...session, hidden: [] });
                          setNotice("All participants are visible again.");
                        })
                      }
                    >
                      Show hidden participants ({session.hidden.length})
                    </button>
                  )}
                  <button
                    className="leave-button"
                    onClick={() =>
                      attempt(() => {
                        leaveGroup(active.id, session!.id);
                        setActive(null);
                        setInfo(false);
                        window.history.replaceState(null, "", "/");
                        setNotice(
                          "You’ve left the conversation. You can join again with its QR code.",
                        );
                      })
                    }
                  >
                    <Icon name="exit" size={18} />
                    Leave conversation
                  </button>
                </aside>
              )}
            </div>
            {group?.members.some((m) => m.id === session?.id) ? (
              <form className="composer" onSubmit={send}>
                <div>
                  <label className="sr-only" htmlFor="message">
                    Your message
                  </label>
                  <input
                    id="message"
                    placeholder="A hello can go a long way..."
                    value={draft}
                    maxLength={2000}
                    onChange={(e) => setDraft(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    className="send-button"
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="Send message"
                  >
                    <Icon name="send" />
                  </button>
                </div>
                <small>
                  Be kind. You’re sharing more than a chat, you’re sharing a
                  place.
                </small>
              </form>
            ) : (
              <div className="composer">
                <button
                  className="primary"
                  onClick={() => openCode(active.codes[0])}
                >
                  Rejoin conversation
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <dialog
        aria-label="Join a conversation"
        ref={dialog}
        onCancel={() => setEntry(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setEntry(false);
        }}
      >
        <div className="entry-panel">
          {notice && (
            <p className="error" role="status">
              {notice}
            </p>
          )}
          <button
            className="icon-button modal-close"
            aria-label="Close"
            onClick={() => setEntry(false)}
          >
            <Icon name="close" />
          </button>
          <span className="entry-icon">
            <Icon name={pending ? "chat" : "qr"} size={30} />
          </span>
          {pending ? (
            <>
              <h2>
                {groups.find((g) => g.id === pending.id)
                  ? "You’re in."
                  : "Start the room."}
              </h2>
              <p>
                {groups.find((g) => g.id === pending.id)
                  ? "Join"
                  : "Be the first at"}{" "}
                <strong>{pending.name}</strong>.
              </p>
              <form onSubmit={join}>
                <label htmlFor="name">Your name</label>
                <input
                  key="name"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should we call you?"
                  maxLength={30}
                  required
                  autoFocus
                />
                <button className="primary" disabled={!name.trim()}>
                  {groups.find((g) => g.id === pending.id)
                    ? "Join conversation"
                    : "Create conversation"}
                  <Icon name="arrow" size={18} />
                </button>
              </form>
              <button className="text-button" onClick={() => setPending(null)}>
                Use a different code
              </button>
            </>
          ) : (
            <>
              <h2>Enter the room.</h2>
              <p>Use the code beside the QR.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openCode(code);
                }}
              >
                <label htmlFor="code">Code</label>
                <input
                  key="code"
                  id="code"
                  maxLength={2048}
                  placeholder="CORNER-01"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError("");
                  }}
                  required
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? "code-error" : undefined}
                />
                {error && (
                  <p className="error" id="code-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary" disabled={!code.trim()}>
                  Find room
                  <Icon name="arrow" size={18} />
                </button>
              </form>
              <div className="demo-hint">
                <button onClick={() => openCode("CORNER-01")}>
                  Try Brew &amp; Co.
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
      {notice && !entry && (
        <div className="toast" role="status">
          <Icon name="info" size={20} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
