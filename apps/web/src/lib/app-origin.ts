/** The origin printed into QR codes: the public app URL when set (reachable from phones), else this page's. */
export function appOrigin() {
  return new URL(process.env.NEXT_PUBLIC_APP_URL || window.location.origin).origin;
}
