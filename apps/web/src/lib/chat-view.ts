import { codeKeySchema } from "@qr-chat/validation";
import { unwrapQrCode, type Venue } from "@qr-chat/domain";
export type { Venue, Session, Message, Group } from "@qr-chat/domain";

/** QR keys are opaque and case-sensitive, just like PostgreSQL's unique key. */
export function resolveCode(input: string, origin: string): Venue {
  const code = codeKeySchema.parse(unwrapQrCode(input, origin));
  return { id: code, name: code, label: "A conversation for this QR code.", codes: [code], kind: "place" };
}
