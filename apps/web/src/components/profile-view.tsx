"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AvatarUpload } from "@qr-chat/api";
import { Avatar } from "./avatar";
import { prepareAvatar } from "@/lib/avatar";
import { useEdgeColor } from "@/lib/use-edge-color";
import { ArrowLeft, CaretRight, Gear, LockSimple, PencilSimple, Question, X } from "@phosphor-icons/react";
import type { Group, Session } from "@/lib/chat-view";

type Props = {
  session: Session | null;
  group: Group | null;
  ready: boolean;
  busy: boolean;
  onBack?: () => void;
  onSave: (name: string, photo?: AvatarUpload | null) => Promise<boolean | undefined>;
  onLeave: () => void;
  onSignOut: () => void;
};

export function ProfileView({ session, group, ready, busy, onBack, onSave, onLeave, onSignOut }: Props) {
  const [saveFailed, setSaveFailed] = useState(false);
  const [panel, setPanel] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<Blob | null | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [preparing, setPreparing] = useState(false);
  useEdgeColor(session?.avatarColor);
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
    setSaveFailed(false);
    setPanel(title);
    setName(session?.name ?? "");
    dialog.current?.showModal();
  }
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
      <div className="chat-header-title"><h1>{session?.name || "Your profile"}</h1><p>QR Chat member</p></div>
    </header>
    <div className="chat-header-controls"><Link href="/" onClick={(event) => { if (onBack && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onBack(); } }} aria-label="Back to chats"><ArrowLeft size={23} /></Link></div>
    <div className="chat-conversation-surface profile-surface">
      <div className="profile-actions">{actions.map(({ label, panel: title, icon: ActionIcon }) => <button key={title} aria-label={title} onClick={() => open(title)}><span><ActionIcon size={24} /></span>{label}</button>)}</div>
    </div>
    <dialog ref={dialog} className="profile-dialog" aria-label={panel} onCancel={(event) => { if (saving) event.preventDefault(); }} onClick={(event) => { if (event.target === dialog.current && !saving) dialog.current?.close(); }}>
      <div className="entry-panel">
        <button className="modal-close" aria-label="Close" disabled={saving} onClick={() => dialog.current?.close()}><X size={20} /></button>
        <h2>{panel}</h2>
        {panel === "Edit Profile" && <form className="profile-form" onSubmit={async (event) => {
          event.preventDefault(); if (saving || submitting.current) return;
          submitting.current = true; setPreparing(true); setSaveFailed(false); setPhotoError("");
          try {
            const upload = photo ? { uploadId: crypto.randomUUID(), data: await photo.arrayBuffer() } : photo;
            if (await onSave(name, upload)) { setPhoto(undefined); setPreview(null); dialog.current?.close(); } else setSaveFailed(true);
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
            {avatar && <div className="hero-guide" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(avatar)})`, "--k": 240 / window.innerWidth } as CSSProperties} />}
            <small>{preparing ? "Preparing photo…" : avatar ? "On your profile, the top of your photo fades into colour above the line. Keep your face below it." : "Your photo appears in chats and profiles."}</small>
            {photoError && <p className="form-error" role="alert">{photoError}</p>}
          </div>
          <label htmlFor="profile-name">Display name</label><input id="profile-name" maxLength={50} value={name} onChange={(event) => setName(event.target.value)} disabled={!ready || saving} required />
          <button className="scan-primary" disabled={!ready || saving || !name.trim()}>{saving ? "Please wait…" : "Save profile"}</button>{saveFailed && <p className="form-error" role="alert">Could not save your profile. Please try again.</p>}
        </form>}
        {panel === "Settings" && <div className="settings-actions">{group && <button className="profile-action danger" disabled={busy} onClick={onLeave}>Leave current chat<CaretRight size={18} /></button>}<button className="profile-action danger" disabled={busy} onClick={onSignOut}>Sign out<CaretRight size={18} /></button></div>}
        {panel === "Privacy" && <p>Group messages are available to members with active access. Your name and photo are visible to people in your group and your friends. Direct messages are shared with accepted friends. Group access ends after 24 hours; leaving or joining another group also ends that access.</p>}
        {panel === "Help & Feedback" && <p>Tap the scan button at the bottom of Chats to scan a QR code, then join the group. You can be in one group at a time. To keep talking after group access ends, open a member’s profile and send a friend request. If the camera is blocked, allow camera access in your browser’s settings and try again.</p>}
      </div>
    </dialog>
  </section>;
}
