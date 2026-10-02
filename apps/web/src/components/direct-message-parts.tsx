import { type FormEventHandler } from "react";
import type { Session } from "@qr-chat/domain";
import type { ChatSnapshot } from "@qr-chat/api";
import { Icon } from "@/components/icon";
import { Avatar } from "@/components/avatar";

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
  sending,
  ready,
  loading,
  loadError,
  sendError,
  onChange,
  onSubmit,
}: {
  draft: string;
  friendName: string;
  busy: boolean;
  sending: boolean;
  ready: boolean;
  loading: boolean;
  loadError: string;
  sendError: string;
  onChange: (draft: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="message-composer" onSubmit={onSubmit} aria-busy={sending}>
      <div className="message-composer-pill">
        <label className="sr-only" htmlFor="direct-message">Direct message</label>
        <input
          id="direct-message"
          value={draft}
          disabled={busy || sending}
          maxLength={4000}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Message ${friendName}…`}
          autoComplete="off"
        />
        <button
          type="submit"
          className="send"
          aria-label={sending ? "Sending direct message" : "Send direct message"}
          disabled={busy || sending || !ready || loading || !!loadError || !draft.trim()}
        >{sending ? <span className="send-spinner" aria-hidden="true" /> : <Icon name="send" size={19} />}</button>
      </div>
      {sendError && <p className="composer-error" role="alert">{sendError}</p>}
    </form>
  );
}
