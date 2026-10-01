"use client";

import type { ChatSnapshot } from "@qr-chat/api";
import { accessTimeRemaining, directConversationTime, directMessagePreview, groupInitials, messageAge } from "@qr-chat/domain";
import { CaretRight, Clock, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";

type FriendConnection = ChatSnapshot["friends"][number];
type AcceptedFriend = FriendConnection & { accepted_at: string };
type Peer = { id: string; name: string; avatarUrl: string | null };

type LoadingProps = { loading: true };
type ReadyProps = {
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
  onScan: () => void;
  onOpenGroup: (groupId: string) => void;
  onOpenDirect: (friendId: string) => void;
  onOpenProfile: (userId: string) => void;
  onAcceptRequest: (friendId: string) => void;
  onRemoveRequest: (friendId: string) => void;
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

function ChatsLoading() {
  return (
    <section className="chats-view chats-loading" aria-busy="true">
      <div className="view-heading">
        <h1>Chats</h1>
        <span className="skeleton-block skeleton-toolbar" aria-hidden="true" />
      </div>
      <section className="group-section" aria-labelledby="loading-group-heading">
        <h2 id="loading-group-heading">Your group</h2>
        <div className="group-card-skeleton">
          <div className="group-card-skeleton-main">
            <span className="skeleton-block group-loading-tile" />
            <span className="group-loading-copy">
              <i className="skeleton-block" />
              <i className="skeleton-block" />
              <i className="skeleton-block" />
            </span>
          </div>
          <div className="group-loading-access">
            <span className="skeleton-block" />
            <i className="skeleton-block" />
          </div>
        </div>
      </section>
      <div className="request-loading-row" aria-hidden="true">
        <span>Friend requests</span>
        <i className="skeleton-block" />
      </div>
      <section className="direct-section" aria-labelledby="loading-direct-heading">
        <div className="section-heading">
          <h2 id="loading-direct-heading">Direct messages</h2>
          <span className="skeleton-block new-message-loading" aria-hidden="true" />
        </div>
        <div className="dm-loading-list" aria-hidden="true">
          {[0, 1, 2].map((item) => <LoadingRow key={item} />)}
        </div>
        <p className="loading-chats-label" role="status">Loading chats…</p>
      </section>
    </section>
  );
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

function RequestRow({
  friend,
  peer,
  incoming,
  busy,
  onOpenProfile,
  onAccept,
  onRemove,
}: {
  friend: FriendConnection;
  peer: Peer;
  incoming: boolean;
  busy: boolean;
  onOpenProfile: (userId: string) => void;
  onAccept: (friendId: string) => void;
  onRemove: (friendId: string) => void;
}) {
  return (
    <div className="friend-request-row">
      <button type="button" className="request-person" onClick={() => onOpenProfile(peer.id)} aria-label={`View ${peer.name}'s profile`}>
        <Avatar name={peer.name} url={peer.avatarUrl} />
        <span><strong>{peer.name}</strong><small>{incoming ? "Wants to be friends" : "Request sent"}</small></span>
      </button>
      <div className="request-actions">
        {incoming && <button type="button" className="request-action" disabled={busy} onClick={() => onAccept(friend.id)} aria-label={`Accept ${peer.name}'s friend request`}>Accept</button>}
        <button type="button" className="request-action quiet" disabled={busy} onClick={() => onRemove(friend.id)} aria-label={incoming ? `Decline ${peer.name}'s friend request` : `Cancel friend request to ${peer.name}`}>
          {incoming ? "Decline" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function NewMessageDialog({
  open,
  friends,
  error,
  busy,
  onClose,
  onRetry,
  onSelect,
}: {
  open: boolean;
  friends: { id: string; peer: Peer }[];
  error: string;
  busy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSelect: (friendId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="new-message-dialog"
      aria-labelledby="new-message-heading"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    >
      <div className="new-message-panel">
        <button type="button" className="modal-close" aria-label="Close new message" onClick={onClose}><X size={20} /></button>
        <h2 id="new-message-heading">New message</h2>
        <p>Choose an accepted friend to start a private chat.</p>
        {error ? (
          <div className="new-message-load-error" role="alert">
            <p>Couldn’t load accepted friends. Retry to choose someone to message.</p>
            <button type="button" className="scan-primary" disabled={busy} onClick={onRetry}>{busy ? "Trying again…" : "Retry"}</button>
          </div>
        ) : friends.length ? (
          <div className="new-message-list">
            {friends.map(({ id, peer }) => (
              <button type="button" className="new-message-person" key={id} onClick={() => onSelect(id)}>
                <Avatar name={peer.name} url={peer.avatarUrl} />
                <span>{peer.name}</span>
                <CaretRight size={19} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : <p className="new-message-empty">No accepted friends yet. Accept a friend request to start a direct message.</p>}
      </div>
    </dialog>
  );
}

export function ChatsOverview(props: LoadingProps | ReadyProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  if (props.loading) return <ChatsLoading />;

  const {
    group,
    friends,
    directPreviews,
    expiresAt,
    hasObservedGroup,
    sessionId,
    busy,
    error = "",
    onRetry,
    onScan,
    onOpenGroup,
    onOpenDirect,
    onOpenProfile,
    onAcceptRequest,
    onRemoveRequest,
  } = props;
  const query = search.trim().toLocaleLowerCase();
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
  const hasSearchMatches = groupMatches || visibleFriends.length > 0;
  const requestPeers = requests.map((friend) => ({
    friend,
    peer: getPeer(friend, sessionId),
    incoming: friend.requested_by_id !== sessionId,
  }));
  const accessRemaining = group ? accessTimeRemaining(expiresAt) : null;

  return (
    <section className="chats-view">
      <div className="view-heading">
        <h1>Chats</h1>
        <button
          type="button"
          className="icon-button search-toggle"
          aria-label={searchOpen ? "Close chat search" : "Search chats"}
          aria-expanded={searchOpen}
          aria-controls="chat-search"
          onClick={() => { setSearchOpen((open) => !open); setSearch(""); }}
        ><MagnifyingGlass size={25} aria-hidden="true" /></button>
      </div>

      {searchOpen && (
        <div className="chat-search-field">
          <MagnifyingGlass size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="chat-search">Search groups and direct messages by name</label>
          <input id="chat-search" type="search" placeholder="Search chats" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <button type="button" className="clear-chat-search" aria-label="Clear chat search" onClick={() => setSearch("")}><X size={18} /></button>}
        </div>
      )}

      {error ? (
        <div className="overview-error" role="alert">
          <h2>Couldn’t load your chats.</h2>
          <p>Try again to see your group, requests, and messages.</p>
          <button type="button" className="scan-primary" disabled={busy} onClick={onRetry}>{busy ? "Trying again…" : "Retry"}</button>
        </div>
      ) : <>
        {(!query || groupMatches) && <section className="group-section" aria-labelledby="your-group-heading">
          <h2 id="your-group-heading">Your group</h2>
          {group ? (
            groupMatches ? (
              <button type="button" className="group-card" onClick={() => onOpenGroup(group.id)} aria-label={`Open ${group.venue.name}, ${group.members.length} members`}>
                <span className="group-card-main">
                  <span className="group-initials" aria-hidden="true">{groupInitials(group.venue.name)}</span>
                  <span className="group-copy">
                    <strong>{group.venue.name}</strong>
                    <span className="group-member-count">{group.members.length} {group.members.length === 1 ? "member" : "members"}</span>
                    <span className="group-preview">
                      {group.messages.at(-1)
                        ? `${group.messages.at(-1)!.user === sessionId ? "You" : group.messages.at(-1)!.name}: ${group.messages.at(-1)!.text}`
                        : "You’re in. Say hello."}
                    </span>
                  </span>
                  <span className="group-card-side">
                    {group.messages.at(-1) && <time dateTime={new Date(group.messages.at(-1)!.time).toISOString()}>{messageAge(group.messages.at(-1)!.time)}</time>}
                    <CaretRight size={20} aria-hidden="true" />
                  </span>
                </span>
                {accessRemaining && <span className="group-access"><Clock size={18} aria-hidden="true" />{accessRemaining}</span>}
              </button>
            ) : null
          ) : hasObservedGroup ? (
            <div className="group-empty-card access-ended-card">
              <strong>Your group access ended</strong>
              <p>Your friends and DMs stay.</p>
              <button type="button" className="scan-primary" disabled={busy} onClick={onScan}>Scan a QR code</button>
            </div>
          ) : query ? null : (
            <div className="group-empty-card no-group-card">
              <strong>No group yet</strong>
              <p>Scan a QR code at a venue to start a group chat.</p>
              <button type="button" className="scan-primary" disabled={busy} onClick={onScan}>Scan a QR code</button>
            </div>
          )}
        </section>}

        <details className="friend-requests">
          <summary>
            <span>Friend requests{requests.length > 0 ? ` (${requests.length})` : ""}</span>
            <CaretRight size={20} aria-hidden="true" />
          </summary>
          <div className="friend-request-list">
            {requestPeers.length ? requestPeers.map(({ friend, peer, incoming }) => (
              <RequestRow
                key={friend.id}
                friend={friend}
                peer={peer}
                incoming={incoming}
                busy={busy}
                onOpenProfile={onOpenProfile}
                onAccept={onAcceptRequest}
                onRemove={onRemoveRequest}
              />
            )) : <p className="requests-empty">No pending friend requests.</p>}
          </div>
        </details>

        <section className="direct-section" aria-labelledby="direct-messages-heading">
          <div className="section-heading">
            <h2 id="direct-messages-heading">Direct messages</h2>
            <button type="button" className="new-message-button" onClick={() => setNewMessageOpen(true)}>New message</button>
          </div>
          {visibleFriends.length ? (
            <ul className="dm-list">
              {visibleFriends.map(({ id, peer }) => {
                const preview = directPreviews[id];
                const failed = !preview || preview.status === "error";
                const message = preview?.status === "ready" ? preview.message : null;
                const age = message ? messageAge(Date.parse(message.created_at)) : null;
                return (
                  <li className="dm-list-item" key={id}>
                    <button type="button" className="dm-row-open" onClick={() => onOpenDirect(id)} aria-label={`Open direct message with ${peer.name}`}>
                      <Avatar name={peer.name} url={peer.avatarUrl} size={56} />
                      <span className="dm-copy">
                        <strong>{peer.name}</strong>
                        <span className={failed ? "dm-preview dm-preview-error" : "dm-preview"}>
                        {failed ? "Could not load message" : directMessagePreview(message, sessionId ?? "")}
                        </span>
                      </span>
                      {age && <time dateTime={message?.created_at}>{age}</time>}
                    </button>
                    {failed && <button type="button" className="preview-retry" disabled={busy} onClick={onRetry} aria-label={`Retry loading message preview for ${peer.name}`}>Retry</button>}
                  </li>
                );
              })}
            </ul>
          ) : !hasSearchMatches && query ? (
            <div className="chat-search-empty" role="status">
              <p>No chats match “{search.trim()}”.</p>
              <button type="button" className="text-button clear-search-button" onClick={() => setSearch("")}>Clear search</button>
            </div>
          ) : accepted.length === 0 ? (
            <p className="direct-empty">Accepted friends appear here so you can pick up a private conversation.</p>
          ) : <p className="direct-empty">No direct messages match “{search.trim()}”.</p>}
        </section>
      </>}

      <NewMessageDialog
        open={newMessageOpen}
        friends={acceptedWithPeers.map(({ id, peer }) => ({ id, peer }))}
        error={error}
        busy={busy}
        onClose={() => setNewMessageOpen(false)}
        onRetry={onRetry}
        onSelect={(friendId) => { setNewMessageOpen(false); onOpenDirect(friendId); }}
      />
    </section>
  );
}
