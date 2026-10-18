"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { createChatApi, type MenuUpload, type Place } from "@qr-chat/api";
import { qrPayload } from "@qr-chat/domain";
import { errorMessage } from "@/hooks/use-chat-backend";
import { appOrigin } from "@/lib/app-origin";
import { signInPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

type PlaceInput = { name: string; link: string; menu?: MenuUpload | null };
let client: ReturnType<typeof createChatApi> | undefined;
// Created on first use in the browser: the page is prerendered at build time, where no Supabase env exists.
const api = () => client ??= createChatApi(createClient());
const HTTPS = "https://\\S+";

/** Business owners manage their places here, on desktop or phone. Without the plan, places are read-only. */
export function BusinessView() {
  const [state, setState] = useState<{ business: boolean; places: Place[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const load = useCallback(async () => {
    const [business, places] = await Promise.all([api().isBusiness(), api().places()]);
    setState({ business, places });
  }, []);
  useEffect(() => {
    void api().client.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.replace(signInPath("/business"));
      else load().catch((reason) => setError(errorMessage(reason)));
    });
  }, [load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await load(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  const signOut = () => void run(async () => { await api().signOut(); window.location.replace("/"); });
  const hasPlaces = !!state?.places.length;
  // The first place is the screen's main job; once places exist, editing them is, and adding another steps back.
  const create = <form className="profile-form" onSubmit={(event) => {
    event.preventDefault();
    void run(async () => { await api().createPlace(name); setName(""); });
  }}>
    <label htmlFor="place-name">{hasPlaces ? "Add another place" : "Venue name"}</label>
    <input id="place-name" value={name} maxLength={100} placeholder="e.g. Natterium Bar" disabled={busy} onChange={(event) => setName(event.target.value)} required />
    <button className={hasPlaces ? "scan-primary subtle" : "scan-primary"} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create place"}</button>
  </form>;

  return <main className="business-page">
    <header>
      <Link href="/" className="back-button" aria-label="Back to chats"><ArrowLeft size={20} weight="bold" /></Link>
      <h1>Business</h1>
      <button type="button" className="text-button" disabled={busy} onClick={signOut}>Sign out</button>
    </header>
    {error && <div className="business-error" role="alert"><p>{error}</p>{!state && <button type="button" className="text-button" onClick={() => void run(async () => {})}>Try again</button>}</div>}
    {!state ? !error && <p role="status">Loading your places…</p>
      : !state.business && !hasPlaces ? <section className="business-intro">
        <h2>This page is for business accounts.</h2>
        <p>Business accounts create QR codes for their venues. To chat, open QR Chat on your phone.</p>
      </section>
      : <>
        {!state.business && <p className="business-notice" role="status">Your business plan is inactive. Your QR codes still work as normal group chats; renew the plan to edit your places again.</p>}
        {state.business && !hasPlaces && <section className="business-intro">
          <h2>Create your first place</h2>
          <p>You get one QR code for it. Print it and put it on your tables; guests who scan it join your venue’s chat and can open your menu and link.</p>
          {create}
        </section>}
        {state.places.map((place) => <PlaceCard key={place.id} place={place} readOnly={!state.business}
          onSave={async (input) => { await api().updatePlace(place, input); await load(); }}
          onDelete={() => run(() => api().deletePlace(place.id))} />)}
        {state.business && hasPlaces && create}
      </>}
  </main>;
}

function PlaceCard({ place, readOnly, onSave, onDelete }: { place: Place; readOnly: boolean; onSave: (input: PlaceInput) => Promise<void>; onDelete: () => void }) {
  const [name, setName] = useState(place.name);
  const [link, setLink] = useState(place.link_url ?? "");
  const [menu, setMenu] = useState<File | null | undefined>();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ error?: string; saved?: boolean }>({});
  const [qr, setQr] = useState("");
  const url = qrPayload(`v:${place.code}`, appOrigin());
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: "M" }).then((data) => { if (active) setQr(data); }, () => {});
    return () => { active = false; };
  }, [url]);
  const disabled = readOnly || saving;
  const edited = (change: () => void) => { change(); setStatus({}); };
  const file = `${place.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "") || "place"}-qr.png`;
  return <section className="business-place" aria-label={place.name}>
    <div className="business-qr">
      {qr ? <Image src={qr} alt={`QR code for ${place.name}`} width={200} height={200} unoptimized /> : <span className="business-qr-placeholder" aria-hidden="true" />}
      <small>{url}</small>
      {qr && <a className="scan-primary subtle" href={qr} download={file}>Download QR</a>}
    </div>
    <form className="profile-form" aria-busy={saving} onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true); setStatus({});
      try {
        const upload = menu ? { uploadId: crypto.randomUUID(), data: await menu.arrayBuffer() } : menu;
        await onSave({ name, link, menu: upload });
        setMenu(undefined); setStatus({ saved: true });
      } catch (reason) { setStatus({ error: errorMessage(reason) }); } finally { setSaving(false); }
    }}>
      <label htmlFor={`name-${place.id}`}>Name</label>
      <input id={`name-${place.id}`} value={name} maxLength={100} disabled={disabled} onChange={(event) => edited(() => setName(event.target.value))} required />
      <label htmlFor={`link-${place.id}`}>Link</label>
      <input id={`link-${place.id}`} type="url" inputMode="url" value={link} maxLength={2048} placeholder="https://" pattern={HTTPS} title="Use a link that starts with https://" aria-describedby={`link-hint-${place.id}`} disabled={disabled} onChange={(event) => edited(() => setLink(event.target.value))} />
      <small id={`link-hint-${place.id}`} className="field-hint">Your website or payment page. Guests open it from the group chat.</small>
      <label htmlFor={`menu-${place.id}`}>Menu (PDF, up to 10 MB)</label>
      <p className="field-hint" role="status">
        {menu ? <>{menu.name} will be uploaded when you save. </>
          : menu === null ? <>The menu will be removed when you save. </>
          : place.menu_url ? <><a href={place.menu_url} target="_blank" rel="noopener noreferrer">View current menu</a> </>
          : <>No menu yet. </>}
        {menu !== undefined && !readOnly && <button type="button" className="inline-button" onClick={() => edited(() => setMenu(undefined))}>Undo</button>}
      </p>
      <input id={`menu-${place.id}`} type="file" accept="application/pdf" disabled={disabled} onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; if (picked) edited(() => setMenu(picked)); }} />
      {place.menu_url && menu === undefined && !readOnly && <button type="button" className="text-button" disabled={saving} onClick={() => edited(() => setMenu(null))}>Remove menu</button>}
      {!readOnly && <>
        <button className="scan-primary" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save changes"}</button>
        {status.error && <p className="form-error" role="alert">{status.error}</p>}
        {status.saved && <p className="field-hint" role="status">Changes saved. Guests see them the next time they open the chat.</p>}
        <button type="button" className="text-button danger" disabled={saving} onClick={() => { if (window.confirm(`Delete ${place.name}? Its QR code stops working and guests can no longer join.`)) onDelete(); }}>Delete place</button>
      </>}
    </form>
  </section>;
}
