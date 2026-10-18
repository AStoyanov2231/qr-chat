"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, CaretRight, DownloadSimple, FilePdf, Plus, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createChatApi, type ChatApi, type Place } from "@qr-chat/api";
import { qrPayload } from "@qr-chat/domain";
import { errorMessage } from "@/hooks/use-chat-backend";
import { appOrigin } from "@/lib/app-origin";
import { signInPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

let client: ReturnType<typeof createChatApi> | undefined;
// Created on first use in the browser: the page is prerendered at build time, where no Supabase env exists.
const live = () => client ??= createChatApi(createClient());
const HTTPS = "https://\\S+";
/** What the screen needs; the local design preview passes an in-memory stand-in. */
export type BusinessApi = Pick<ChatApi, "isBusiness" | "places" | "createPlace" | "updatePlace" | "deletePlace">;

/** Business owners manage their places here, on desktop or phone. Without the plan, places are read-only. */
export function BusinessView({ preview }: { preview?: BusinessApi }) {
  const api = useCallback((): BusinessApi => preview ?? live(), [preview]);
  const [state, setState] = useState<{ business: boolean; places: Place[] } | null>(null);
  const [error, setError] = useState("");
  // The list is the home; "new" or a place opens the editor, which returns to the list when done.
  const [editing, setEditing] = useState<Place | "new" | null>(null);
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
  }, [load, preview]);
  const retry = () => { setError(""); load().catch((reason) => setError(errorMessage(reason))); };
  const done = async () => { await load(); setEditing(null); };

  if (editing && state) return <PlaceEditor place={editing === "new" ? null : editing} readOnly={!state.business} api={api()} onDone={done} onBack={() => setEditing(null)} />;
  const hasPlaces = !!state?.places.length;
  return <main className="business-page">
    <header>
      <Link href="/" className="back-button" aria-label="Back to chats"><ArrowLeft size={20} weight="bold" /></Link>
      <h1>Business</h1>
      {state?.business && <button type="button" className="back-button" aria-label="Add a place" onClick={() => setEditing("new")}><Plus size={20} weight="bold" /></button>}
    </header>
    {error && <div className="business-error" role="alert"><p>{error}</p>{!state && <button type="button" className="text-button" onClick={retry}>Try again</button>}</div>}
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
        {hasPlaces && <ul className="business-list">{state.places.map((place) => <li key={place.id}>
          <button type="button" className="business-row" onClick={() => setEditing(place)}>
            <PlaceQr place={place} size={88} />
            <span>
              <strong>{place.name}</strong>
              <span>{place.link_url ? place.link_url.replace(/^https:\/\//u, "") : "No link"}</span>
              <span>{place.menu_url ? "Menu PDF" : "No menu"}</span>
            </span>
            <CaretRight size={18} aria-hidden="true" />
          </button>
        </li>)}</ul>}
      </>}
  </main>;
}

function useQr(url: string) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: "M" }).then((data) => { if (active) setQr(data); }, () => {});
    return () => { active = false; };
  }, [url]);
  return qr;
}

function PlaceQr({ place, size }: { place: Place; size: number }) {
  const qr = useQr(qrPayload(`v:${place.code}`, appOrigin()));
  return qr ? <Image src={qr} alt={`QR code for ${place.name}`} width={size} height={size} unoptimized /> : <span className="business-qr-placeholder" style={{ width: size, height: size }} aria-hidden="true" />;
}

