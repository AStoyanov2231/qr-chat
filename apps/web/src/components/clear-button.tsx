"use client";

import { X } from "@phosphor-icons/react";

/** Empties a text field in one tap; the field's wrapper shows it only while the field has focus and text (needs placeholder=" "). */
export function ClearButton({ label, inputId, disabled, onClear }: { label: string; inputId: string; disabled: boolean; onClear: () => void }) {
  return <button type="button" className="clear-button" aria-label={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { onClear(); document.getElementById(inputId)?.focus(); }}><X size={16} weight="bold" aria-hidden="true" /></button>;
}
