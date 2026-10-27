/** Read a design token at runtime, for APIs that can't take `var(--*)` (canvas, meta tags, QR colors). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
