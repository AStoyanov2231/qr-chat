import { type FormEventHandler } from "react";
import type { Session } from "@qr-chat/domain";
import type { ChatSnapshot } from "@qr-chat/api";
import { Icon } from "@/components/icon";
import { Avatar } from "@/components/avatar";
import type { OutboxItem } from "@/hooks/use-outbox";

type DirectMessage = { id: number; sender_id: string | null; body: string; created_at: string };
type PeerProfile = NonNullable<ChatSnapshot["friends"][number]["user_a"]>;

export function DirectMessageBubble({
  message,
  session,
  peer,
  onOpenProfile,
}: {
  message: DirectMessage;
  session: Pick<Session, "id" | "name" | "avatarUrl"> | null;
  peer: PeerProfile | null;
  onOpenProfile: (userId: string) => void;
}) {
  const own = message.sender_id !== null && message.sender_id === session?.id;
  const peerSender = message.sender_id !== null && message.sender_id === peer?.id;
  const profileId = own ? session?.id : peerSender ? peer?.id : null;
  const authorName = own
    ? session?.name.trim() || "You"
    : peerSender ? peer?.display_name?.trim() || "Friend" : "Former participant";
  const avatarUrl = own ? session?.avatarUrl ?? null : peerSender ? peer?.avatar_url ?? null : null;

  return (
    <article className={own ? "own" : ""}>
      {!own && <button
        className="message-profile"
        aria-label={`View ${authorName}'s profile`}
        disabled={!profileId}
        onClick={() => { if (profileId) onOpenProfile(profileId); }}
      ><Avatar name={authorName} url={avatarUrl} size={44} /></button>}
      <div>
        <p>{message.body}</p>
      </div>
    </article>
  );
}

/** Your just-sent message. A failed one shows a red marker that retries the send. */
export function OutboxBubble({ item, onRetry }: { item: OutboxItem; onRetry: () => void }) {
  return (
    <article className="own">
      {item.failed && <button type="button" className="message-retry" aria-label="Message not sent. Retry" onClick={onRetry}><span aria-hidden="true">!</span></button>}
      <div>
        <p>{item.text}</p>
        {item.failed && <small className="message-failed">Not sent. Tap ! to retry</small>}
      </div>
    </article>
  );
}

export function FirstDirectMessageEmpty({ friendName }: { friendName: string }) {
  return (
    <div className="first-dm-empty">
      <h2>Say hello to {friendName}</h2>
      <p>Send your first message.</p>
    </div>
  );
}

export function DirectMessageComposer({
  draft,
  friendName,
  busy,
  ready,
  loading,
  loadError,
  onChange,
  onSubmit,
}: {
  draft: string;
  friendName: string;
  busy: boolean;
  ready: boolean;
  loading: boolean;
  loadError: string;
  onChange: (draft: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="message-composer" onSubmit={onSubmit}>
      <div className="message-composer-pill">
        <label className="sr-only" htmlFor="direct-message">Direct message</label>
        <input
          id="direct-message"
          value={draft}
          disabled={busy}
          maxLength={4000}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Message ${friendName}…`}
          autoComplete="off"
        />
        <button
          type="submit"
          className="send"
          aria-label="Send direct message"
          disabled={busy || !ready || loading || !!loadError || !draft.trim()}
        ><Icon name="send" size={19} /></button>
      </div>
    </form>
  );
}

export function FriendRequestDecision({ name, avatarUrl, sentAge, busy, onAccept, onDecline, onBlock }: {
  name: string;
  avatarUrl: string | null;
  sentAge: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
}) {
  return <>
    <div className="message-stream">
      <div className="request-hero">
        <Avatar name={name} url={avatarUrl} size={88} />
        <h2>{name}</h2>
        <p>Wants to be friends · {sentAge === "Now" ? "just now" : `${sentAge} ago`}</p>
      </div>
    </div>
    <div className="request-decision" role="group" aria-label="Respond to friend request">
      <p><strong>Let {name} message you?</strong>Accept to start chatting. Declining removes the request.</p>
      <div className="request-decision-actions">
        <button type="button" className="request-action quiet" disabled={busy} onClick={onDecline}>Decline</button>
        <button type="button" className="request-action" disabled={busy} onClick={onAccept}>Accept</button>
      </div>
      <button type="button" className="request-block" disabled={busy} onClick={onBlock}>Block {name}</button>
    </div>
  </>;
}
