/** Follow the visible browser area without treating browser chrome or zoom as a keyboard. */
export function observeChatViewport(element: HTMLElement): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  let fullHeight = window.innerHeight;
  let width = window.innerWidth;
  let keyboardOpen = false;
  let frame = 0;
  let trackingUntil = 0;
  let focusFrame = 0;
  let restoreInput: (() => void) | undefined;
  const focusComposer = (event: PointerEvent) => {
    const input = event.target as HTMLInputElement;
    if (event.pointerType !== "touch" || !input.matches(".message-composer input") || document.activeElement === input || viewport.scale !== 1) return;
    event.preventDefault();
    // WebKit pans to the input's pre-keyboard position even with preventScroll.
    // Focus it outside the viewport, then restore it before the next paint.
    window.cancelAnimationFrame(focusFrame);
    restoreInput?.();
    const transform = input.style.transform;
    restoreInput = () => { input.style.transform = transform; restoreInput = undefined; };
    input.style.transform = `translateY(-${window.innerHeight * 2}px)`;
    input.focus({ preventScroll: true });
    focusFrame = window.requestAnimationFrame(() => { focusFrame = 0; restoreInput?.(); });
  };
  const update = () => {
    if (viewport.scale !== 1) return;
    const composerFocused = document.activeElement?.matches(".message-composer input") ?? false;
    if (width !== window.innerWidth) {
      width = window.innerWidth;
      fullHeight = window.innerHeight;
    } else if (!composerFocused && !keyboardOpen) {
      fullHeight = window.innerHeight;
    }
    const heightLost = Math.max(fullHeight, window.innerHeight) - viewport.height;
    // Keep the state through button taps and the keyboard's closing animation.
    keyboardOpen = heightLost > (keyboardOpen ? 80 : 120) && (composerFocused || keyboardOpen);
    // The composer already fits the resized chat. Safari's additional focus pan
    // moves the whole page; cancel it instead of chasing its animated offset.
    if ((composerFocused || keyboardOpen) && (window.scrollY || viewport.offsetTop)) window.scrollTo(0, 0);
    element.dataset.keyboard = keyboardOpen ? "open" : "closed";
    element.dataset.shortViewport = fullHeight <= 560 ? "true" : "false";
    element.style.setProperty("--app-height", `${viewport.height}px`);
    element.style.setProperty("--app-top", `${composerFocused || keyboardOpen ? 0 : viewport.offsetTop}px`);
  };
  const trackTransition = () => {
    frame = 0;
    update();
    if (performance.now() < trackingUntil) frame = window.requestAnimationFrame(trackTransition);
  };
  const changed = () => {
    update();
    // WebKit can begin its focus pan before delivering a scroll event.
    trackingUntil = performance.now() + 1000;
    if (!frame) frame = window.requestAnimationFrame(trackTransition);
  };
  update();
  // Resize the chat before Safari paints the shorter viewport.
  viewport.addEventListener("resize", changed);
  viewport.addEventListener("scroll", changed);
  window.addEventListener("resize", changed);
  window.addEventListener("scroll", changed);
  element.addEventListener("focusin", changed);
  element.addEventListener("focusout", changed);
  element.addEventListener("pointerdown", focusComposer);
  return () => {
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(focusFrame);
    restoreInput?.();
    viewport.removeEventListener("resize", changed);
    viewport.removeEventListener("scroll", changed);
    window.removeEventListener("resize", changed);
    window.removeEventListener("scroll", changed);
    element.removeEventListener("focusin", changed);
    element.removeEventListener("focusout", changed);
    element.removeEventListener("pointerdown", focusComposer);
    delete element.dataset.keyboard;
    delete element.dataset.shortViewport;
    element.style.removeProperty("--app-height");
    element.style.removeProperty("--app-top");
  };
}
