"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { DeviceMobile } from "@phosphor-icons/react";

const query = "(max-width: 767px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** A viewport gate, not an authorization boundary. Auth remains server-enforced. */
export function MobileOnly({ children }: { children: ReactNode }) {
  const mobile = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  if (mobile) return children;
  return (
    <main className="mobile-only-notice">
      <DeviceMobile size={52} weight="light" aria-hidden="true" />
      <h1>Open QR Chat on your phone.</h1>
      <p>QR Chat is available on mobile only. Open this link in your phone’s browser to scan, join, and chat.</p>
    </main>
  );
}
