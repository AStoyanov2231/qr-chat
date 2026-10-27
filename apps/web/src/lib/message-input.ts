/** Enter sends; Shift+Enter (and IME composition) leave the key alone. */
export const sendsOnEnter = (event: { key: string; shiftKey: boolean; nativeEvent?: { isComposing?: boolean } }) =>
  event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing;

/** Within ~100px of the end of a scroll container: close enough to follow new messages. */
export const nearBottom = (el: { scrollHeight: number; scrollTop: number; clientHeight: number }) =>
  el.scrollHeight - el.scrollTop - el.clientHeight < 100;
