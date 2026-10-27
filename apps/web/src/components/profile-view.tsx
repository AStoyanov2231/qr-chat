"use client";

import Link from "next/link";
import { ClearButton } from "@/components/clear-button";
import { useEffect, useRef, useState } from "react";
import type { AvatarUpload } from "@qr-chat/api";
import { Avatar } from "./avatar";
import { prepareAvatar } from "@/lib/avatar";
import { ArrowLeft, CaretRight, Gear, LockSimple, PencilSimple, Question, Storefront, X } from "@phosphor-icons/react";
import type { Member } from "@qr-chat/domain";
import type { Session } from "@/lib/chat-view";

type Props = {
  session: Session | null;
  ready: boolean;
  busy: boolean;
  business?: boolean;
  onBack?: () => void;
  /** These resolve to an error message ("" on success) so it can show inside the dialog, above the toast. */
  onSave: (name: string, photo?: AvatarUpload | null) => Promise<string>;
  onSignOut: () => Promise<string>;
  onDeleteAccount: () => Promise<string>;
  /** People you blocked, listed under Settings → Blocked people. */
  blocked: Member[];
  onUnblock: (id: string) => Promise<string>;
};

export function ProfileView({ session, ready, busy, business, onBack, onSave, onSignOut, onDeleteAccount, blocked, onUnblock }: Props) {
  const [error, setError] = useState("");
  const [panel, setPanel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<Blob | null | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const selection = useRef(0);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);
  useEffect(() => () => { ++selection.current; }, []);
  const avatar = photo === undefined ? session?.avatarUrl : photo === null ? null : preview;
  const saving = busy || preparing;
  function open(title: string) {
    ++selection.current;
    setPhoto(undefined); setPreview(null); setPhotoError(""); setPreparing(false);
    setError(""); setConfirmDelete(false);
    setPanel(title);
    setName(session?.name ?? "");
    dialog.current?.showModal();
  }
  const run = async (action: () => Promise<string>) => { setError(""); setError(await action()); };
  const actions = [
    { label: "Edit", panel: "Edit Profile", icon: PencilSimple },
    { label: "Settings", panel: "Settings", icon: Gear },
    { label: "Privacy", panel: "Privacy", icon: LockSimple },
    { label: "Help", panel: "Help & Feedback", icon: Question },
  ];
  return <section className="conversation-view profile-view">
    {/* The photo header mirrors group chats: your avatar fills it, controls float above. */}
    <header className="chat-photo-header">
      <div className="chat-header-backdrop" aria-hidden="true" style={session?.avatarUrl ? { backgroundImage: `linear-gradient(rgba(10,20,30,.2),rgba(10,20,30,.38)),url(${JSON.stringify(session.avatarUrl)})` } : undefined} />
      <div className="chat-header-title"><h1>{session?.name || "Your profile"}</h1></div>
    </header>
    <div className="chat-header-controls"><Link href="/" className="back-button" onClick={(event) => { if (onBack && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onBack(); } }} aria-label="Back to chats"><ArrowLeft size={20} weight="bold" /></Link></div>
    <div className="chat-conversation-surface profile-surface">
      <div className="profile-actions">{actions.map(({ label, panel: title, icon: ActionIcon }) => <button key={title} aria-label={title} disabled={title === "Edit Profile" && !session} onClick={() => open(title)}><ActionIcon size={28} />{label}</button>)}
        {business && <Link href="/business"><Storefront size={28} />Business</Link>}</div>
    </div>
    <dialog ref={dialog} className="profile-dialog" aria-label={panel} onCancel={(event) => { if (saving) event.preventDefault(); }} onClick={(event) => { if (event.target === dialog.current && !saving) dialog.current?.close(); }}>
      <div className="entry-panel">
        <button className="modal-close" aria-label="Close" disabled={saving} onClick={() => dialog.current?.close()}><X size={20} /></button>
        <h2>{panel}</h2>
        {panel === "Edit Profile" && <form className="profile-form" onSubmit={async (event) => {
          event.preventDefault(); if (saving || submitting.current) return;
          submitting.current = true; setPreparing(true); setError(""); setPhotoError("");
          try {
            const upload = photo ? { uploadId: crypto.randomUUID(), data: await photo.arrayBuffer() } : photo;
            const message = await onSave(name, upload);
            if (message) setError(message); else { setPhoto(undefined); setPreview(null); dialog.current?.close(); }
          } catch { setPhotoError("Could not read this photo. Please choose it again."); }
          finally { submitting.current = false; setPreparing(false); }
        }}>
          <div className="avatar-editor"><Avatar name={name} url={avatar} size={100} />
            <label htmlFor="profile-photo">Choose photo</label>
            <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!ready || saving} onChange={async (event) => {
              const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
              const ticket = ++selection.current;
              setPreparing(true); setPhotoError("");
              try { const prepared = await prepareAvatar(file); if (ticket === selection.current) { setPhoto(prepared); setPreview(URL.createObjectURL(prepared)); } }
              catch (reason) { if (ticket === selection.current) setPhotoError(reason instanceof Error ? reason.message : "Could not open this photo."); }
              finally { if (ticket === selection.current) setPreparing(false); }
            }} />
            {avatar && <button type="button" className="text-button" disabled={saving} onClick={() => { setPhoto(null); setPreview(null); }}>Remove photo</button>}
            <small>{preparing ? "Preparing photo…" : "Your photo appears in chats and profiles."}</small>
            {photoError && <p className="form-error" role="alert">{photoError}</p>}
          </div>
          <label htmlFor="profile-name">Display name</label><div className="clear-field"><input id="profile-name" maxLength={50} placeholder=" " value={name} onChange={(event) => setName(event.target.value)} disabled={!ready || saving} required /><ClearButton label="Clear display name" inputId="profile-name" disabled={!ready || saving} onClear={() => setName("")} /></div>
          <button className="scan-primary" disabled={!ready || saving || !name.trim()}>{saving ? "Please wait…" : "Save profile"}</button>{error && <p className="form-error" role="alert">{error}</p>}
        </form>}
        {panel === "Settings" && <div className="settings-actions"><button className="profile-action" onClick={() => { setError(""); setPanel("Blocked people"); }}>Blocked people<CaretRight size={18} /></button>
          <button className="profile-action danger" disabled={busy} onClick={() => void run(onSignOut)}>Sign out<CaretRight size={18} /></button>
          {confirmDelete
            ? <><p>This permanently erases your profile, photo, friendships and the messages you sent. It cannot be undone.</p>
              <button className="profile-action danger" disabled={busy} onClick={() => void run(onDeleteAccount)}>Yes, delete my account<CaretRight size={18} /></button>
              <button className="text-button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></>
            : <button className="profile-action danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete account<CaretRight size={18} /></button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <p>Product data and photos © <a href="https://openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> contributors, under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a> and <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA</a> licenses.</p></div>}
        {panel === "Blocked people" && <div className="blocked-list settings-actions">
          {blocked.length ? blocked.map((person) => <div className="member-row" key={person.id}><Avatar name={person.name} url={person.avatarUrl} size={44} /><span>{person.name}</span><button className="text-button" disabled={busy} onClick={() => void run(() => onUnblock(person.id))}>Unblock</button></div>)
            : <p>You haven’t blocked anyone.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>}
        {panel === "Privacy" && <><p>Group messages are available to members with active access. Your name and photo are visible to people in your group and your friends. Direct messages are shared with accepted friends. Each group’s access ends 24 hours after you join it; leaving a group also ends that access.</p>
          <p><Link href="/privacy">Read the full Privacy Policy</Link></p></>}
        {panel === "Help & Feedback" && <p>Tap the scan button at the bottom of Chats to scan a QR code or a product barcode, then join the group. You can be in as many groups as you scan; each one lasts 24 hours. To keep talking after group access ends, open a member’s profile and send a friend request. If the camera is blocked, allow camera access in your browser’s settings and try again.</p>}
      </div>
    </dialog>
  </section>;
}
