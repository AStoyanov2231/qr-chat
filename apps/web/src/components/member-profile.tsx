"use client";

import { useEffect, useRef } from "react";
import type { Member } from "@qr-chat/domain";
import { friendshipState } from "@qr-chat/domain";
import type { ChatSnapshot } from "@qr-chat/api";
import { Avatar } from "./avatar";
import { Icon } from "./icon";

type Props = {
  person: Member | null;
  friend?: ChatSnapshot["friends"][number];
  userId: string;
  canRequest: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onRequest: () => void;
  onAccept: () => void;
  onRemove: () => void;
  onMessage: () => void;
};

export function MemberProfile({ person, friend, userId, canRequest, busy, error, onClose, onRequest, onAccept, onRemove, onMessage }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const relationship = friendshipState(friend, userId);
  return <dialog ref={dialog} className="profile-dialog" aria-label="Member profile" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === dialog.current && !busy) onClose(); }}>
    <div className="entry-panel member-profile">
      <button className="modal-close" aria-label="Close profile" disabled={busy} onClick={onClose}><Icon name="close" size={20} /></button>
      {person ? <>
        <div className="member-hero" style={person.avatarUrl ? { backgroundImage: `linear-gradient(rgba(10,20,30,.2),rgba(10,20,30,.38)),url(${JSON.stringify(person.avatarUrl)})` } : undefined}>
          {!person.avatarUrl && <Avatar name={person.name} url={null} size={96} />}
          <h2>{person.name}</h2>
          <p>{relationship === "accepted" ? "Friend" : "QR Chat member"}</p>
        </div>
        {relationship === "accepted" ? <button className="scan-primary" disabled={busy} onClick={onMessage}>Message</button>
          : relationship === "incoming" ? <>
            <p>{person.name} wants to be friends. Accept to start a private conversation.</p>
            <button className="scan-primary" disabled={busy} onClick={onAccept}>{busy ? "Updating…" : "Accept"}</button>
            <button className="text-button" disabled={busy} onClick={onRemove}>Decline</button>
          </> : relationship === "outgoing" ? <>
            <p role="status">Request sent. You can message after they accept.</p>
            <button className="text-button" disabled={busy} onClick={onRemove}>Cancel request</button>
          </> : canRequest ? <>
            <button className="scan-primary" disabled={busy} onClick={onRequest}>{busy ? "Sending…" : "Add friend"}</button>
            <p>You can message privately after they accept.</p>
          </> : <p>Scan the same venue QR code to connect.</p>}
      </> : <p>This profile is no longer available.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </dialog>;
}