function PlaceEditor({ place, readOnly, api, onDone, onBack }: { place: Place | null; readOnly: boolean; api: BusinessApi; onDone: () => Promise<void>; onBack: () => void }) {
  const [name, setName] = useState(place?.name ?? "");
  const [link, setLink] = useState(place?.link_url ?? "");
  const [menu, setMenu] = useState<File | null | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // A new place is created before its link and menu are saved; if that second step fails, a retry must not create it twice.
  const created = useRef<Place | null>(null);
  const url = place && qrPayload(`v:${place.code}`, appOrigin());
  const qr = useQr(url ?? "");
  const disabled = readOnly || saving;
  const file = `${name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "") || "place"}-qr.png`;
  const menuUrl = menu === undefined ? place?.menu_url : null;
  return <main className="business-page">
    <header>
      <button type="button" className="back-button" aria-label="Back to places" disabled={saving} onClick={onBack}><ArrowLeft size={20} weight="bold" /></button>
      <h1>{place ? place.name : "New place"}</h1>
    </header>
    {place && <section className="business-qr" aria-label="QR code">
      {qr ? <Image src={qr} alt={`QR code for ${place.name}`} width={200} height={200} unoptimized /> : <span className="business-qr-placeholder" aria-hidden="true" />}
      <div>
        <p>Print it for your tables. Guests who scan it join this place’s chat.</p>
        <small>{url}</small>
        {qr && <a className="scan-primary subtle" href={qr} download={file}><DownloadSimple size={18} weight="bold" />Download QR</a>}
      </div>
    </section>}
    <form className="profile-form business-form" aria-busy={saving} onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true); setError("");
      try {
        const target = place ?? created.current ?? (created.current = await api.createPlace(name));
        const upload = menu ? { uploadId: crypto.randomUUID(), data: await menu.arrayBuffer() } : menu;
        if (place || link || upload) await api.updatePlace(target, { name, link, menu: upload });
        await onDone();
      } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
    }}>
      {/* The label sits inside the field and moves up as a hint once it has focus or a value; needs placeholder=" " for :placeholder-shown. */}
      <div className="float-field">
        <input id="place-name" value={name} maxLength={100} placeholder=" " disabled={disabled} onChange={(event) => setName(event.target.value)} required />
        <label htmlFor="place-name">Name</label>
      </div>
      <div className="float-field">
        <input id="place-link" type="url" inputMode="url" value={link} maxLength={2048} placeholder=" " pattern={HTTPS} title="Use a link that starts with https://" aria-describedby="place-link-hint" disabled={disabled} onChange={(event) => setLink(event.target.value)} />
        <label htmlFor="place-link">Link <span>(optional)</span></label>
      </div>
      <small id="place-link-hint" className="field-hint">Your website or payment page. Guests open it from the group chat.</small>
      <span className="business-label" id="place-menu-label">Menu <span>(optional)</span></span>
      <div className={`business-menu${menu === null ? " removing" : ""}`} role="group" aria-labelledby="place-menu-label">
        <FilePdf size={28} aria-hidden="true" />
        <p role="status">
          {menu ? <><strong>{menu.name}</strong><small>Uploads when you save</small></>
            : menu === null ? <><strong>Menu will be removed</strong><small>When you save</small></>
            : menuUrl ? <><strong><a href={menuUrl} target="_blank" rel="noopener noreferrer">Current menu</a></strong><small>Tap to view the PDF</small></>
            : <><strong>No menu yet</strong><small>PDF, up to 10 MB</small></>}
        </p>
        {!readOnly && (menu !== undefined
          ? <button type="button" className="text-button" disabled={saving} onClick={() => setMenu(undefined)}>Undo</button>
          : <>
            {menuUrl && <button type="button" className="text-button" aria-label="Remove menu" disabled={saving} onClick={() => setMenu(null)}><Trash size={20} /></button>}
            <input id="place-menu" className="sr-only" type="file" accept="application/pdf" disabled={disabled} onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; if (picked) setMenu(picked); }} />
            <label htmlFor="place-menu" className="business-upload">{menuUrl ? "Replace" : "Upload"}</label>
          </>)}
      </div>
      {!readOnly && <>
        {place && <button type="button" className="text-button danger" disabled={saving} onClick={() => {
          if (!window.confirm(`Delete ${place.name}? Its QR code stops working and guests can no longer join.`)) return;
          setSaving(true); setError("");
          api.deletePlace(place.id).then(onDone, (reason) => { setError(errorMessage(reason)); setSaving(false); });
        }}>Delete place</button>}
        <div className="business-actions">
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="scan-primary" disabled={saving || !name.trim()}>{saving ? "Saving…" : place ? "Save changes" : "Create place"}</button>
        </div>
      </>}
    </form>
  </main>;
}
