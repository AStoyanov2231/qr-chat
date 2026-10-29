"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Camera, CaretRight, DownloadSimple, FilePdf, LinkSimple, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createChatApi, type ChatApi, type Place } from "@qr-chat/api";
import { qrPayload } from "@qr-chat/domain";
import { avatarUploadSchema, menuUploadSchema, placeLinkSchema } from "@qr-chat/validation";
import { ClearButton } from "@/components/clear-button";
import { errorMessage } from "@/hooks/use-chat-backend";
import { appOrigin } from "@/lib/app-origin";
import { prepareAvatar } from "@/lib/avatar";
import { SwipeRow } from "./chats-overview";
import { signInPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

let client: ReturnType<typeof createChatApi> | undefined;
// Created on first use in the browser: the page is prerendered at build time, where no Supabase env exists.
const live = () => client ??= createChatApi(createClient());
const HTTPS = "https://\\S+";
/** What the screen needs; the local design preview passes an in-memory stand-in. */
export type BusinessApi = Pick<ChatApi, "isBusiness" | "places" | "createPlace" | "updatePlace" | "deletePlace" | "signOut" | "deleteAccount">;

/** Business owners manage their places here, on desktop or phone. Without the plan, places are read-only. */
export function BusinessView({ preview }: { preview?: BusinessApi }) {
  const api = useCallback((): BusinessApi => preview ?? live(), [preview]);
  const [state, setState] = useState<{ business: boolean; places: Place[] } | null>(null);
  const [error, setError] = useState("");
  // The list is the home; "new" or a place opens the editor, which returns to the list when done.
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [business, places] = await Promise.all([api().isBusiness(), api().places()]);
    setState({ business, places });
  }, [api]);
  useEffect(() => {
    const signedIn = preview ? Promise.resolve(true) : live().client.auth.getSession().then(({ data }) => !!data.session);
    void signedIn.then((ok) => {
      if (!ok) window.location.replace(signInPath("/business"));
      else load().catch((reason) => setError(errorMessage(reason)));
    });
    if (preview) return;
    // auth-js relays a sign-out in another tab as SIGNED_OUT here.
    const { data } = live().client.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") window.location.replace(signInPath("/business")); });
    return () => data.subscription.unsubscribe();
  }, [load, preview]);
  const retry = () => { setError(""); load().catch((reason) => setError(errorMessage(reason))); };
  // The save already committed, so the editor closes even if reloading the list fails; the list then offers a retry.
  const done = async () => { setEditing(null); retry(); };

  if (editing && state) return <PlaceEditor place={editing === "new" ? null : editing} readOnly={!state.business} api={api()} onDone={done} onBack={() => setEditing(null)} />;
  const hasPlaces = !!state?.places.length;
  return <main className="business-page">
    <header>
      <Link href="/" className="back-button" aria-label="Back to chats"><ArrowLeft size={20} weight="bold" /></Link>
      <h1>Business</h1>
      {state?.business && <button type="button" className="back-button" aria-label="Add a place" onClick={() => setEditing("new")}><Plus size={20} weight="bold" /></button>}
    </header>
    {error && <div className="business-error" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={retry}>Retry</button></div>}
    {!state ? !error && <p role="status">Loading your places…</p>
      : !state.business && !hasPlaces ? <section className="business-intro">
        <h2>This page is for business accounts.</h2>
        <p>Business accounts create QR codes for their venues. To chat, open QR Chat on your phone.</p>
      </section>
      : <>
        {!state.business && <p className="business-notice" role="status">Your business plan is inactive. Your QR codes still work as normal group chats; renew the plan to edit your places again.</p>}
        {!hasPlaces && <section className="business-intro">
          <h2>Create your first place</h2>
          <p>You get one QR code for it. Print it and put it on your tables; guests who scan it join your venue’s chat and can open your menu and link.</p>
          <button type="button" className="scan-primary" onClick={() => setEditing("new")}>Create place</button>
        </section>}
        {hasPlaces && <ul className="business-list">{state.places.map((place) => {
          const row = <>
            {place.photo_url ? <Image src={place.photo_url} alt={`Photo of ${place.name}`} width={88} height={88} unoptimized /> : <PlaceQr place={place} size={88} />}
            <span>
              <strong>{place.name}</strong>
              <span>{place.menu_url ? "Menu PDF" : place.link_url ? place.link_url.replace(/^https:\/\//u, "") : "No menu"}</span>
            </span>
            <CaretRight size={18} aria-hidden="true" />
          </>;
          // Swiping a row reveals Delete, as on the chats list; without the plan, places can't be deleted.
          return <li key={place.id}>{state.business
            ? <SwipeRow className="business-row" label={`Edit ${place.name}`} actionsLabel={place.name} open={revealedId === place.id} onReveal={(open) => setRevealedId(open ? place.id : null)}
              onOpen={() => setEditing(place)} busy={false} onNotice={() => {}} errorText="Couldn’t delete this place. Try again."
              actions={[{ kind: "delete", label: "Delete", danger: true, icon: <Trash size={24} weight="bold" />, confirm: `Delete ${place.name}? Its QR code stops working and guests can no longer join.`, run: async () => { await api().deletePlace(place.id); await load(); }, notice: "" }]}>{row}</SwipeRow>
            : <button type="button" className="business-row" onClick={() => setEditing(place)}>{row}</button>}</li>;
        })}</ul>}
      </>}
  </main>;
}

/** "" while generating, null if it failed. */
function useQr(url: string) {
  const [qr, setQr] = useState<string | null>("");
  useEffect(() => {
    let blobUrl = "";
    let active = true;
    // A blob URL, not a data URL: browsers drop `download` on large data URLs.
    void QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: "M" })
      .then((data) => fetch(data)).then((response) => response.blob())
      .then((blob) => { if (!active) return; blobUrl = URL.createObjectURL(blob); setQr(blobUrl); }, () => { if (active) setQr(null); });
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [url]);
  return qr;
}

