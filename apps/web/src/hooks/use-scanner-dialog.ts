"use client";

import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from "react";
import { animateMotion, scannerCircle } from "@/lib/motion";

export function useScannerDialog(open: boolean, joining: boolean, trigger: RefObject<HTMLElement | null>, onClosed: () => void) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opened = useRef(false);
  const closed = useEffectEvent(onClosed);
  const restoreTheme = useRef<(() => void) | null>(null);
  function resetTheme() {
    restoreTheme.current?.();
    restoreTheme.current = null;
  }
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || (!open && !opened.current)) return;
    if (open && !joining && !restoreTheme.current) {
      const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (theme) {
        const content = theme.content;
        theme.content = "#07090b";
        restoreTheme.current = () => { theme.content = content; };
      }
    }
    if (joining) resetTheme();
    if (open && !element.open) element.showModal();
    const wasOpen = opened.current;
    opened.current = open;
    if (open && joining && wasOpen) return;
    const origin = trigger.current;
    const rect = origin?.isConnected ? origin.getBoundingClientRect() : null;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const visible = rect && rect.width > 0 && rect.height > 0
      && rect.bottom > top && rect.right > left
      && rect.top < top + (viewport?.height ?? window.innerHeight)
      && rect.left < left + (viewport?.width ?? window.innerWidth);
    const circle = visible && !joining ? scannerCircle(rect, element.getBoundingClientRect()) : null;
    const frames = circle
      ? [{ clipPath: open ? circle.closed : circle.open }, { clipPath: open ? circle.open : circle.closed }]
      : [{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }];
    element.dataset.motion = open ? "opening" : "closing";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      delete element.dataset.motion;
      if (!open) {
        element.close();
        resetTheme();
        if (origin?.isConnected) origin.focus({ preventScroll: true });
        closed();
      }
    };
    const duration = circle ? 300 : 160;
    const edgeCancels = Array.from(element.querySelectorAll<HTMLElement>("[data-camera-edge]"), edge => {
      const outside = edge.dataset.cameraEdge === "top" ? "translateY(-100%)" : "translateY(100%)";
      return animateMotion(edge, [
        { transform: open ? outside : "translateY(0)" },
        { transform: open ? "translateY(0)" : outside },
      ], duration);
    });
    // Keep the edge bands outside the circular mask so they can meet the camera.
    const surface = element.querySelector<HTMLElement>(".camera-panel") ?? element;
    const cancelSurface = animateMotion(surface, frames, duration, finish);
    const cancel = () => { cancelSurface(); edgeCancels.forEach(stop => stop()); };
    // Recompute the exit origin at dismissal. If the viewport changes mid-motion,
    // complete the current reveal instead of leaving a stale clipping circle.
    const changed = () => { cancel(); finish(); };
    window.addEventListener("resize", changed);
    window.visualViewport?.addEventListener("resize", changed);
    window.visualViewport?.addEventListener("scroll", changed);
    return () => {
      cancel();
      delete element.dataset.motion;
      window.removeEventListener("resize", changed);
      window.visualViewport?.removeEventListener("resize", changed);
      window.visualViewport?.removeEventListener("scroll", changed);
    };
  }, [open, joining, trigger]);
  useLayoutEffect(() => {
    const element = dialog.current;
    return () => { element?.close(); resetTheme(); };
  }, []);
  return dialog;
}
