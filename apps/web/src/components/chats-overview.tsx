"use client";

import type { ChatSnapshot } from "@qr-chat/api";
import { directConversationTime, directMessagePreview, groupAccessIndicator, groupInitials, messageAge } from "@qr-chat/domain";
import { CaretRight, MagnifyingGlass, Prohibit, UserMinus, UserPlus, Users, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Avatar } from "./avatar";
import { ConversationHeader } from "./conversation-header";

type FriendConnection = ChatSnapshot["friends"][number];
type AcceptedFriend = FriendConnection & { accepted_at: string };
type Peer = { id: string; name: string; avatarUrl: string | null };

type HeaderProps = {
  profileName?: string;
  profileAvatarUrl?: string | null;
  connected?: boolean;
  onOpenOwnProfile?: () => void;
};
type LoadingProps = HeaderProps & { loading: true };
type ReadyProps = HeaderProps & {
  loading?: false;
  group: ChatSnapshot["group"];
  friends: ChatSnapshot["friends"];
  directPreviews: ChatSnapshot["directPreviews"];
  expiresAt: string | null;
  hasObservedGroup: boolean;
  sessionId: string | null;
  busy: boolean;
  error?: string;
  onRetry: () => void;
  onScan: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenDirect: (friendId: string) => void;
  onOpenRequests: () => void;
  onRemoveRequest: (friendId: string) => Promise<void>;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (friendId: string) => Promise<void>;
};

function LoadingRow() {
  return (
    <div className="dm-loading-row" aria-hidden="true">
      <span className="skeleton-block dm-loading-avatar" />
      <span className="dm-loading-copy">
        <i className="skeleton-block" />
        <i className="skeleton-block" />
      </span>
      <i className="skeleton-block dm-loading-age" />
    </div>
  );
}

function ChatsHeader({ profileName = "You", profileAvatarUrl, connected, onOpenOwnProfile }: HeaderProps) {
  return <div className="view-heading">
    <h1>Chats</h1>
    <button type="button" className="profile-trigger" aria-label="Open your profile" disabled={!onOpenOwnProfile} onClick={onOpenOwnProfile}>
      <Avatar name={profileName} url={profileAvatarUrl} size={44} />
      <span className={`profile-connection-dot ${connected ? "connected" : ""}`} aria-hidden="true" />
    </button>
  </div>;
}

function ChatsLoading(props: HeaderProps) {
  return (
    <section className="chats-view chats-loading" aria-busy="true">
      <ChatsHeader {...props} />
      <div className="chat-search-field skeleton-block" aria-hidden="true" />
      <div className="chat-list-scroll">
        <div className="group-card-skeleton" aria-hidden="true"><LoadingRow /></div>
        <div className="request-card-skeleton" aria-hidden="true"><LoadingRow /></div>
        {[0, 1, 2].map((item) => <LoadingRow key={item} />)}
        <p className="loading-chats-label" role="status">Loading chats…</p>
      </div>
    </section>
  );
}

function useGroupAccessCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(Date.now);
  const countdown = groupAccessIndicator(expiresAt, now);

  useEffect(() => {
    let current = true;
    const update = () => { if (current) setNow(Date.now()); };
    update();
    if (groupAccessIndicator(expiresAt).state !== "remaining") {
      return () => { current = false; };
    }
    const interval = window.setInterval(update, 60_000);
    return () => {
      current = false;
      window.clearInterval(interval);
    };
  }, [expiresAt, countdown.state]);

  return countdown;
}

function getPeer(friend: FriendConnection, sessionId: string | null): Peer {
  const profile = friend.user_a_id === sessionId ? friend.user_b : friend.user_a;
  const id = friend.user_a_id === sessionId ? friend.user_b_id : friend.user_a_id;
  return {
    id: profile?.id ?? id,
    name: profile?.display_name?.trim() || "Participant",
    avatarUrl: profile?.avatar_url ?? null,
  };
}

export function chatNameMatches(name: string, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return !normalizedQuery || name.toLocaleLowerCase().includes(normalizedQuery);
}

