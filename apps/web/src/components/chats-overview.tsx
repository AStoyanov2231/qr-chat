"use client";

import Image from "next/image";
import type { ChatSnapshot } from "@qr-chat/api";
import { chatRows, directMessagePreview, groupAccessIndicator, groupInitials, messageAge, type Group } from "@qr-chat/domain";
import { MagnifyingGlass, Prohibit, SignOut, UserMinus, UserPlus, Users, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Avatar } from "./avatar";

type FriendConnection = ChatSnapshot["friends"][number];
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
  groups: ChatSnapshot["groups"];
  friends: ChatSnapshot["friends"];
  directPreviews: ChatSnapshot["directPreviews"];
  unread?: ChatSnapshot["unread"];
  hasObservedGroup: boolean;
  sessionId: string | null;
  busy: boolean;
  error?: string;
  onRetry: () => void;
  onScan: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenDirect: (friendId: string) => void;
  onRemoveRequest: (friendId: string) => Promise<void>;
  onUnfriend: (friendId: string) => Promise<void>;
  onBlock: (friendId: string) => Promise<void>;
  onLeaveGroup: (groupId: string) => Promise<void>;
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
        {[0, 1, 2, 3, 4].map((item) => <LoadingRow key={item} />)}
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

const unreadLabel = (count: number) => `${count > 99 ? "99+" : count} unread ${count === 1 ? "message" : "messages"}`;
function UnreadBadge({ count }: { count: number }) {
  return count ? <span className="unread-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span> : null;
}

