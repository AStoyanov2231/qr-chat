"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isLocalDesignPreviewHost } from "@/lib/local-design-preview";
import { LandingPage } from "./landing-page";

const query = "(hover: none) and (pointer: coarse)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

const noop = () => () => {};

/** A mobile interaction gate; authentication is enforced by the session provider and RLS. */
export function MobileOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Read on the client so the layout stays static; the preview only exists on the dev server.
  const preview = useSyncExternalStore(noop, () => isLocalDesignPreviewHost(window.location.host), () => false);
  const mobile = useSyncExternalStore(subscribe, () => preview || window.matchMedia(query).matches, () => false);
  if (pathname === "/welcome") return children;
  if (preview) return <div className="local-design-frame">{mobile ? children : null}</div>;
  if (mobile) return children;
  return <LandingPage />;
}
