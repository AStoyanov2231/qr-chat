import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

export function SettingsSidebar({ label, onClose, children }: { label: string; onClose: () => void; children: (close: (action?: () => void) => void) => ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const afterClose = useRef(onClose);
  const closingRef = useRef(false);
  function close(action = onClose) {
    if (closingRef.current) return;
    closingRef.current = true;
    afterClose.current = action;
    setClosing(true);
  }
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className={`group-sidebar${closing ? ' is-closing' : ''}`} aria-label={label} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="group-sidebar-panel" onAnimationEnd={(event) => { if (closing && event.target === event.currentTarget) afterClose.current(); }}>
      <button type="button" className="sidebar-close" aria-label={`Close ${label.toLowerCase()}`} onClick={() => close()}><X size={20} /></button>
      {children(close)}
    </section>
  </dialog>;
}
