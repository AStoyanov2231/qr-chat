import { type FormEventHandler } from "react";
import { Icon } from "@/components/icon";

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
      ><Icon name="arrow" size={18} /></button>
      {sendError && <p className="composer-error" role="alert">{sendError}</p>}
    </form>
  );
}