const isIncoming = (friend: FriendConnection, sessionId: string | null) => friend.accepted_at === null && friend.requested_by_id !== sessionId;

function RequestRow({ friend, peer, busy, onRemove, onNotice }: {
  friend: FriendConnection;
  peer: Peer;
  busy: boolean;
  onRemove: (friendId: string) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    if (lock.current || busy) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await onRemove(friend.id);
      onNotice(`Cancelled friend request to ${peer.name}.`);
    } catch {
      setError("Couldn’t update this request. Try again.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return <li className="friend-request-row" aria-busy={pending}>
    <div className="request-person">
      <span className="request-identity"><Avatar name={peer.name} url={peer.avatarUrl} size={44} /><span className="request-marker" aria-hidden="true"><UserPlus size={13} weight="fill" /></span></span>
      <span className="request-copy">
        <strong>{peer.name}</strong>
        <small>Friend request sent</small>
      </span>
    </div>
    <div className="request-actions" role="group" aria-label={pending ? "Cancelling…" : "Friend request actions"}>
      <button type="button" className="request-action quiet" disabled={busy || pending} onClick={() => void cancel()} aria-label={`Cancel friend request to ${peer.name}`}>
        <X size={18} weight="bold" aria-hidden="true" /><span className="request-action-label">{pending ? "Cancelling…" : "Cancel"}</span>
      </button>
    </div>
    {error && <p className="request-error" role="alert">{error}</p>}
  </li>;
}

function IncomingRequestRow({ peer, sentAt, onOpen }: { peer: Peer; sentAt: string; onOpen: () => void }) {
  return <button type="button" className="dm-row-open" onClick={onOpen} aria-label={`Open friend request from ${peer.name}`}>
    <span className="request-identity"><Avatar name={peer.name} url={peer.avatarUrl} size={52} /><span className="request-marker" aria-hidden="true"><UserPlus size={13} weight="fill" /></span></span>
    <span className="dm-copy"><strong>{peer.name}</strong><span className="dm-preview request-unread">Wants to be friends</span></span>
    <time dateTime={sentAt}>{messageAge(Date.parse(sentAt))}</time>
  </button>;
}

function RequestsSummary({ peers, onOpen }: { peers: Peer[]; onOpen: () => void }) {
  return <button type="button" className="request-summary" onClick={onOpen} aria-label={`Review ${peers.length} friend requests`}>
    <span className="request-stack" aria-hidden="true">{peers.slice(0, 3).map((peer) => <Avatar key={peer.id} name={peer.name} url={peer.avatarUrl} size={40} />)}</span>
    <span className="dm-copy"><strong>{peers.length} friend requests</strong><span className="dm-preview">{peers.map((peer) => peer.name).join(", ")}</span></span>
    <span className="request-count" aria-hidden="true">{peers.length}</span>
    <CaretRight size={18} aria-hidden="true" />
  </button>;
}

export function RequestsView({ friends, sessionId, onBack, onOpen }: {
  friends: ChatSnapshot["friends"];
  sessionId: string | null;
  onBack: () => void;
  onOpen: (friendId: string) => void;
}) {
  const requests = friends.filter((friend) => isIncoming(friend, sessionId))
    .sort((left, right) => Date.parse(right.requested_at) - Date.parse(left.requested_at));
  return <section className="conversation-view">
    <ConversationHeader title="Friend requests" onBack={onBack} />
    <div className="chat-conversation-surface">
      <ul className="chat-list requests-list" aria-label="Friend requests">
        {requests.map((friend) => <li key={friend.id}><IncomingRequestRow peer={getPeer(friend, sessionId)} sentAt={friend.requested_at} onOpen={() => onOpen(friend.id)} /></li>)}
      </ul>
    </div>
  </section>;
}

function DirectRow({ peer, id, children, open, onReveal, onOpen, busy, onUnfriend, onBlock, onNotice }: {
  peer: Peer; id: string; children: React.ReactNode; open: boolean; onReveal: (open: boolean) => void;
  onOpen: () => void; busy: boolean; onUnfriend: (id: string) => Promise<void>; onBlock: (id: string) => Promise<void>; onNotice: (message: string) => void;
}) {
  const gesture = useRef<{ x: number; y: number; start: number; moved: boolean } | null>(null);
  const lock = useRef(false);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const offset = drag ?? (open ? 144 : 0);
  async function respond(kind: 'unfriend' | 'block') {
    if (lock.current || busy) return;
    if (!window.confirm(kind === 'block' ? `Block ${peer.name}? This ends your friendship and prevents new friend requests between you.` : `Unfriend ${peer.name}? This ends your friendship and removes this conversation.`)) return;
    lock.current = true;
    setPending(true);
    setError('');
    try {
      await (kind === 'block' ? onBlock : onUnfriend)(id);
      onNotice(kind === 'block' ? `Blocked ${peer.name}.` : `You and ${peer.name} are no longer friends.`);
      onReveal(false);
    } catch {
      setError('Couldn’t update this friendship. Try again.');
    } finally { lock.current = false; setPending(false); }
  }
  function finish(cancelled = false) {
    const current = gesture.current;
    gesture.current = null;
    if (!current?.moved) return;
    suppressClick.current = true;
    onReveal(cancelled ? open : offset >= 72);
    setDrag(null);
  }
  return <div className={`dm-swipe-row ${drag !== null ? 'dragging' : ''}`} aria-busy={pending}
    onPointerDown={(event) => {
      if (event.button !== 0 || pending || (event.target as Element).closest('.dm-swipe-actions')) return;
      suppressClick.current = false;
      gesture.current = { x: event.clientX, y: event.clientY, start: open ? 144 : 0, moved: false };
    }}
    onPointerMove={(event) => {
      const current = gesture.current;
      if (!current) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.moved) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) || (!open && dx > 0)) return;
        current.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setDrag(Math.max(0, Math.min(144, current.start - dx)));
    }}
    onPointerUp={() => finish()} onPointerCancel={() => finish(true)}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape') {
        event.preventDefault(); onReveal(event.key === 'ArrowLeft');
      }
    }}>
    <button type="button" className="dm-row-open" style={{ transform: `translateX(${-offset}px)` }} onClick={() => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      if (open) onReveal(false); else onOpen();
    }} aria-label={`Open direct message with ${peer.name}`} aria-expanded={open}>
      {children}
    </button>
    <div className="dm-swipe-actions" aria-hidden={!open} inert={!open}>
      {(['unfriend', 'block'] as const).map((kind, index) => <button key={kind} type="button" className={`dm-swipe-action ${kind}`} disabled={busy || pending} aria-label={`${kind === 'block' ? 'Block' : 'Unfriend'} ${peer.name}`} onClick={() => void respond(kind)}
        style={{ transform: `scale(${Math.max(0, Math.min(1, (offset - (index === 0 ? 48 : 0)) / 96))})` }}>
        <span className="dm-action-circle">{kind === 'block' ? <Prohibit size={24} weight="bold" /> : <UserMinus size={24} weight="fill" />}</span>
        <span>{kind === 'block' ? 'Block' : 'Unfriend'}</span>
      </button>)}
    </div>
    {error && <p className="request-error" role="alert">{error}</p>}
  </div>;
}

