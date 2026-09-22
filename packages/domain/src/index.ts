export type Venue = { id: string; name: string; label: string; codes: string[]; kind: string };
export type Session = { id: string; name: string; avatarUrl?: string | null; hidden: string[] };
export type Message = { id: string; user: string; name: string; text: string; time: number };
export type Group = { id: string; venue: Venue; members: { id: string; name: string }[]; messages: Message[]; nextCursor: number | null };

/** Only first-party QR handoff URLs are unwrapped. Other URLs remain opaque QR keys. */
export function unwrapQrCode(input: string, origin: string): string {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (url.origin === origin && url.searchParams.has("code")) return url.searchParams.get("code")!;
  }
  return input;
}

export function messageAge(time: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
