"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { createChatApi, type MenuUpload, type Place } from "@qr-chat/api";
import { qrPayload } from "@qr-chat/domain";
import { errorMessage } from "@/hooks/use-chat-backend";
import { appOrigin } from "@/lib/app-origin";
import { signInPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";

type PlaceInput = { name: string; link: string; menu?: MenuUpload | null };

/** Business owners manage their places here, on desktop or phone. Without the plan, places are read-only. */
export function BusinessView() {
  const [api] = useState(() => createChatApi(createClient()));
  const [state, setState] = useState<{ business: boolean; places: Place[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const load = useCallback(async () => {
    const [business, places] = await Promise.all([api.isBusiness(), api.places()]);
    setState({ business, places });
  }, [api]);
  useEffect(() => {
    void api.client.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.replace(signInPath("/business"));
      else load().catch((reason) => setError(errorMessage(reason)));
    });
  }, [api, load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await load(); return true; } catch (reason) { setError(errorMessage(reason)); return false; } finally { setBusy(false); }
  }
  const signOut = () => void run(async () => { await api.signOut(); window.location.replace("/"); });

  return <main className="business-page">
    <header><h1>Business</h1><button type="button" className="text-button" style={{ width: "auto", margin: 0 }} disabled={busy} onClick={signOut}>Sign out</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!state ? !error && <p role="status">Loading…</p>
      : !state.business && !state.places.length ? <section>
        <h2>This page is for business accounts.</h2>
        <p>On desktop, QR Chat is for managing business places. Open it on your phone to chat.</p>
        <Link className="text-button" href="/">Back to chats</Link>
      </section>
      : <>
        {!state.business && <p role="status">Your business plan is inactive. Your QR codes still work as normal group chats; renew the plan to edit your places again.</p>}
        {state.business && <form className="profile-form" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => { await api.createPlace(name); setName(""); });
        }}>
          <label htmlFor="place-name">New place</label>
          <input id="place-name" value={name} maxLength={100} placeholder="Your venue’s name" disabled={busy} onChange={(event) => setName(event.target.value)} required />
          <button className="scan-primary" disabled={busy || !name.trim()}>Create place</button>
        </form>}
        {state.places.map((place) => <PlaceCard key={place.id} place={place} readOnly={!state.business} busy={busy}
          onSave={(input) => run(() => api.updatePlace(place, input))}
          onDelete={() => run(() => api.deletePlace(place.id))} />)}
      </>}
  </main>;
}

function PlaceCard({ place, readOnly, busy, onSave, onDelete }: { place: Place; readOnly: boolean; busy: boolean; onSave: (input: PlaceInput) => Promise<boolean>; onDelete: () => void }) {
  const [name, setName] = useState(place.name);
  const [link, setLink] = useState(place.link_url ?? "");
  const [menu, setMenu] = useState<File | null | undefined>();
  const [qr, setQr] = useState("");
  const url = qrPayload(`v:${place.code}`, appOrigin());
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 1024, margin: 4, errorCorrectionLevel: "M" }).then((data) => { if (active) setQr(data); }, () => {});
    return () => { active = false; };
  }, [url]);
  const disabled = readOnly || busy;
  return <section className="business-place" aria-label={place.name}>
    <div className="business-qr">
      {qr && <Image src={qr} alt={`QR code for ${place.name}`} width={200} height={200} unoptimized />}
      <small>{url}</small>
      {qr && <a className="text-button" href={qr} download={`${place.name}-qr.png`}>Download QR</a>}
    </div>
    <form className="profile-form" onSubmit={async (event) => {
      event.preventDefault();
      const upload = menu ? { uploadId: crypto.randomUUID(), data: await menu.arrayBuffer() } : menu;
      if (await onSave({ name, link, menu: upload })) setMenu(undefined);
    }}>
      <label htmlFor={`name-${place.id}`}>Name</label>
      <input id={`name-${place.id}`} value={name} maxLength={100} disabled={disabled} onChange={(event) => setName(event.target.value)} required />
      <label htmlFor={`link-${place.id}`}>Link (website or payments)</label>
      <input id={`link-${place.id}`} type="url" value={link} maxLength={2048} placeholder="https://" disabled={disabled} onChange={(event) => setLink(event.target.value)} />
      <label htmlFor={`menu-${place.id}`}>Menu (PDF, up to 10 MB)</label>
      {place.menu_url && menu !== null && <a href={place.menu_url} target="_blank" rel="noopener noreferrer">View current menu</a>}
      <input id={`menu-${place.id}`} type="file" accept="application/pdf" disabled={disabled} onChange={(event) => setMenu(event.target.files?.[0])} />
      {place.menu_url && menu !== null && !readOnly && <button type="button" className="text-button" disabled={busy} onClick={() => setMenu(null)}>Remove menu</button>}
      {!readOnly && <>
        <button className="scan-primary" disabled={busy || !name.trim()}>Save</button>
        <button type="button" className="text-button danger" disabled={busy} onClick={() => { if (window.confirm(`Delete ${place.name}? Its QR code stops working.`)) onDelete(); }}>Delete place</button>
      </>}
    </form>
  </section>;
}
