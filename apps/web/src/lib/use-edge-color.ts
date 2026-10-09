import { useEffect } from "react";

export const HERO_COLOR = "#64717b";
/** The screen slide lasts 240ms; Safari ignores a strip mounted mid-transition, so mount it again after. */
const SETTLE_MS = 400;

/**
 * Safari 26 tints its top bar from the topmost fixed element at the top edge and keeps a stale tint
 * across client-side navigation. Mounting a fresh strip (again once the slide settles) makes it
 * re-sample; it sits above the header controls and the screen snapshot (z-index 20) so Safari sees it.
 */
export function useEdgeColor(color?: string | null) {
  useEffect(() => {
    const next = color ?? HERO_COLOR;
    const root = document.documentElement;
    let strip: HTMLSpanElement | undefined;
    const apply = () => {
      strip?.remove();
      strip = document.createElement("span");
      strip.setAttribute("aria-hidden", "true");
      strip.style.cssText = `position:fixed;top:0;left:0;right:0;height:12px;z-index:30;pointer-events:none;background:${next}`;
      document.body.append(strip);
    };
    root.style.setProperty("--edge-top", next);
    apply();
    const timer = window.setTimeout(apply, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      strip?.remove();
      root.style.removeProperty("--edge-top");
    };
  }, [color]);
}
