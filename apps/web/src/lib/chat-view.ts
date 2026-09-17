import { codeKeySchema } from "@qr-chat/validation";
export type Venue = { id: string; name: string; label: string; codes: string[]; kind: string };
export type Session = { id: string; name: string; avatarUrl?: string | null; hidden: string[] };
export type Message = { id: string; user: string; name: string; text: string; time: number };
export type Group = { id: string; venue: Venue; members: { id: string; name: string }[]; messages: Message[]; nextCursor: number | null };

/** QR keys are opaque and case-sensitive, just like PostgreSQL's unique key. */
export function resolveCode(input: string, origin: string): Venue {
  let code = input;
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (url.origin === origin && url.searchParams.has("code")) code = url.searchParams.get("code")!;
  }
  code = codeKeySchema.parse(code);
  return { id: code, name: code, label: "A conversation for this QR code.", codes: [code], kind: "place" };
}
