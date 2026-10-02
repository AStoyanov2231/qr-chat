"use client";

import type { ChatSnapshot } from "@qr-chat/api";
import { directConversationTime, directMessagePreview, groupAccessIndicator, groupInitials, messageAge } from "@qr-chat/domain";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Avatar } from "./avatar";

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
      <section className="group-section" aria-labelledby="loading-group-heading">
        <h2 id="loading-group-heading">Active group</h2>
        <div className="group-card-skeleton">
          <div className="group-card-skeleton-main">
            <span className="group-loading-identity">
              <i className="skeleton-block group-loading-ring" />
            </span>
            <span className="group-loading-copy">
              <span className="group-loading-title"><i className="skeleton-block" /><i className="skeleton-block" /></span>
              <span className="skeleton-block group-loading-meta" />
              <span className="group-loading-preview"><i className="skeleton-block" /></span>
            </span>
          </div>
        </div>
      </section>
      <section className="request-section" aria-hidden="true">
        <h2>Friend requests</h2>
        <div className="skeleton-block request-loading-card" />
      </section>
      <section className="direct-section" aria-labelledby="loading-direct-heading">
        <div className="section-heading">
          <h2 id="loading-direct-heading">Direct messages</h2>
        </div>
        <div className="dm-loading-list" aria-hidden="true">
          {[0, 1, 2].map((item) => <LoadingRow key={item} />)}
        </div>
        <p className="loading-chats-label" role="status">Loading chats…</p>
      </section>
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

export function ChatsOverview(props: LoadingProps | ReadyProps) {
  const [search, setSearch] = useState("");
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
    onOpenProfile,
    onAcceptRequest,
    onRemoveRequest,
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
  const hasSearchMatches = groupMatches || visibleFriends.length > 0;
  const requestPeers = requests.map((friend) => ({
    friend,
    peer: getPeer(friend, sessionId),
    incoming: friend.requested_by_id !== sessionId,
  }));
  const latestGroupMessage = group?.messages.at(-1);

  return (
    <section className="chats-view">
      <ChatsHeader {...props} />
      <div className="chat-search-field">
        <MagnifyingGlass size={20} aria-hidden="true" />
        <label className="sr-only" htmlFor="chat-search">Search groups and direct messages by name</label>
        <input id="chat-search" type="search" placeholder="Search groups or people..." value={search} onChange={(event) => setSearch(event.target.value)} disabled={!!error} />
        {search && <button type="button" className="clear-chat-search" aria-label="Clear chat search" onClick={() => setSearch("")}><X size={18} /></button>}
      </div>

      {error ? (
        <div className="overview-error" role="alert">
          <h2>Couldn’t load your chats.</h2>
          <p>Try again to see your group, requests, and messages.</p>
          <button type="button" className="scan-primary" disabled={busy} onClick={onRetry}>{busy ? "Trying again…" : "Retry"}</button>
        </div>
      ) : <>
        {(!query || groupMatches) && <section className="group-section" aria-labelledby="your-group-heading">
          <h2 id="your-group-heading">Active group</h2>
          {group ? (
            groupMatches ? (
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
                  </span>
                  <span className="group-copy">
                    <span className="group-title-row">
                      <strong>{group.venue.name}</strong>
                      {latestGroupMessage && <time dateTime={new Date(latestGroupMessage.time).toISOString()}>{messageAge(latestGroupMessage.time)}</time>}
                    </span>
                    <span className="group-meta">
                      <span>{group.members.length} {group.members.length === 1 ? "member" : "members"}</span>
                      <span aria-hidden="true"> · </span>
                      <span className={`group-expiry ${accessIndicator.state}`}>{accessIndicator.state === "remaining" ? `Expires in ${accessIndicator.label.replace(" left", "")}` : accessIndicator.label}</span>
                    </span>
                    <span className="group-preview-row">
                      <span className="group-preview">
                      {latestGroupMessage
                        ? `${latestGroupMessage.user === sessionId ? "You" : latestGroupMessage.name}: ${latestGroupMessage.text}`
                        : "You’re in. Say hello."}
                      </span>
                    </span>
                  </span>
                </span>
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

        <section className="request-section" aria-labelledby="friend-requests-heading">
          <h2 id="friend-requests-heading">Friend requests</h2>
          <details className="friend-requests">
            <summary aria-label={`Friend requests (${requests.length})`}>
              <span className="request-avatar-stack" aria-hidden="true">
                {requestPeers.length ? requestPeers.slice(0, 3).map(({ friend, peer }) => <Avatar key={friend.id} name={peer.name} url={peer.avatarUrl} size={34} />) : <Avatar name="?" size={34} />}
              </span>
              <span className="request-summary-copy"><strong>Friend requests</strong><small>{requests.length ? `${requests.length} pending ${requests.length === 1 ? "request" : "requests"}` : "No pending requests"}</small></span>
              <span className={`request-count ${requests.length ? "" : "empty"}`} aria-hidden="true">{requests.length}</span>
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
        </section>

        <section className="direct-section" aria-labelledby="direct-messages-heading">
          <div className="section-heading">
            <h2 id="direct-messages-heading">Direct messages</h2>
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
                      <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
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
            <p className="direct-empty">Accepted friends appear here so you can start a private conversation.</p>
          ) : <p className="direct-empty">No direct messages match “{search.trim()}”.</p>}
        </section>
      </>}

    </section>
  );
}