export function ChatsOverview(props: LoadingProps | ReadyProps) {
  const [search, setSearch] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const groupId = !props.loading ? props.group?.id : undefined;
  const [expiryNotice, setExpiryNotice] = useState({ groupId, dismissed: false });
  if (expiryNotice.groupId !== groupId) setExpiryNotice({ groupId, dismissed: false });
  const expiryDismissed = expiryNotice.groupId === groupId && expiryNotice.dismissed;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const countdownExpiry = !props.loading && !props.error && props.group && chatNameMatches(props.group.venue.name, normalizedSearch)
    ? props.expiresAt
    : null;
  const accessIndicator = useGroupAccessCountdown(countdownExpiry);

  if (props.loading) return <ChatsLoading {...props} />;

  const {
    group,
    friends,
    directPreviews,
    hasObservedGroup,
    sessionId,
    busy,
    error = "",
    onRetry,
    onScan,
    onOpenGroup,
    onOpenDirect,
    onOpenRequests,
    onRemoveRequest,
    onUnfriend,
    onBlock,
  } = props;
  const query = normalizedSearch;
  const accepted = friends.filter((friend): friend is AcceptedFriend => friend.accepted_at !== null);
  const requests = friends.filter((friend) => friend.accepted_at === null);
  const acceptedWithPeers = accepted.map((friend) => ({ id: friend.id, friend, peer: getPeer(friend, sessionId) }))
    .sort((left, right) => {
      const leftPreview = directPreviews[left.id];
      const rightPreview = directPreviews[right.id];
      const leftMessage = leftPreview?.status === "ready" ? leftPreview.message : null;
      const rightMessage = rightPreview?.status === "ready" ? rightPreview.message : null;
      return directConversationTime(rightMessage, right.friend.accepted_at, right.friend.requested_at)
        - directConversationTime(leftMessage, left.friend.accepted_at, left.friend.requested_at);
    });
  const visibleFriends = acceptedWithPeers.filter(({ peer }) => chatNameMatches(peer.name, query));
  const groupMatches = !!group && chatNameMatches(group.venue.name, query);
  const requestPeers = requests.map((friend) => ({
    friend,
    peer: getPeer(friend, sessionId),
    incoming: isIncoming(friend, sessionId),
  })).filter(({ peer }) => chatNameMatches(peer.name, query))
    .sort((left, right) => Date.parse(right.friend.requested_at) - Date.parse(left.friend.requested_at));
  const incomingPeers = requestPeers.filter(({ incoming }) => incoming);
  const outgoingPeers = requestPeers.filter(({ incoming }) => !incoming);
  const hasSearchMatches = groupMatches || requestPeers.length > 0 || visibleFriends.length > 0;
  const latestGroupMessage = group?.messages.at(-1);
  const groupMessageAge = latestGroupMessage ? messageAge(latestGroupMessage.time) : null;

  return (
    <section className="chats-view">
      <ChatsHeader {...props} />
      <div className="chat-search-field">
        <MagnifyingGlass size={20} aria-hidden="true" />
        <label className="sr-only" htmlFor="chat-search">Search chats and people by name</label>
        <input id="chat-search" type="search" autoCapitalize="none" autoCorrect="off" placeholder="Search chats and people..." value={search} onChange={(event) => { setSearch(event.target.value); setRevealedId(null); }} disabled={!!error} />
        {search && <button type="button" className="clear-chat-search" aria-label="Clear chat search" onClick={() => setSearch("")}><X size={18} /></button>}
      </div>

      <div className="chat-list-scroll">
        {!error && !query && !group && hasObservedGroup && !expiryDismissed && <div className="chat-access-notice" role="status">
          <span>Your group access ended. Your friends and DMs stay.</span>
          <button type="button" className="clear-chat-search" aria-label="Dismiss group access notice" onClick={() => setExpiryNotice({ groupId, dismissed: true })}><X size={18} /></button>
        </div>}
        {error ? <div className="overview-error" role="alert">
          <h2>Couldn’t load your chats.</h2>
          <p>Try again to see your group, requests, and messages.</p>
          <button type="button" className="scan-primary" disabled={busy} onClick={onRetry}>{busy ? "Trying again…" : "Retry"}</button>
        </div> : <>
          <ul className="chat-list" aria-label="Chats and friend requests">
            {group && groupMatches && <li>
              <button type="button" className="group-card" onClick={() => onOpenGroup(group.id)} aria-label={`Open ${group.venue.name}, ${group.members.length} ${group.members.length === 1 ? "member" : "members"}. ${accessIndicator.accessibilityLabel}`}>
                <span className="group-card-main">
                  <span className="group-identity" aria-hidden="true">
                    <span className="group-access-ring">
                      <svg viewBox="0 0 72 72" aria-hidden="true">
                        <circle className="group-access-track" cx="36" cy="36" r="33" />
                        <circle
                          className="group-access-progress"
                          cx="36"
                          cy="36"
                          r="33"
                          strokeDasharray={2 * Math.PI * 33}
                          strokeDashoffset={2 * Math.PI * 33 * (1 - (accessIndicator.progress ?? 0))}
                        />
                      </svg>
                      <span className="group-initials">{groupInitials(group.venue.name)}</span>
                    </span>
                    <span className={`group-expiry ${accessIndicator.state}`}>{accessIndicator.label}</span>
                  </span>
                  <span className="group-copy">
                    <span className="group-title-row">
                      <strong>{group.venue.name}</strong>
                      <span className="group-member-count" aria-hidden="true">{group.members.length}<Users size={18} weight="fill" /></span>
                    </span>
                    <span className="group-meta">
                      <span className="group-author">{latestGroupMessage ? latestGroupMessage.user === sessionId ? "You" : latestGroupMessage.name : props.profileName || "You"}</span>
                      {latestGroupMessage && <><span aria-hidden="true">·</span><time dateTime={new Date(latestGroupMessage.time).toISOString()}>{groupMessageAge === "Now" ? "Now" : `${groupMessageAge} ago`}</time></>}
                    </span>
                    <span className="group-preview-row">
                      <span className="group-preview">
                      {latestGroupMessage
                        ? latestGroupMessage.text
                        : "You’re in. Say hello."}
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            </li>}
            {incomingPeers.length === 1 && <li><IncomingRequestRow peer={incomingPeers[0].peer} sentAt={incomingPeers[0].friend.requested_at} onOpen={() => onOpenDirect(incomingPeers[0].friend.id)} /></li>}
            {incomingPeers.length > 1 && <li><RequestsSummary peers={incomingPeers.map(({ peer }) => peer)} onOpen={onOpenRequests} /></li>}
            {outgoingPeers.map(({ friend, peer }) => <RequestRow key={friend.id} friend={friend} peer={peer} busy={busy} onRemove={onRemoveRequest} onNotice={setNotice} />)}
              {visibleFriends.map(({ id, peer }) => {
                const preview = directPreviews[id];
                const failed = !preview || preview.status === "error";
                const message = preview?.status === "ready" ? preview.message : null;
                const age = message ? messageAge(Date.parse(message.created_at)) : null;
                return (
                  <li className="dm-list-item" key={id}>
                    <DirectRow peer={peer} id={id} open={revealedId === id} onReveal={(open) => setRevealedId(open ? id : null)} onOpen={() => onOpenDirect(id)} busy={busy} onUnfriend={onUnfriend} onBlock={onBlock} onNotice={setNotice}>
                      <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
                      <span className="dm-copy">
                        <strong>{peer.name}</strong>
                        <span className={failed ? "dm-preview dm-preview-error" : "dm-preview"}>
                        {failed ? "Preview unavailable" : directMessagePreview(message, sessionId ?? "")}
                        </span>
                      </span>
                      {age && <time dateTime={message?.created_at}>{age}</time>}
                    </DirectRow>
                    {failed && <button type="button" className="preview-retry" disabled={busy} onClick={onRetry} aria-label={`Retry loading message preview for ${peer.name}`}>Retry</button>}
                  </li>
                );
              })}
          </ul>
          {!hasSearchMatches && (query ? <div className="chat-search-empty" role="status">
            <p>No chats or requests match “{search.trim()}”.</p>
            <button type="button" className="text-button clear-search-button" onClick={() => setSearch("")}>Clear search</button>
          </div> : <div className="chat-list-empty">
            <h2>Your chats start with a scan.</h2>
            <p>Scan a QR code at a venue to join a group and meet people.</p>
            <button type="button" className="scan-primary" disabled={busy} onClick={onScan}>Scan a QR code</button>
          </div>)}
        </>}
      </div>
      {notice && <div className="toast" role="status">{notice}</div>}
    </section>
  );
}
