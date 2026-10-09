import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

export function SettingsSidebar({ label, onClose, children }: { label: string; onClose: () => void; children: (close: (action?: () => void) => void) => ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  /** The action to run once the closing animation ends; the first close wins. */
  const [closing, setClosing] = useState<(() => void) | null>(null);
  function close(action = onClose) {
    setClosing((current) => current ?? (() => action));
  }
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className={`group-sidebar${closing ? ' is-closing' : ''}`} aria-label={label} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="group-sidebar-panel" onAnimationEnd={(event) => { if (closing && event.target === event.currentTarget) closing(); }}>
      <button type="button" className="sidebar-close" aria-label={`Close ${label.toLowerCase()}`} onClick={() => close()}><X size={20} /></button>
      {children(close)}
    </section>
  </dialog>;
}
