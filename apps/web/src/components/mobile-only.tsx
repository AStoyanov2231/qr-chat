"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LandingPage } from "./landing-page";

const query = "(hover: none) and (pointer: coarse)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** A mobile interaction gate; authentication remains server-enforced. */
export function MobileOnly({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  const pathname = usePathname();
  const mobile = useSyncExternalStore(subscribe, () => preview || window.matchMedia(query).matches, () => false);
  if (pathname === "/welcome") return children;
  if (preview) return <div className="local-design-frame">{mobile ? children : null}</div>;
  if (mobile) return children;
  return <LandingPage />;
}
