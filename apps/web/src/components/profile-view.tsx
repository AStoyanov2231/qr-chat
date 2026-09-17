"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Bell, BookmarkSimple, CaretRight, Gear, LockSimple, PencilSimple, Question, User, X } from "@phosphor-icons/react";
import type { Group, Session } from "@/lib/chat-view";

type Props = {
  session: Session | null;
  group: Group | null;
  ready: boolean;
  busy: boolean;
  onSave: (name: string) => Promise<boolean | undefined>;
  onLeave: () => void;
  onSignOut: () => void;
};

export function ProfileView({ session, group, ready, busy, onSave, onLeave, onSignOut }: Props) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [panel, setPanel] = useState("");
  const [name, setName] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  function open(title: string) {
    setSaveFailed(false);
    setPanel(title);
    setName(session?.name ?? "");
    dialog.current?.showModal();
  }
  const rows = [
    { label: "Saved Places", icon: BookmarkSimple },
    { label: "Notifications", icon: Bell },
    { label: "Privacy", icon: LockSimple },
    { label: "Help & Feedback", icon: Question },
  ];
  return <section className="profile-view">
    <div className="profile-toolbar"><button className="icon-button" aria-label="Settings" onClick={() => open("Settings")}><Gear size={26} /></button></div>
    <div className="profile-identity">
      <div className="avatar-wrap"><span className="profile-avatar">{session?.avatarUrl && session.avatarUrl !== failedAvatar ? <Image src={session.avatarUrl} alt="" width={130} height={130} unoptimized onError={() => setFailedAvatar(session.avatarUrl ?? null)} /> : <User size={70} weight="light" />}</span><button className="avatar-edit" aria-label="Edit profile" onClick={() => open("Edit Profile")}><PencilSimple size={20} /></button></div>
      <strong>{session?.name || "Your profile"}</strong>
      <small>QR Chat member</small>
    </div>
    <div className="profile-stats">
      <div><strong>{group ? 1 : 0}</strong><span>Groups</span></div>
      <div title="Lifetime message totals are not available yet"><strong>-</strong><span>Messages</span></div>
      <div title="Saved places are not available yet"><strong>-</strong><span>Places</span></div>
    </div>
    <button className="profile-menu-row edit-profile-row" onClick={() => open("Edit Profile")}><User size={25} /><span>Edit Profile</span><CaretRight size={19} /></button>
    <div className="profile-menu">{rows.map(({ label, icon: RowIcon }) => <button key={label} className="profile-menu-row" onClick={() => open(label)}><RowIcon size={25} /><span>{label}</span><CaretRight size={19} /></button>)}</div>
    <dialog ref={dialog} className="profile-dialog" aria-label={panel} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <div className="entry-panel">
        <button className="modal-close" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20} /></button>
        <h2>{panel}</h2>
        {panel === "Edit Profile" && <form className="profile-form" onSubmit={async (event) => { event.preventDefault(); setSaveFailed(false); if (await onSave(name)) dialog.current?.close(); else setSaveFailed(true); }}><label htmlFor="profile-name">Display name</label><input id="profile-name" maxLength={50} value={name} onChange={(event) => setName(event.target.value)} disabled={!ready || busy} required /><button className="scan-primary" disabled={!ready || busy || !name.trim()}>Save profile</button>{saveFailed && <p className="form-error" role="alert">Could not save your profile. Please try again.</p>}</form>}
        {panel === "Settings" && <div className="settings-actions">{group && <button className="profile-action danger" disabled={busy} onClick={onLeave}>Leave current chat<CaretRight size={18} /></button>}<button className="profile-action danger" disabled={busy} onClick={onSignOut}>Sign out<CaretRight size={18} /></button></div>}
        {panel === "Saved Places" && <p>Saving places is not available yet. Scan a place’s QR code to join its group.</p>}
        {panel === "Notifications" && <p>No new notifications. Group messages appear live while you have the chat open.</p>}
        {panel === "Privacy" && <p>Only members of your current group can read its messages. Direct messages are shared with your accepted friends.</p>}
        {panel === "Help & Feedback" && <p>Tap Home to scan a QR code, then join the group. If the camera is blocked, allow camera access in your browser’s settings and try again.</p>}
      </div>
    </dialog>
  </section>;
}
