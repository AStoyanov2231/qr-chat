"use client";

import { useLayoutEffect, useRef } from "react";
import { animateMotion } from "@/lib/motion";

/** A visual-only snapshot retains no React tree, subscriptions, or active controls. */
export function useScreenTransition(screen: string) {
  const surface = useRef<HTMLElement>(null);
  const previous = useRef(screen);
  const pending = useRef<{ clone: HTMLElement; direction: number; screen: string; scrolls: [HTMLElement, number][] } | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  function prepare(direction: 1 | -1) {
    cancel.current?.();
    cancel.current = null;
    const element = surface.current;
    if (!element) return;
    const clone = element.cloneNode(true) as HTMLElement;
    clone.inert = true;
    clone.setAttribute("aria-hidden", "true");
    const originals = element.querySelectorAll<HTMLElement>("*");
    const copies = clone.querySelectorAll<HTMLElement>("*");
    const scrolls: [HTMLElement, number][] = Array.from(originals, (node, index) => [copies[index], node.scrollTop] as [HTMLElement, number]).filter(([, top]) => top > 0);
    clone.querySelectorAll("dialog, [data-motion-exclude]").forEach(node => node.remove());
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    pending.current = { clone, direction, screen: previous.current, scrolls };
  }

  useLayoutEffect(() => {
    if (previous.current === screen) return;
    const oldScreen = previous.current;
    previous.current = screen;
    cancel.current?.();
    const element = surface.current;
    const snapshot = pending.current;
    pending.current = null;
    if (!element) return;
    const direction = snapshot?.direction ?? (screen === "overview" || oldScreen === "profile" ? -1 : 1);
    const clone = snapshot?.screen === oldScreen ? snapshot.clone : null;
    if (clone) {
      const rect = element.getBoundingClientRect();
      Object.assign(clone.style, { position: "absolute", inset: "auto", top: `${element.offsetTop}px`, left: "0", width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", pointerEvents: "none", zIndex: "20" });
      clone.classList.add("screen-snapshot");
      element.parentElement?.append(clone);
      snapshot?.scrolls.forEach(([node, top]) => { node.scrollTop = top; });
    }
    const outgoing = clone ? animateMotion(clone, [{ transform: "translateX(0)" }, { transform: `translateX(${-direction * 100}%)` }], 240, () => clone.remove()) : () => {};
    const incoming = animateMotion(element, [{ transform: `translateX(${direction * 100}%)` }, { transform: "translateX(0)" }], 240);
    cancel.current = () => { incoming(); outgoing(); clone?.remove(); };
  }, [screen]);

  useLayoutEffect(() => () => { cancel.current?.(); pending.current = null; }, []);
  return { surface, prepare, initialScreen: (identity: string) => { previous.current = identity; } };
}