function GroupCard({ group, unread, sessionId, profileName, open, onReveal, onOpen, busy, onLeave, onNotice }: {
  group: Group; unread: number; sessionId: string | null; profileName?: string; open: boolean; onReveal: (open: boolean) => void;
  onOpen: () => void; busy: boolean; onLeave: (groupId: string) => Promise<void>; onNotice: (message: string) => void;
}) {
  const accessIndicator = useGroupAccessCountdown(group.expiresAt);
  const latestGroupMessage = group.messages.at(-1);
  const groupMessageAge = latestGroupMessage ? messageAge(latestGroupMessage.time) : null;
  return <SwipeRow className="group-card" label={`Open ${group.venue.name}, ${group.members.length} ${group.members.length === 1 ? "member" : "members"}. ${accessIndicator.accessibilityLabel}${unread ? ` ${unreadLabel(unread)}.` : ""}`} actionsLabel={group.venue.name}
    open={open} onReveal={onReveal} onOpen={onOpen} busy={busy} onNotice={onNotice} errorText="Couldn’t leave this group. Try again."
    actions={[{ kind: "leave", label: "Leave", danger: true, icon: <SignOut size={24} weight="bold" />, confirm: `Leave ${group.venue.name}? You can join again by scanning its QR code.`, run: () => onLeave(group.id), notice: `You left ${group.venue.name}.` }]}>
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
          {group.venue.imageUrl
            ? <Image className="group-initials" src={group.venue.imageUrl} alt="" width={44} height={44} unoptimized />
            : <span className="group-initials">{groupInitials(group.venue.name)}</span>}
        </span>
        <span className={`group-expiry ${accessIndicator.state}`}>{accessIndicator.label}</span>
      </span>
      <span className="group-copy">
        <span className="group-title-row">
          <strong>{group.venue.name}</strong>
          <span className="group-member-count" aria-hidden="true">{group.members.length}<Users size={18} weight="fill" /></span>
        </span>
        <span className="group-meta">
          <span className="group-author">{latestGroupMessage ? latestGroupMessage.user === sessionId ? "You" : latestGroupMessage.name : profileName || "You"}</span>
          {latestGroupMessage && <><span aria-hidden="true">·</span><time dateTime={new Date(latestGroupMessage.time).toISOString()}>{groupMessageAge === "Now" ? "Now" : `${groupMessageAge} ago`}</time></>}
        </span>
        <span className="group-preview-row">
          <span className={unread ? "group-preview preview-unread" : "group-preview"}>
          {latestGroupMessage
            ? latestGroupMessage.text
            : "You’re in. Say hello."}
          </span>
          <UnreadBadge count={unread} />
        </span>
      </span>
    </span>
  </SwipeRow>;
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
      <span className="request-identity"><Avatar name={peer.name} url={peer.avatarUrl} size={52} /><span className="request-marker" aria-hidden="true"><UserPlus size={13} weight="fill" /></span></span>
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

type SwipeAction = { kind: string; label: string; icon: React.ReactNode; danger?: boolean; confirm: string; run: () => Promise<void>; notice: string };

function SwipeRow({ label, actionsLabel, className, children, open, onReveal, onOpen, busy, actions, errorText, onNotice }: {
  label: string; actionsLabel: string; className?: string; children: React.ReactNode; open: boolean; onReveal: (open: boolean) => void;
  onOpen: () => void; busy: boolean; actions: SwipeAction[]; errorText: string; onNotice: (message: string) => void;
}) {
  const width = actions.length * 72;
  const gesture = useRef<{ x: number; y: number; start: number; moved: boolean } | null>(null);
  const lock = useRef(false);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const offset = drag ?? (open ? width : 0);
  async function respond(action: SwipeAction) {
    if (lock.current || busy) return;
    if (!window.confirm(action.confirm)) return;
    lock.current = true;
    setPending(true);
    setError('');
    try {
      await action.run();
      onNotice(action.notice);
      onReveal(false);
    } catch {
      setError(errorText);
    } finally { lock.current = false; setPending(false); }
  }
  function finish(cancelled = false) {
    const current = gesture.current;
    gesture.current = null;
    if (!current?.moved) return;
    suppressClick.current = true;
    onReveal(cancelled ? open : offset >= width / 2);
    setDrag(null);
  }
  return <><div className={`dm-swipe-row ${drag !== null ? 'dragging' : ''}`} aria-busy={pending}
    onPointerDown={(event) => {
      if (event.button !== 0 || pending || (event.target as Element).closest('.dm-swipe-actions')) return;
      suppressClick.current = false;
      gesture.current = { x: event.clientX, y: event.clientY, start: open ? width : 0, moved: false };
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
      setDrag(Math.max(0, Math.min(width, current.start - dx)));
    }}
    onPointerUp={() => finish()} onPointerCancel={() => finish(true)}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape') {
        event.preventDefault(); onReveal(event.key === 'ArrowLeft');
      }
    }}>
    <button type="button" className={`dm-row-open ${className ?? ''}`} style={{ transform: `translateX(${-offset}px)` }} onClick={() => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      if (open) onReveal(false); else onOpen();
    }} aria-label={label} aria-expanded={open}>
      {children}
    </button>
    <div className="dm-swipe-actions" aria-hidden={!open} inert={!open}>
      {actions.map((action, index) => <button key={action.kind} type="button" className={`dm-swipe-action ${action.danger ? 'danger' : ''}`} disabled={busy || pending} aria-label={`${action.label} ${actionsLabel}`} onClick={() => void respond(action)}
        style={{ transform: `scale(${Math.max(0, Math.min(1, (offset - (actions.length - 1 - index) * 48) / Math.min(96, width)))})` }}>
        <span className="dm-action-circle">{action.icon}</span>
        <span>{action.label}</span>
      </button>)}
    </div>
  </div>
  {error && <p className="request-error" role="alert">{error}</p>}</>;
}

