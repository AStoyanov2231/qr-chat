"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { animateMotion } from "@/lib/motion";

const publicScreen = (path: string) => path === "/welcome" || path === "/sign-in";

/** Full-document OAuth and sign-out redirects receive the same destination fade. */
export function AppArrival({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(pathname);
  const snapshot = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === pathname || (!publicScreen(from) && !publicScreen(pathname))) return;
    const element = root.current;
    if (!element) return;
    const clone = snapshot.current;
    snapshot.current = null;
    // Protected screens are never retained during sign-out or auth revocation.
    if (clone && publicScreen(from)) {
      Object.assign(clone.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "100", background: "var(--paper)" });
      element.append(clone);
    }
    const outgoing = clone ? animateMotion(clone, [{ opacity: 1 }, { opacity: 0 }], 160, () => clone.remove()) : () => {};
    const incoming = animateMotion(element, [{ opacity: 0 }, { opacity: 1 }], 160);
    return () => { incoming(); outgoing(); clone?.remove(); };
  }, [pathname]);
  return <div ref={root} className="app-arrival" onClickCapture={(event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!publicScreen(pathname) || !link || new URL(link.href).origin !== window.location.origin) return;
    const element = root.current;
    if (!element) return;
    const content = element.cloneNode(true) as HTMLElement;
    const canvases = content.querySelectorAll("canvas");
    element.querySelectorAll("canvas").forEach((canvas, index) => canvases[index]?.getContext("2d")?.drawImage(canvas, 0, 0));
    content.style.animation = "none";
    content.style.marginTop = `${element.getBoundingClientRect().top}px`;
    content.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    const clone = document.createElement("div");
    clone.dataset.motion = "auth-snapshot";
    clone.inert = true;
    clone.setAttribute("aria-hidden", "true");
    clone.style.overflow = "hidden";
    clone.append(content);
    snapshot.current = clone;
  }}>{children}</div>;
}