function PlaceQr({ place, size }: { place: Place; size: number }) {
  const qr = useQr(qrPayload(`v:${place.code}`, appOrigin()));
  return qr ? <Image src={qr} alt={`QR code for ${place.name}`} width={size} height={size} unoptimized /> : <span className="business-qr-placeholder" style={{ width: size, height: size }} aria-hidden="true" />;
}

function PlaceEditor({ place, readOnly, api, onDone, onBack }: { place: Place | null; readOnly: boolean; api: BusinessApi; onDone: () => Promise<void>; onBack: () => void }) {
  const [name, setName] = useState(place?.name ?? "");
  // A place offers one menu: a link or a PDF. Saving one clears the other.
  const [kind, setKind] = useState<"link" | "pdf">(place?.menu_path ? "pdf" : "link");
  const [link, setLink] = useState(place?.link_url ?? "");
  const [menu, setMenu] = useState<File | undefined>();
  const isLink = kind === "link";
  const viewable = !!place?.menu_url && !menu;
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // A new place is created before its link and menu are saved; if that second step fails, a retry must not create it twice,
  // and Back reloads the list so the place shows there instead of being created again.
  const created = useRef<Place | null>(null);
  // undefined keeps the current photo, null removes it, a Blob replaces it; nothing is saved until the form is.
  const [photo, setPhoto] = useState<Blob | null | undefined>();
  const [preview, setPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const shown = photo === undefined ? place?.photo_url ?? null : photo === null ? null : preview;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const qr = useQr(place ? qrPayload(`v:${place.code}`, appOrigin()) : "");
  const disabled = readOnly || saving;
  const file = `${(place?.name ?? "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "") || "place"}-qr.png`;
  const dirty = !place || name.trim() !== place.name || (kind === "link" ? link.trim() : "") !== (place.link_url ?? "") || (kind === "pdf" ? !!menu : !!place.menu_path) || photo !== undefined;
  const pick = (picked: File | undefined) => { if (picked?.type === "application/pdf") setMenu(picked); };
  const pickPhoto = async (picked: File | undefined) => {
    if (!picked) return;
    setPhotoError("");
    try { const prepared = await prepareAvatar(picked); setPhoto(prepared); setPreview(URL.createObjectURL(prepared)); }
    catch (reason) { setPhotoError(reason instanceof Error ? reason.message : "Could not open this photo."); }
  };
  const removePhoto = () => { setPreview(""); setPhoto(place?.photo_url ? null : undefined); };
  return <main className="business-page">
    <header>
      <button type="button" className="back-button" aria-label="Back to places" disabled={saving} onClick={() => { if (created.current) void onDone(); else onBack(); }}><ArrowLeft size={20} weight="bold" /></button>
      <h1>{place ? "Edit place" : "New place"}</h1>
    </header>
    {/* A large square preview of the photo guests will see; the camera sits in its corner once there is one. */}
    {(!readOnly || shown) && <section className="business-photo" aria-label="Place photo">
      <input id="place-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} />
      <label htmlFor="place-photo" aria-label={readOnly ? undefined : shown ? "Change place photo" : "Add place photo"}>
        {shown && <Image src={shown} alt={`Photo of ${name || "your place"}`} width={280} height={280} unoptimized />}
        {!readOnly && <span aria-hidden="true"><Camera size={24} weight="bold" /></span>}
      </label>
      {shown && !readOnly && <button type="button" className="text-button" disabled={saving} onClick={removePhoto}>Remove photo</button>}
      {photoError && <p className="form-error" role="alert">{photoError}</p>}
    </section>}
    <form className="profile-form business-form" aria-busy={saving} onSubmit={async (event) => {
      event.preventDefault();
      // Saving the PDF option with no file would silently drop the place's link.
      if (kind === "pdf" && !menu && !place?.menu_path) { setError("Choose a PDF menu, or switch back to Link."); return; }
      setSaving(true); setError("");
      try {
        const upload = menu && { uploadId: crypto.randomUUID(), data: await menu.arrayBuffer() };
        const photoUpload = photo ? { uploadId: crypto.randomUUID(), data: await photo.arrayBuffer() } : photo;
        // On the Link option a PDF is removed only when this editor showed one or a link replaces it, so another device's new PDF survives.
        const input = { ...(kind === "link" ? { name, link, menu: place?.menu_path || link.trim() ? null : undefined } : { name, link: "", menu: upload }), photo: photoUpload };
        // Checked before a new place exists, so a bad link or file never leaves a half-made place behind.
        placeLinkSchema.parse(input.link); if (input.menu) menuUploadSchema.parse(input.menu); if (input.photo) avatarUploadSchema.parse(input.photo);
        const target = place ?? created.current ?? (created.current = await api.createPlace(name));
        if (place || input.link || input.menu || input.photo) await api.updatePlace(target, input);
        await onDone();
      } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
    }}>
      <div className="float-field">
        <input id="place-name" value={name} maxLength={100} placeholder=" " disabled={disabled} onChange={(event) => setName(event.target.value)} required />
        <label htmlFor="place-name">Place name</label>
        <ClearButton label="Clear place name" inputId="place-name" disabled={disabled} onClear={() => setName("")} />
      </div>
      <div className="business-menu">
        <div className="business-kind" data-kind={kind} role="group" aria-label="Menu type">
          <button type="button" aria-pressed={kind === "link"} disabled={disabled} onClick={() => setKind("link")}><LinkSimple size={18} weight="bold" aria-hidden="true" />Link</button>
          <button type="button" aria-pressed={kind === "pdf"} disabled={disabled} onClick={() => setKind("pdf")}><FilePdf size={18} weight="bold" aria-hidden="true" />PDF</button>
        </div>
        {isLink ? <>
          {/* The label sits inside the field and moves up as a hint once it has focus or a value; needs placeholder=" " for :placeholder-shown. */}
          <div className="float-field">
            <input id="place-link" type="url" inputMode="url" value={link} maxLength={2048} placeholder="https://" pattern={HTTPS} title="Use a link that starts with https://" disabled={disabled} onChange={(event) => setLink(event.target.value)} />
            <label htmlFor="place-link">Menu link <span>(optional)</span></label>
            <ClearButton label="Clear menu link" inputId="place-link" disabled={disabled} onClear={() => setLink("")} />
          </div>
        </> : <>
          <div className="business-file-row">
            <input id="place-menu" className="sr-only" type="file" accept="application/pdf" disabled={disabled} onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }} />
            <label htmlFor="place-menu" className={`business-file${dragging ? " dragging" : ""}${viewable ? " has-view" : ""}`}
              onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) pick(event.dataTransfer.files[0]); }}>
              <FilePdf size={32} aria-hidden="true" />
              <span>{menu ? menu.name : place?.menu_url ? "Replace PDF" : <>Select PDF <span>(max 10 MB)</span></>}</span>
              {!viewable && <UploadSimple className="business-file-upload" size={20} aria-hidden="true" />}
            </label>
            {viewable && <a className="business-file-view" href={place.menu_url!} target="_blank" rel="noopener noreferrer" aria-label="View current menu">View</a>}
          </div>
          {menu && <button type="button" className="text-button" disabled={disabled} onClick={() => setMenu(undefined)}>Remove file</button>}
        </>}
      </div>
      {place && qr && <a className="scan-primary subtle business-download" href={qr} download={file}><DownloadSimple size={16} weight="bold" />Download QR</a>}
      {place && qr === null && <p className="form-error" role="alert">Couldn’t create the QR code image. Reload and try again.</p>}
      {!readOnly && <div className="business-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="scan-primary" disabled={saving || !name.trim() || !dirty}>{saving ? "Saving…" : place ? "Save changes" : "Create place"}</button>
        {place && <button type="button" className="text-button" style={{ color: "var(--danger)" }} disabled={saving} onClick={async () => {
          if (!window.confirm(`Delete ${place.name}? Its QR code stops working and guests can no longer join.`)) return;
          setSaving(true); setError("");
          try { await api.deletePlace(place.id); await onDone(); } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
        }}>Delete place</button>}
      </div>}
    </form>
  </main>;
}