export function ChatsOverview(props: LoadingProps | ReadyProps) {
  const [search, setSearch] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const hasGroups = !props.loading && props.groups.length > 0;
  const [expiryNotice, setExpiryNotice] = useState({ hasGroups, dismissed: false });
  if (expiryNotice.hasGroups !== hasGroups) setExpiryNotice({ hasGroups, dismissed: false });
  const expiryDismissed = expiryNotice.hasGroups === hasGroups && expiryNotice.dismissed;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (props.loading) return <ChatsLoading {...props} />;

  const {
    groups,
    friends,
    directPreviews,
    unread = {},
    hasObservedGroup,
    sessionId,
    busy,
    error = "",
    onRetry,
    onScan,
    onOpenGroup,
    onOpenDirect,
    onRemoveRequest,
    onUnfriend,
    onBlock,
    onLeaveGroup,
  } = props;
  const query = search.trim().toLocaleLowerCase();
  const rows = chatRows(groups, friends, directPreviews)
    .filter((row) => chatNameMatches(row.kind === "group" ? row.group.venue.name : getPeer(row.friend, sessionId).name, query));

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
        {!error && !query && !hasGroups && hasObservedGroup && !expiryDismissed && <div className="chat-access-notice" role="status">
          <span>Your group access ended. Your friends and DMs stay.</span>
          <button type="button" className="clear-chat-search" aria-label="Dismiss group access notice" onClick={() => setExpiryNotice({ hasGroups, dismissed: true })}><X size={18} /></button>
        </div>}
        {error ? <div className="overview-error" role="alert">
          <h2>Couldn’t load your chats.</h2>
          <p>Try again to see your groups, requests, and messages.</p>
          <button type="button" className="scan-primary" disabled={busy} onClick={onRetry}>{busy ? "Trying again…" : "Retry"}</button>
        </div> : <>
          <ul className="chat-list" aria-label="Chats and friend requests">
            {rows.map((row) => {
              if (row.kind === "group") return <li className="dm-list-item" key={row.id}><GroupCard group={row.group} unread={unread[row.id] ?? 0} sessionId={sessionId} profileName={props.profileName} open={revealedId === row.id} onReveal={(open) => setRevealedId(open ? row.id : null)} onOpen={() => onOpenGroup(row.id)} busy={busy} onLeave={onLeaveGroup} onNotice={setNotice} /></li>;
              const { friend } = row;
              const peer = getPeer(friend, sessionId);
              if (row.kind === "request") return isIncoming(friend, sessionId)
                ? <li key={row.id}><IncomingRequestRow peer={peer} sentAt={friend.requested_at} onOpen={() => onOpenDirect(row.id)} /></li>
                : <RequestRow key={row.id} friend={friend} peer={peer} busy={busy} onRemove={onRemoveRequest} onNotice={setNotice} />;
              const preview = directPreviews[row.id];
              const failed = !preview || preview.status === "error";
              const message = preview?.status === "ready" ? preview.message : null;
              const age = message ? messageAge(Date.parse(message.created_at)) : null;
              const unreadCount = failed ? 0 : unread[row.id] ?? 0;
              return (
                <li className="dm-list-item" key={row.id}>
                  <SwipeRow label={`Open direct message with ${peer.name}${unreadCount ? `, ${unreadLabel(unreadCount)}` : ""}`} actionsLabel={peer.name} open={revealedId === row.id} onReveal={(open) => setRevealedId(open ? row.id : null)} onOpen={() => onOpenDirect(row.id)} busy={busy} onNotice={setNotice} errorText="Couldn’t update this friendship. Try again."
                    actions={[
                      { kind: "unfriend", label: "Unfriend", icon: <UserMinus size={24} weight="fill" />, confirm: `Unfriend ${peer.name}? This ends your friendship and removes this conversation.`, run: () => onUnfriend(row.id), notice: `You and ${peer.name} are no longer friends.` },
                      { kind: "block", label: "Block", danger: true, icon: <Prohibit size={24} weight="bold" />, confirm: `Block ${peer.name}? This ends your friendship and prevents new friend requests between you.`, run: () => onBlock(row.id), notice: `Blocked ${peer.name}.` },
                    ]}>
                    <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
                    <span className="dm-copy">
                      <strong>{peer.name}</strong>
                      <span className="preview-row">
                        <span className={failed ? "dm-preview dm-preview-error" : unreadCount ? "dm-preview preview-unread" : "dm-preview"}>
                        {failed ? "Preview unavailable" : directMessagePreview(message, sessionId ?? "")}
                        </span>
                        <UnreadBadge count={unreadCount} />
                      </span>
                    </span>
                    {age && <time dateTime={message?.created_at}>{age}</time>}
                  </SwipeRow>
                  {failed && <button type="button" className="preview-retry" disabled={busy} onClick={onRetry} aria-label={`Retry loading message preview for ${peer.name}`}>Retry</button>}
                </li>
              );
            })}
          </ul>
          {!rows.length && (query ? <div className="chat-search-empty" role="status">
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
