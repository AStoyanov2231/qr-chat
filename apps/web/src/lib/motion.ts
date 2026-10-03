export const motionEasing = "cubic-bezier(.22,.61,.36,1)";

/** Cancellation never runs completion; unavailable APIs complete synchronously. */
export function animateMotion(element: HTMLElement, frames: Keyframe[], duration: number, complete: () => void = () => {}) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") {
    complete();
    return () => {};
  }
  let current = true;
  let animation: Animation;
  try { animation = element.animate(frames, { duration, easing: motionEasing }); }
  catch { complete(); return () => {}; }
  const finish = () => {
    if (!current) return;
    current = false;
    window.clearTimeout(timeout);
    animation.cancel();
    complete();
  };
  // A backgrounded tab or interrupted animation must not strand a modal.
  const timeout = window.setTimeout(finish, duration + 100);
  void animation.finished.then(finish, finish);
  return () => {
    current = false;
    window.clearTimeout(timeout);
    animation.cancel();
  };
}

export function scannerCircle(trigger: DOMRect, panel: DOMRect) {
  const x = trigger.left + trigger.width / 2 - panel.left;
  const y = trigger.top + trigger.height / 2 - panel.top;
  const radius = Math.max(...[0, panel.width].flatMap(left => [0, panel.height].map(top => Math.hypot(x - left, y - top))));
  return {
    closed: `circle(${Math.min(trigger.width, trigger.height) / 2}px at ${x}px ${y}px)`,
    open: `circle(${radius}px at ${x}px ${y}px)`,
  };
}
