import { codeKeySchema } from '@qr-chat/validation';

/** Accept a QR handoff, never arbitrary navigation or OAuth credentials. */
export function codeFromLink(value: string | null, webOrigin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const native = url.protocol === 'qrchat:' && url.host === 'join' && (url.pathname === '' || url.pathname === '/');
    const web = (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === webOrigin && ['/', '/chats'].includes(url.pathname);
    if ((!native && !web) || url.username || url.password || url.hash || url.searchParams.getAll('code').length !== 1) return null;
    const parsed = codeKeySchema.safeParse(url.searchParams.get('code'));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
