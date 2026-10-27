"use client";

import { useEffect, useRef, useState } from "react";
import { reportReasons, type ReportReason } from "@qr-chat/validation";
import { Icon } from "./icon";

/** onSubmit resolves to an error message ("" on success) so it shows inside the dialog, above the toast. */
export function ReportDialog({ name, busy, onClose, onSubmit }: { name: string; busy: boolean; onClose: () => void; onSubmit: (reason: ReportReason, details: string) => Promise<string> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="profile-dialog" aria-label={`Report ${name}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === dialog.current && !busy) onClose(); }}>
    <div className="entry-panel">
      <button className="modal-close" aria-label="Close report" disabled={busy} onClick={onClose}><Icon name="close" size={20} /></button>
      <h2>Report {name}</h2>
      <form className="profile-form report-form" onSubmit={async (event) => { event.preventDefault(); if (reason && !busy) setError(await onSubmit(reason, details)); }}>
        <fieldset className="report-reasons" disabled={busy}>
          <legend>What’s wrong?</legend>
          {(Object.keys(reportReasons) as ReportReason[]).map((key) => <label key={key}><input type="radio" name="reason" value={key} checked={reason === key} onChange={() => setReason(key)} />{reportReasons[key]}</label>)}
        </fieldset>
        <label htmlFor="report-details">Details (optional)</label>
        <textarea id="report-details" maxLength={500} rows={3} value={details} disabled={busy} onChange={(event) => setDetails(event.target.value)} />
        <button className="scan-primary" disabled={busy || !reason}>{busy ? "Sending…" : "Send report"}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </div>
  </dialog>;
}
